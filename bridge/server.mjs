import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { watchFile } from "node:fs";
import path from "node:path";
import process from "node:process";
import {atomicWrite, toLua} from './runtime.mjs';
import { NativePipeServer } from '../native/ipc/server.mjs';
import { SlotLedger } from '../native/ipc/slot-ledger.mjs';
import { assertRuntimeCompatible } from './compatibility.mjs';
import { syncMod } from './sync-mod.mjs';
import { requestRandomSentence } from './sentence.mjs';
import { createGenerationTimer, noteGeneratorLine } from './timing.mjs';
import { JobStore } from './job-store.mjs';
import { generationErrorCode } from './errors.mjs';
import { assertComfyUiReady } from './comfyui.mjs';

const root = path.resolve(import.meta.dirname, "..");
const fileEnv = await readEnv(path.join(root, ".env"));
const env = { ...fileEnv, ...process.env };
const port = Number(process.env.NEBIUS_BRIDGE_PORT || 3000);
const generator = env.NEBIUS_GENERATOR_SCRIPT
  ? path.resolve(root, env.NEBIUS_GENERATOR_SCRIPT)
  : path.join(import.meta.dirname, "generate.mjs");
const modDirectory = env.ISAAC_MOD_DIRECTORY
  ? path.resolve(root, env.ISAAC_MOD_DIRECTORY)
  : path.join(root, "demo", "live-sprite-swap");
const isaacLog = env.ISAAC_LOG_FILE || path.join(
  process.env.USERPROFILE || "", "Documents", "My Games", "Binding of Isaac Repentance+", "log.txt",
);
const jobs = new Map();
const jobTimers = new WeakMap();
const jobChildren = new WeakMap();
let activeJob = null;
const finishingJobs = new WeakSet();
const slotLedger = new SlotLedger(path.join(modDirectory, 'art-reservations.json'));
let gameContext = null;
let gameContextAt = 0;
let statusWrites = Promise.resolve();
let errorWrites = Promise.resolve();
let timingWrites = Promise.resolve();
const nativePipe = new NativePipeServer({ seedHello: true, canDeliver: envelope => matchesCurrentRun(jobs.get(envelope.id), true) });
const outputDirectory = env.NEBIUS_OUTPUT_DIRECTORY
  ? path.resolve(root, env.NEBIUS_OUTPUT_DIRECTORY)
  : path.join(root, 'runtime', 'generated');
// Isaac caches failed include() calls. One fresh module name is consumed each
// second, so this covers the bridge's 370-second in-game timeout with margin.
const GAME_MODULE_SLOT_COUNT = 400;
const GENERATED_ITEM_CAPACITY = 128;
const GENERATED_ACTIVE_CAPACITY = 8;
const jobStore = new JobStore(path.join(outputDirectory, 'job-journal.json'));
const recoveryNotices = new Map();
const missingRequests = new Map();
let capacityNotice=null;
function matchesCurrentRun(job, allowCapacity = false) {
  const blocked = gameContext?.blocked;
  const capacityOnly = allowCapacity && typeof blocked === 'string' && /^(Item|Artwork) limit reached: 128\/128\./.test(blocked);
  return Boolean(job && gameContext && (!blocked || capacityOnly) && gameContext.ended_run !== true &&
    Date.now() - gameContextAt <= 5000 && job.run === gameContext.run &&
    (job.saveSlot === undefined || job.saveSlot === gameContext.save_slot));
}
function trimJobs() {
  for (const [id,job] of jobs) {
    if (jobs.size<=256) break;
    if (job.state==="applied" || job.state==="failed" || (job.kind==="sentence" && job.completedAt)) jobs.delete(id);
  }
  for (const map of [missingRequests,recoveryNotices]) while(map.size>256) map.delete(map.keys().next().value);
}

function recoverQueued(context) {
  if (!context?.run) return;
  try { assertRuntimeCompatible(context); } catch { return; }
  const ledger=slotLedger.data;
  const protectedArt=new Set([...(ledger.used || []),...(ledger.legacy || []),...Object.values(ledger.manifests || {}).flatMap(manifest=>manifest.used)]);
  const noticeKey=context.run+":"+protectedArt.size;
  if (capacityNotice!==noticeKey) { publishStatus(context.run+"_capacity","capacity",String(protectedArt.size)); capacityNotice=noticeKey; }
  for (const id of Array.isArray(context.pending) ? context.pending.slice(0,GENERATED_ITEM_CAPACITY) : []) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || !id.startsWith(context.run + "_")) continue;
    const record=jobStore.records.get(id);
    if (!record && !missingRequests.has(id)) missingRequests.set(id,Date.now());
    const missing=!record && Date.now()-missingRequests.get(id)>5000;
    const notice=record?.state === "failed" ? (record.error || "Generation was interrupted. Retry your prompt.") : (missing ? "Request was not received by the bridge. Retry your prompt." : null);
    if (notice && recoveryNotices.get(id)!==notice) { publishStatus(id,"error",notice.slice(0,500)); recoveryNotices.set(id,notice); }
  }
  for (const record of jobStore.records.values()) {
    if (record.state !== 'queued') continue;
    if ((context.ended_run === true && record.run === context.run) || (context.fresh_run === true && record.saveSlot === context.save_slot && record.run !== context.run)) {
      nativePipe.discard(record.id);
      const failed = { ...record, state:'failed', status:'error', errorCode:'STALE_RUN', error:'Run ended before item application.' };
      jobStore.put(failed);
      jobs.set(record.id,failed);
      continue;
    }
    if (!matchesCurrentRun(record, true)) { nativePipe.discard(record.id); continue; }
    try { nativePipe.publish(record.envelope); }
    catch (error) { console.warn('Queued delivery is waiting:', error.message); }
  }
  trimJobs();
}

function errorCategory(detail) {
  if (/timed out|timeout/i.test(detail)) return 'timeout';
  if (/ComfyUI|artwork|image|checkpoint/i.test(detail)) return 'art';
  if (/schema|profile|invalid|parse|JSON/i.test(detail)) return 'validation';
  if (/another request|limit|slot|reservation/i.test(detail)) return 'capacity';
  if (/connect|unavailable|bridge|pipe|network/i.test(detail)) return 'connection';
  return 'generation';
}

function logError({ id, phase, category, detail, source = 'bridge' }) {
  const entry = { time: new Date().toISOString(), id, phase, category,
    detail: String(detail).slice(0, 1000), source };
  errorWrites = errorWrites.then(async () => {
    await mkdir(outputDirectory, { recursive: true });
    await appendFile(path.join(outputDirectory, 'generation-errors.jsonl'), JSON.stringify(entry) + '\n');
  }).catch(error => console.error('Error log write failed:', error.message));
}

function logTiming(job, error) {
  const timer = jobTimers.get(job);
  if (!timer) return;
  const timing = timer.finish();
  const entry = {
    time: new Date().toISOString(), id: job.id, kind: job.kind || 'item',
    outcome: error ? 'error' : job.status, duration_ms: timing.duration_ms,
    stages: timing.stages, totals_ms: timing.totals_ms,
  };
  if (Number.isInteger(job.quality)) entry.quality = job.quality;
  if (Number.isInteger(job.promptChars)) entry.prompt_chars = job.promptChars;
  if (job.stage) entry.last_stage = job.stage;
  if (error) entry.error = String(error).slice(0, 500);
  const stages = Object.entries(timing.totals_ms).map(([name, ms]) => `${name}=${ms}`).join(' ');
  console.log(`Job ${job.id}: ${timing.duration_ms}ms ${stages}`);
  timingWrites = timingWrites.then(async () => {
    await mkdir(outputDirectory, { recursive: true });
    await appendFile(path.join(outputDirectory, 'generation-timings.jsonl'), JSON.stringify(entry) + '\n');
  }).catch(writeError => console.error('Timing log write failed:', writeError.message));
}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) reject(new Error("Request body exceeds 4096 characters."));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return send(response, 200, { status: "ok", service: "nebius-isaac-bridge" });
  }

  const jobMatch = request.url?.match(/^\/jobs\/([a-zA-Z0-9_-]+)$/);
  if (request.method === "GET" && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    return job ? send(response, 200, job) : send(response, 404, { status: "missing" });
  }

  if (request.method !== "POST" || request.url !== "/generate") {
    return send(response, 404, { error: "Not found" });
  }

  try {
    const input = JSON.parse(await readBody(request));
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    const auto = input.auto === true;
    if ((!auto && !prompt) || prompt.length > 2000) return send(response, 400, { error: "prompt must contain 1–2000 characters" });

    const quality = Number.isInteger(input.quality) && input.quality >= 0 && input.quality <= 4 ? input.quality : 3;
    const job = startJob(prompt, undefined, false, quality, input.delivery, input.item_type, auto);
    send(response, 202, job);
  } catch (error) {
    return send(response, 400, { error: error.message || "Invalid request" });
  }
});

function startSentence(id) {
  if (activeJob) throw Error('Another request is running. Wait until it finishes.');
  if (!gameContext || Date.now() - gameContextAt > 5000) throw Error('Open an active run in the updated mod before generating.');
  assertRuntimeCompatible(gameContext);
  if (!id.startsWith(gameContext.run + '_')) throw Error('Sentence request is from another run.');
  const job = { id, status: 'generating', kind: 'sentence', createdAt: new Date().toISOString() };
  jobTimers.set(job, createGenerationTimer(Date.now(), 'sentence'));
  activeJob = job;
  jobs.set(id, job);
  publishStatus(id, 'generating', 'Writing a random sentence...');
  const timeout = setTimeout(() => finishSentence(job, 'The random sentence timed out. Try again.'), 100000);
  requestRandomSentence(env).then(
    (sentence) => finishSentence(job, null, sentence, timeout),
    (error) => finishSentence(job, error.message, null, timeout),
  );
  return job;
}

function finishSentence(job, error, sentence, timeout) {
  if (job.completedAt) return;
  if (timeout) clearTimeout(timeout);
  job.completedAt = new Date().toISOString();
  if (activeJob === job) activeJob = null;
  if (error) {
    job.status = 'error';
    job.error = error;
    publishStatus(job.id, 'error', error.slice(0, 500));
    console.log(`Job ${job.id}: error - ${error}`);
  } else {
    job.status = 'ready';
    job.sentence = sentence;
    publishStatus(job.id, 'sentence', sentence);
    console.log(`Job ${job.id}: sentence`);
  }
  logTiming(job, error);
  trimJobs();
}

const ACTIVES_ENABLED = false;

function startJob(prompt, id, writeGameStatus = false, quality = 3, delivery, itemType = "passive", auto = false) {
  if(activeJob) throw Error('Another request is running. Wait until it finishes.');
  if (!gameContext || Date.now() - gameContextAt > 5000) throw Error('Open an active run in the updated mod before generating.');
  assertRuntimeCompatible(gameContext);
  if (!["passive","active"].includes(itemType)) throw Error("Invalid item type.");
  if (!ACTIVES_ENABLED && itemType === "active" && !(auto === true && delivery?.mode === "generator")) throw Error("Active generation is vaulted. Generate a passive item.");
  if (itemType === "active" && (!Number.isInteger(gameContext.active_count) || gameContext.active_count >= GENERATED_ACTIVE_CAPACITY || gameContext.active_available !== true)) throw Error(`Active shell capacity unavailable or full (${GENERATED_ACTIVE_CAPACITY}/${GENERATED_ACTIVE_CAPACITY}).`);
  if (auto !== true && (!prompt || !prompt.trim())) throw Error("prompt must contain 1–2000 characters");
  if (id === undefined) id = gameContext.run + '_' + randomUUID().slice(0, 99 - gameContext.run.length);
  if (!id.startsWith(gameContext.run + '_')) throw Error('Generation request is from another run.');
  if (jobs.has(id)) return jobs.get(id);
  if (delivery !== undefined) {
    const keys = Object.keys(delivery || {});
    const ownerOk = typeof delivery?.owner === "string" && /^-?\d{1,40}$/.test(delivery.owner);
    const blank = delivery?.mode === "blank" && ownerOk && keys.every((key) => key === "mode" || key === "owner");
    const generatorDelivery = delivery?.mode === "generator" && auto === true && ownerOk && delivery.quality === quality && keys.every((key) => key === "mode" || key === "owner" || key === "quality");
    const singularityDelivery = delivery?.mode === "singularity" && auto === true && ownerOk && delivery.quality === quality && keys.every((key) => key === "mode" || key === "owner" || key === "quality");
    if (!blank && !generatorDelivery && !singularityDelivery) throw Error("Invalid item delivery request.");
  }
  const job = { id, run: gameContext.run, saveSlot:gameContext.save_slot, state: 'received', status: "generating", quality, delivery, itemType, promptChars: auto === true ? 0 : prompt.length, createdAt: new Date().toISOString() };
  if (auto === true) job.auto = true;
  else job.prompt = prompt;
  jobStore.put(job);
  job.state="preflight"; jobStore.put(job);
  jobTimers.set(job, createGenerationTimer());
  activeJob = job;
  jobs.set(id, job);
  publishStatus(id, 'generating', 'Bridge received the prompt. Designing the passive item...');
  if (writeGameStatus) writeGameBridgeStatus(job);
  prepareJob(job, prompt, writeGameStatus).catch(error => finishJob(job, error.message, writeGameStatus));
  return job;
}

function spawnGenerator(job, args, writeGameStatus, finishOnClose) {
  const child = spawn(process.execPath, [generator, ...args], {
    cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  jobChildren.set(job, child);
  let output = "";
  let pending = "";
  child.stdout.on("data", (chunk) => {
    if (job.completedAt) return;
    output = (output + chunk).slice(-8000);
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      const stage = noteGeneratorLine(jobTimers.get(job), line);
      if (!stage) continue;
      job.stage = stage;
      job.state = ["image", "art", "familiar_art", "familiar_anim"].includes(stage) ? "rendering" : (stage === "publish" ? "validating" : "designing");
      try { jobStore.put(job); } catch (error) { child.kill(); finishJob(job, error.message, writeGameStatus); return; }
      publishStatus(job.id, "generating", "Generating passive item: " + job.stage);
      if (writeGameStatus) writeGameBridgeStatus(job);
      console.log(`Job ${job.id}: ${job.stage}`);
    }
  });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-8000); });
  const closed = new Promise((resolve) => {
    child.on("error", (error) => { finishJob(job, error.message, writeGameStatus); resolve(); });
    child.on("close", (code) => {
      if (job.completedAt) { resolve(); return; }
      if (code === 0 && !finishOnClose) { resolve(); return; }
      finishJob(job, code === 0 ? null : output.trim().slice(-500) || `Generator exited with code ${code}.`, writeGameStatus);
      resolve();
    });
  });
  const deadline = setTimeout(() => { child.kill(); finishJob(job, "Generation timed out. Retry with a simpler prompt.", writeGameStatus); }, 350000);
  child.on("close", () => clearTimeout(deadline));
  return closed;
}

async function prepareJob(job, prompt, writeGameStatus) {
  if ((env.IMAGE_BACKEND || 'comfyui') === 'comfyui') await assertComfyUiReady(env.COMFYUI_URL || 'http://127.0.0.1:8188');
  if (job.completedAt) return;
  if (!matchesCurrentRun(job)) throw Error('Run ended or changed before generation started.');
  assertRuntimeCompatible(gameContext);
  if (job.auto) {
    const designPath = path.join(outputDirectory, `design-${job.id}.json`);
    await spawnGenerator(job, ["--auto", "--design-only", "--no-image", "--quality", String(job.quality), "--request-id", job.id, "--item-type", job.itemType, "--design-out", designPath], writeGameStatus, false);
    if (job.completedAt) return;
    if (!matchesCurrentRun(job)) throw Error('Run ended or changed before artwork reservation.');
    assertRuntimeCompatible(gameContext);
    job.artSlot = slotLedger.reserve(gameContext);
    job.state = 'reserved';
    jobStore.put(job);
    await spawnGenerator(job, ["--render-only", "--quality", String(job.quality), "--request-id", job.id, "--item-type", job.itemType, "--design-in", designPath, "--art-slot", String(job.artSlot)], writeGameStatus, true);
    return;
  }
  job.artSlot = slotLedger.reserve(gameContext);
  job.state = 'reserved';
  jobStore.put(job);
  await spawnGenerator(job, ["--prompt", prompt, "--quality", String(job.quality), "--request-id", job.id, "--art-slot", String(job.artSlot), "--item-type", job.itemType], writeGameStatus, true);
}

async function finishJob(job, error, writeGameStatus) {
  if (job.completedAt || finishingJobs.has(job)) return;
  finishingJobs.add(job);
  if (!error) {
    jobTimers.get(job)?.mark('deliver');
    try {
      if (!matchesCurrentRun(job)) throw Error('Run ended or changed before generation completed.');
      assertRuntimeCompatible(gameContext);
      await publishNativeProfile(job);
    } catch (publishError) {
      error = `Native profile publish failed: ${publishError.message}`;
    }
  }
  if (job.completedAt) { finishingJobs.delete(job); return; }
  job.status = error ? "error" : "queued";
  job.state = error ? 'failed' : 'queued';
  if (error) { job.error = error; job.errorCode = job.errorCode || generationErrorCode(error); }
  job.completedAt = new Date().toISOString();
  try { jobStore.put(job); }
  catch (storeError) { console.error('Job journal could not be updated:', storeError.message); }
  if (activeJob === job) activeJob = null;
  finishingJobs.delete(job);
  if (error) publishStatus(job.id, 'error', error.slice(0, 500));
  console.log(`Job ${job.id}: ${job.status}${error ? ' - ' + error : ''}`);
  logTiming(job, error);
  if (writeGameStatus) writeGameBridgeStatus(job);
  trimJobs();
}

function publishStatus(id, status, detail) {
  if (status === 'error') {
    const job = jobs.get(id);
    logError({ id, phase: job?.stage || job?.kind || 'request',
      category: errorCategory(detail), detail });
  }
  try { nativePipe.publish({ version: 1, type: 'status', id, status, detail, ...(status==='error' ? {error_code:jobs.get(id)?.errorCode || generationErrorCode(detail)} : {}) }); }
  catch (error) { console.warn('Native IPC status skipped: ' + error.message); }
}

async function publishNativeProfile(job) {
  const file = path.join(outputDirectory, 'item-profile.json');
  const profile = JSON.parse(await readFile(file, 'utf8'));
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw Error('generated profile is not an object');
  }
  if (profile.version !== 1 || profile.bridge_request_id !== job.id) {
    throw Error('generated profile does not belong to this request');
  }
  if (job.completedAt) throw Error('Request cancelled before publication.');
  if (!matchesCurrentRun(job)) throw Error('Run ended or changed before profile publication.');
  assertRuntimeCompatible(gameContext);
  const envelope = { version: 1, type: 'profile', id: job.id, profile };
  if (job.delivery) envelope.delivery = job.delivery;
  job.state = 'queued';
  jobStore.put(job, envelope);
  try { nativePipe.publish(envelope); }
  catch(error) { console.warn("Durable delivery is waiting for IPC capacity:",error.message); }
  console.log(`Native IPC profile published: ${job.id}`);
}

async function writeGameBridgeStatus(job) {
  const contents = 'return ' + toLua(job) + '\n';
  // Pre-publish every future poll slot. A slot already included by Isaac is
  // immutable in its cache; a later unused slot exposes the newest snapshot.
  statusWrites = statusWrites.then(async () => {
    await Promise.all(Array.from({ length: GAME_MODULE_SLOT_COUNT }, (_, index) =>
      atomicWrite(path.join(modDirectory, `bridge_status_${job.id}_slot_${index + 1}.lua`), contents),
    ));
    await atomicWrite(path.join(modDirectory, `bridge_status_${job.id}.json`), JSON.stringify(job));
  }).catch(error => console.error('Status write failed:', error.message));
  return statusWrites;
}

async function watchIsaacLog() {
  try {
    let offset = await stat(isaacLog).then(s=>s.size).catch(()=>0);
    let busy = false, remainder = Buffer.alloc(0);
    watchFile(isaacLog, { interval: 300 }, async (current) => {
      if(busy) return;
      if (current.size < offset) {offset = 0; remainder = Buffer.alloc(0);}
      if (current.size === offset) return;
      busy = true;
      try {
      const handle = await readFile(isaacLog);
      const appended = Buffer.concat([remainder, handle.subarray(offset)]);
      offset = handle.length;
      const end = appended.lastIndexOf(10);
      remainder = appended.subarray(end+1);
      for (const line of appended.subarray(0,end+1).toString('utf8').split(/\r?\n/)) {
        const rejection=line.match(/\[NebiusBridge\] rejected (\{.*\})/);
        if (rejection) {
          try {
            const input=JSON.parse(rejection[1]); const job=jobs.get(input.id);
            if (job?.state==="queued" && job.run===gameContext?.run) {
              const failed={...job,state:"failed",status:"error",errorCode:"DELIVERY_REJECTED",error:String(input.reason || "Isaac rejected the delivery.").slice(0,500)};
              jobStore.put(failed); Object.assign(job,failed); nativePipe.discard(job.id);
              logError({id:job.id,phase:"delivery",category:"delivery",detail:failed.error,source:"game"});
            }
          } catch(error) { console.warn("Could not save delivery rejection:",error.message); }
          continue;
        }
        const cancellation=line.match(/\[NebiusBridge\] cancel (\{.*\})/);
        if (cancellation) {
          try {
            const {id}=JSON.parse(cancellation[1]); const job=jobs.get(id);
            if (typeof id==="string" && gameContext?.run && id.startsWith(gameContext.run+"_") && job && !["applied","failed"].includes(job.state)) {
              const failed={...job,state:"failed",status:"error",errorCode:"CANCELLED",error:job.delivery?.mode==="generator" ? "Request cancelled. Generator kept." : job.delivery?.mode==="singularity" ? "Singularity reward cancelled; recharge the asset." : "Request cancelled. AI Item kept.",completedAt:new Date().toISOString()};
              jobStore.put(failed);
              Object.assign(job,failed);
              nativePipe.discard(id); jobChildren.get(job)?.kill();
              if (activeJob===job) activeJob=null;
              publishStatus(id,"error",job.error);
            }
          } catch(error) { console.warn("Could not cancel request:",error.message); }
          continue;
        }
        const uiError = line.match(/\[NebiusBridge\] error (\{.*\})/);
        if (uiError) {
          try {
            const event = JSON.parse(uiError[1]);
            logError({ id: String(event.id || 'ui').slice(0, 100),
              phase: String(event.phase || 'ui').slice(0, 50),
              category: String(event.category || 'ui').slice(0, 50),
              detail: event.detail || '', source: 'game' });
          } catch { /* Ignore malformed diagnostic lines. */ }
          continue;
        }
        const state = line.match(/\[NebiusBridge\] state (\{.*\})/);
        if (state) {
          try {
            gameContext = JSON.parse(state[1]); gameContextAt = Date.now();
            try { assertRuntimeCompatible(gameContext); slotLedger.observe(gameContext); }
            catch (error) { gameContext.blocked=error.message; }
            recoverQueued(gameContext);
          } catch {}
          continue;
        }
        const sentenceMatch = line.match(/\[NebiusBridge\] sentence (\{.*\})/);
        if (sentenceMatch) {
          try {
            const input = JSON.parse(sentenceMatch[1]);
            const id = typeof input.id === "string" ? input.id : "";
            if (/^[a-zA-Z0-9_-]{1,100}$/.test(id) && !jobs.has(id)) {
              if (activeJob) publishStatus(id, 'error', 'Another request is running. Wait until it finishes.');
              else {
                try { startSentence(id); }
                catch (error) { publishStatus(id, 'error', error.message.slice(0, 500)); }
              }
            }
          } catch { /* Ignore malformed log lines. */ }
          continue;
        }
        const match = line.match(/\[NebiusBridge\] generate (\{.*\})/);
        if (!match) continue;
        try {
          const input = JSON.parse(match[1]);
          const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
          const id = typeof input.id === "string" ? input.id : "";
          const quality = Number.isInteger(input.quality) && input.quality >= 0 && input.quality <= 4 ? input.quality : 3;
          const auto = input.auto === true;
          if (/^[a-zA-Z0-9_-]{1,100}$/.test(id) && ((auto && prompt.length <= 2000) || (prompt && prompt.length <= 2000)) && !jobs.has(id)) {
            if(activeJob) publishStatus(id, 'error', 'Another request is running. Wait until it finishes.');
            else {
              try {
                if (!gameContext?.run || !id.startsWith(gameContext.run+'_')) throw Error('Generation request is from another run.');
                startJob(prompt, id, false, quality, input.delivery, input.item_type, auto);
              }
              catch (error) { publishStatus(id, 'error', error.message.slice(0,500)); }
            }
          }
        } catch { /* Ignore malformed log lines. */ }
      }
      } catch(error) {console.error('Log read failed:',error.message);} finally {busy=false;}
    });
    console.log(`Watching Isaac prompt handoff at ${isaacLog}`);
  } catch {
    console.warn(`Isaac log was not found at ${isaacLog}; in-game generation will wait until it exists.`);
  }
}

async function readEnv(file) {
  const values = {};
  try {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index > 0 && !line.trimStart().startsWith("#")) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return values;
}

const modSource = path.join(root, "demo", "live-sprite-swap");
try {
  const synced = await syncMod(modSource, modDirectory);
  if (synced.skipped) console.log("Isaac mod directory is the repository copy.");
  else console.log(`Updated Isaac mod (${synced.copied.length} files) at ${modDirectory}. Restart Isaac to load Lua changes.`);
} catch (error) {
  console.error(`Could not update the installed mod at ${modDirectory}: ${error.message}`);
}

server.on("error", async (error) => {
  if (error.code !== "EADDRINUSE") {
    console.error(`Bridge could not start: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    const health = await response.json();
    if (response.ok && health.status === "ok" && health.service === "nebius-isaac-bridge") {
      console.log(`Nebius Isaac bridge is already running at http://127.0.0.1:${port}. No second instance is needed.`);
      return;
    }
  } catch { /* The occupied port does not respond like a bridge. */ }
  console.error(`Port ${port} is already in use by another service. Set NEBIUS_BRIDGE_PORT or stop that service.`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  try { for (const job of jobStore.recover()) jobs.set(job.id, job); }
  catch (error) { console.error('Job recovery failed:', error.message); server.close(); process.exitCode = 1; return; }
  console.log(`Nebius Isaac bridge listening at http://127.0.0.1:${port}`);
  watchIsaacLog();
  nativePipe.start(env.NEBIUS_PIPE_NAME).then(() => {
    console.log('Native IPC pipe ready at \\.\\pipe\\nebius_isaac_bridge_v1');
  }).catch((error) => {
    console.error(`Native IPC pipe could not start: ${error.message}`);
  });
});

nativePipe.on('ack', (id) => {
  const job = jobs.get(id);
  if (job?.state === 'queued') {
    const applied = { ...job, state: 'applied', status: 'applied', appliedAt: new Date().toISOString() };
    jobStore.put(applied);
    Object.assign(job, applied);
    const delivery = { id, applied_at: job.appliedAt, delivery_ms: job.completedAt ? Date.parse(job.appliedAt) - Date.parse(job.completedAt) : null };
    timingWrites = timingWrites.then(async () => {
      await mkdir(outputDirectory, { recursive: true });
      await appendFile(path.join(outputDirectory, 'generation-deliveries.jsonl'), JSON.stringify(delivery) + '\n');
    }).catch(error => console.error('Delivery log write failed:', error.message));
  }
  console.log(`Native IPC acknowledgement: ${id}`);
});

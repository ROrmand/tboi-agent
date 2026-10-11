import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { watchFile } from "node:fs";
import path from "node:path";
import process from "node:process";
import {atomicWrite, toLua} from './runtime.mjs';
import { NativePipeServer } from '../native/ipc/server.mjs';

const root = path.resolve(import.meta.dirname, "..");
const fileEnv = await readEnv(path.join(root, ".env"));
const env = { ...fileEnv, ...process.env };
const port = Number(process.env.NEBIUS_BRIDGE_PORT || 3000);
const generator = path.join(import.meta.dirname, "generate.mjs");
const modDirectory = env.ISAAC_MOD_DIRECTORY
  ? path.resolve(root, env.ISAAC_MOD_DIRECTORY)
  : path.join(root, "demo", "live-sprite-swap");
const isaacLog = env.ISAAC_LOG_FILE || path.join(
  process.env.USERPROFILE || "", "Documents", "My Games", "Binding of Isaac Repentance+", "log.txt",
);
const jobs = new Map();
let activeJob = null;
let finishingJob = false;
let nextArtSlot = 0;
let statusWrites = Promise.resolve();
const nativePipe = new NativePipeServer({ seedHello: true });
const outputDirectory = env.NEBIUS_OUTPUT_DIRECTORY
  ? path.resolve(root, env.NEBIUS_OUTPUT_DIRECTORY)
  : path.join(root, 'runtime', 'generated');
// Isaac caches failed include() calls. One fresh module name is consumed each
// second, so this covers the bridge's 370-second in-game timeout with margin.
const GAME_MODULE_SLOT_COUNT = 400;

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
    return send(response, 200, { status: "ok" });
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
    if (!prompt || prompt.length > 2000) return send(response, 400, { error: "prompt must contain 1–2000 characters" });

    const job = startJob(prompt);
    send(response, 202, job);
  } catch (error) {
    return send(response, 400, { error: error.message || "Invalid request" });
  }
});

function startJob(prompt, id = randomUUID(), writeGameStatus = false) {
  if(activeJob) throw Error('Another item is generating. Wait for it to finish.');
  if (nextArtSlot >= 64) throw Error('All artwork slots used. Restart both Isaac and the bridge before generating again.');
  const job = { id, status: "generating", createdAt: new Date().toISOString() };
  activeJob = job;
  jobs.set(id, job);
  publishStatus(id, 'generating', 'Bridge received the prompt. Designing the passive item...');
  if (writeGameStatus) writeGameBridgeStatus(job);
  const child = spawn(process.execPath, [generator, "--prompt", prompt, "--request-id", id, "--art-slot", String(nextArtSlot++)], {
    cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let output = "";
  let pending = '';
  child.stdout.on("data", (chunk) => {
    output = (output + chunk).slice(-8000);
    pending += chunk;
    const lines = pending.split('\n'); pending = lines.pop();
    for(const line of lines) if(line.startsWith('@stage ')) {
      job.stage = line.slice(7).trim();
      publishStatus(id, 'generating', 'Generating passive item: ' + job.stage);
      if(writeGameStatus) writeGameBridgeStatus(job);
      console.log(`Job ${id}: ${job.stage}`);
    }
  });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("error", (error) => finishJob(job, error.message, writeGameStatus));
  child.on("close", (code) => finishJob(job, code === 0 ? null : output.trim().slice(-500) || `Generator exited with code ${code}.`, writeGameStatus));
  const deadline = setTimeout(() => {child.kill(); finishJob(job, 'Generation timed out. Retry with a simpler prompt.', writeGameStatus);}, 350000);
  child.on('close', () => clearTimeout(deadline));
  return job;
}

async function finishJob(job, error, writeGameStatus) {
  if (job.completedAt || finishingJob) return;
  finishingJob = true;
  if (!error) {
    try {
      await publishNativeProfile(job);
    } catch (publishError) {
      error = `Native profile publish failed: ${publishError.message}`;
    }
  }
  job.status = error ? "error" : "ready";
  if (error) job.error = error;
  job.completedAt = new Date().toISOString();
  activeJob = null;
  finishingJob = false;
  if (error) publishStatus(job.id, 'error', error.slice(0, 500));
  console.log(`Job ${job.id}: ${job.status}${error ? ' - ' + error : ''}`);
  if (writeGameStatus) writeGameBridgeStatus(job);
}

function publishStatus(id, status, detail) {
  try { nativePipe.publish({ version: 1, type: 'status', id, status, detail }); }
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
  nativePipe.publish({ version: 1, type: 'profile', id: job.id, profile });
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
        const match = line.match(/\[NebiusBridge\] generate (\{.*\})/);
        if (!match) continue;
        try {
          const input = JSON.parse(match[1]);
          const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
          const id = typeof input.id === "string" ? input.id : "";
          if (/^[a-zA-Z0-9_-]{1,100}$/.test(id) && prompt && prompt.length <= 2000 && !jobs.has(id)) {
            if(activeJob) publishStatus(id, 'error', 'Another item is generating. Wait until it finishes.');
            else startJob(prompt, id);
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

server.listen(port, "127.0.0.1", () => {
  console.log(`Nebius Isaac bridge listening at http://127.0.0.1:${port}`);
  watchIsaacLog();
});

nativePipe.start().then(() => {
  console.log('Native IPC pipe ready at \\.\\pipe\\nebius_isaac_bridge_v1');
}).catch((error) => {
  console.error(`Native IPC pipe could not start: ${error.message}`);
});

nativePipe.on('ack', (id) => console.log(`Native IPC acknowledgement: ${id}`));

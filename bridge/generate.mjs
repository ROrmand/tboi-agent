import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { atomicWrite, makeIcon, validateSchema, toLua } from './runtime.mjs';
import { generateComfyImage } from "./comfyui.mjs";

const GAME_MODULE_SLOT_COUNT = 400;

const root = path.resolve(import.meta.dirname, "..");
const env = { ...await readEnv(path.join(root, ".env")), ...process.env };
const capabilities = JSON.parse(
  await readFile(path.join(root, "content-contract", "capabilities.json"), "utf8"),
);
const outputDirectory = env.NEBIUS_OUTPUT_DIRECTORY || path.join(root, "runtime", "generated");
const modDirectory = env.ISAAC_MOD_DIRECTORY
  ? path.resolve(root, env.ISAAC_MOD_DIRECTORY)
  : path.join(root, "demo", "live-sprite-swap");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noImage = args.includes("--no-image");
const prompt = readOption("--prompt") || args.filter((value) => !value.startsWith("--")).join(" ");
const requestId = readOption("--request-id");

if (!prompt && !dryRun) {
  fail('Usage: npm run generate -- --prompt "A cursed nail that poisons enemies"');
}

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["metadata", "stats", "tear_profile", "visuals", "rules"],
  properties: {
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["display_name", "description", "quality", "theme", "balance_note"],
      properties: {
        display_name: { type: "string", minLength: 1, maxLength: 32 },
        description: { type: "string", minLength: 1, maxLength: 64 },
        quality: { type: "integer", minimum: 0, maximum: 4 },
        theme: { type: "string", enum: ["cursed", "angelic", "tech", "gross", "cosmic", "none"] },
        balance_note: { type: "string", maxLength: 256 },
      },
    },
    stats: {
      type: "object",
      additionalProperties: false,
      required: ["damage", "tears", "shot_speed", "range", "speed", "luck", "soul_hearts"],
      properties: {
        damage: { type: "number", minimum: -10, maximum: 15 },
        tears: { type: "number", minimum: -5, maximum: 10 },
        shot_speed: { type: "number", minimum: -1, maximum: 1.5 },
        range: { type: "number", minimum: -10, maximum: 20 },
        speed: { type: "number", minimum: -1, maximum: 0.5 },
        luck: { type: "number", minimum: -5, maximum: 10 },
        soul_hearts: { type: "integer", minimum: 0, maximum: 4 },
      },
    },
    tear_profile: {
      type: "object",
      additionalProperties: false,
      required: ["flags", "color", "scale"],
      properties: {
        flags: { type: "array", maxItems: 3, items: { type: "string", enum: capabilities.tear_flags } },
        color: {
          type: "object",
          additionalProperties: false,
          required: ["r", "g", "b", "a"],
          properties: {
            r: { type: "number", minimum: 0, maximum: 1 },
            g: { type: "number", minimum: 0, maximum: 1 },
            b: { type: "number", minimum: 0, maximum: 1 },
            a: { type: "number", minimum: 0, maximum: 1 },
          },
        },
        scale: { type: "number", minimum: 0.5, maximum: 2 },
      },
    },
    visuals: {
      type: "object",
      additionalProperties: false,
      required: ["pedestal_prompt"],
      properties: { pedestal_prompt: { type: "string", minLength: 1, maxLength: 500 } },
    },
    rules: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["trigger", "conditions", "actions"],
        properties: {
          trigger: { type: "string", enum: capabilities.triggers },
          conditions: {
            type: "array",
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type"],
              properties: {
                type: { type: "string", enum: capabilities.conditions },
                chance: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
          actions: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "amount"],
              properties: {
                type: { type: "string", enum: capabilities.actions },
                amount: { type: "integer", minimum: 1, maximum: 4 },
                pickup_type: { type: "string", enum: capabilities.pickup_types },
              },
            },
          },
        },
      },
    },
  },
};

const fixture = {
  metadata: { display_name: "Ashen Nail", description: "Poisons from beyond", quality: 2, theme: "cursed", balance_note: "" },
  stats: { damage: 0.4, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0 },
  tear_profile: { flags: ["poison"], color: { r: 0.3, g: 0.75, b: 0.35, a: 1 }, scale: 1 },
  visuals: { pedestal_prompt: "single rusty iron nail, cursed sickly green glint, pixel art game icon, centered object, plain transparent background, no text" },
  rules: [{ trigger: "room_clear", conditions: [{ type: "chance", chance: 0.2 }, { type: "once_per_room" }], actions: [{ type: "spawn_pickup", pickup_type: "coin", amount: 1 }] }],
};

try {
  const profile = dryRun ? fixture : await generateProfile(prompt);
  validateProfile(profile);
  await writeOutputs(profile, noImage);
  console.log(`Generated ${profile.metadata.display_name}. Run agent generated in Isaac to load it.`);
} catch(error) { console.error(`Generation failed: ${error.message}`); process.exitCode = 1; }

function progress(stage) { console.log('@stage ' + stage); }

async function generateProfile(playerPrompt) {
  requireSetting("NEBIUS_API_KEY");
  requireSetting("NEBIUS_TEXT_MODEL");
  let correction = '';
  for (let attempt=0; attempt<2; attempt++) {
  progress(attempt ? 'repair' : 'text');
  const response = await fetch(`${(env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, '')}/chat/completions`, {
    signal: AbortSignal.timeout(90000),
    method: "POST",
    headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.NEBIUS_TEXT_MODEL,
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_schema", json_schema: { name: "passive_item_profile", strict: true, schema: ITEM_SCHEMA } },
      messages: [
        { role: "system", content: systemPrompt() + '\nRequired schema: ' + JSON.stringify(ITEM_SCHEMA) },
        { role: "user", content: playerPrompt + correction },
      ],
    }),
  });
  if (!response.ok) fail(`Token Factory text request failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) fail("Token Factory returned no item profile.");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "last-text-response.txt"), `${typeof content === "string" ? content : JSON.stringify(content, null, 2)}\n`);
  try {
    if(body.choices?.[0]?.finish_reason === 'length') throw Error('Response was truncated');
    const profile = parseModelJson(content);
    validateProfile(profile);
    return profile;
  } catch(error) {
    if(attempt === 1) throw Error('Item design failed validation after two attempts: ' + error.message);
    correction = '\nThe previous attempt failed validation: ' + error.message + '. Produce a fresh valid JSON object. Use rules: [] unless a rule is specifically needed.';
  }
  }
}

function parseModelJson(content) {
  const text = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => typeof part === "string" ? part : part?.text || "").join("").trim()
      : "";
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* Try the next representation. */ }
  }
  fail("Token Factory returned invalid JSON.");
}

async function writeOutputs(profile, skipImage) {
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(path.join(modDirectory, "resources", "gfx", "items", "collectibles"), { recursive: true });
  const runtimeProfile = { version: capabilities.version, generated_at: new Date().toISOString(), ...(requestId ? { bridge_request_id: requestId } : {}), ...profile };
  const assetName = `generated_item_${Date.now()}.png`;
  runtimeProfile.sprite_sheet = 'gfx/items/collectibles/' + assetName;
  const runtimeAsset = path.join(modDirectory, 'resources', runtimeProfile.sprite_sheet);
  if (skipImage) {
    await copyFile(path.join(modDirectory, "resources", "gfx", "items", "collectibles", "ember_orb.png"), runtimeAsset);
  } else {
    const source = await generateItemArtwork(profile);
    progress('art');
    await writeFile(runtimeAsset, await makeIcon(source));
  }
  progress('publish');
  await atomicWrite(path.join(outputDirectory, 'item-profile.json'), JSON.stringify(runtimeProfile,null,2));
  await atomicWrite(path.join(modDirectory, 'generated_profile.lua'), `return ${toLua(runtimeProfile)}\n`);
  // Isaac caches include() results by module name. Give every in-game request
  // an immutable module so a later generation can never receive stale data.
  if (requestId) {
    await atomicWrite(path.join(modDirectory, `generated_profile_${requestId}.lua`), `return ${toLua(runtimeProfile)}\n`);
    const contents = `return ${toLua(runtimeProfile)}\n`;
    // Isaac consumes the same unused include() slot in which it observed the
    // ready status, so it never attempts to reload a cached missing module.
    await Promise.all(Array.from({ length: GAME_MODULE_SLOT_COUNT }, (_, index) =>
      atomicWrite(path.join(modDirectory, `generated_profile_${requestId}_slot_${index + 1}.lua`), contents),
    ));
    // JSON remains useful to the local bridge and for diagnostics; Isaac's
    // sandbox deliberately does not expose Lua's io library.
    await atomicWrite(path.join(modDirectory, `generated_profile_${requestId}.json`), JSON.stringify(runtimeProfile));
  }
}

async function generateItemArtwork(profile) {
  const prompt = `One small pixel art collectible: ${profile.metadata.display_name}. ${profile.visuals.pedestal_prompt}. Single centered isolated object, bold dark outline, limited palette, pure solid white background, no shadow, no text, no frame, no pedestal, no character.`;
  const backend = (env.IMAGE_BACKEND || "comfyui").toLowerCase();
  if (backend === "comfyui") {
    requireSetting("COMFYUI_CHECKPOINT");
    return generateComfyImage({ baseUrl: env.COMFYUI_URL || "http://127.0.0.1:8188", checkpoint: env.COMFYUI_CHECKPOINT, prompt, onStage: progress });
  }
  if (backend !== "nebius") fail(`Unsupported IMAGE_BACKEND: ${backend}. Use comfyui, nebius, or --no-image.`);
  progress('image');
  requireSetting("NEBIUS_API_KEY");
  requireSetting("NEBIUS_IMAGE_MODEL");
  const response = await fetch(`${env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/"}images/generations`, {
    signal: AbortSignal.timeout(120000),
    method: "POST",
    headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.NEBIUS_IMAGE_MODEL, prompt, response_format: "b64_json", response_extension: "png", width: 512, height: 512, num_inference_steps: 4 }),
  });
  if (!response.ok) fail(`Token Factory image request failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  if (!payload.data?.[0]?.b64_json) fail("Token Factory returned no image data.");
  return Buffer.from(payload.data[0].b64_json, "base64");
}

function validateProfile(profile) {
  validateSchema(profile, ITEM_SCHEMA);
  if (!profile || typeof profile !== "object") fail("Profile must be an object.");
  assertText(profile.metadata?.display_name, "metadata.display_name");
  assertText(profile.metadata?.description, "metadata.description");
  if (!Number.isInteger(profile.metadata?.quality) || profile.metadata.quality < 0 || profile.metadata.quality > 4) fail("metadata.quality must be 0–4.");
  for (const [name, bounds] of Object.entries(capabilities.stat_bounds)) assertNumber(profile.stats?.[name], `stats.${name}`, bounds[0], bounds[1]);
  const tear = profile.tear_profile;
  if (!Array.isArray(tear?.flags) || tear.flags.length > 3 || tear.flags.some((flag) => !capabilities.tear_flags.includes(flag))) fail("tear_profile.flags is not allowed.");
  for (const channel of ["r", "g", "b", "a"]) assertNumber(tear?.color?.[channel], `tear_profile.color.${channel}`, 0, 1);
  assertNumber(tear?.scale, "tear_profile.scale", 0.5, 2);
  assertText(profile.visuals?.pedestal_prompt, "visuals.pedestal_prompt");
  if (!Array.isArray(profile.rules) || profile.rules.length > 2) fail("rules must contain at most two rules.");
  for (const rule of profile.rules) {
    if (!capabilities.triggers.includes(rule.trigger)) fail(`Unsupported trigger: ${rule.trigger}`);
    if (!Array.isArray(rule.conditions) || !Array.isArray(rule.actions) || !rule.actions.length) fail("Every rule needs conditions and at least one action.");
    for (const condition of rule.conditions) {
      if (!capabilities.conditions.includes(condition.type)) fail(`Unsupported condition: ${condition.type}`);
      if (condition.type === "chance") assertNumber(condition.chance, "condition.chance", 0, 1);
    }
    for (const action of rule.actions) {
      if (!capabilities.actions.includes(action.type)) fail(`Unsupported action: ${action.type}`);
      if (!Number.isInteger(action.amount) || action.amount < 1 || action.amount > 4) fail("action.amount must be an integer from 1–4.");
      if (action.type === "spawn_pickup" && !capabilities.pickup_types.includes(action.pickup_type)) fail("spawn_pickup requires an allowed pickup_type.");
    }
  }
}

function systemPrompt() {
  return `Create one conservative Binding of Isaac passive item. Return only the supplied JSON schema. This first slice supports only passive stats, native tinted tears, and the listed declarative rules. Never output Lua, active-item behavior, custom callbacks, extra keys, or any state key. A missing mechanic is not an invitation to invent it. Stats omitted by the player should be 0.\nAllowed triggers: ${capabilities.triggers.join(", ")}.\nAllowed conditions: ${capabilities.conditions.join(", ")}.\nAllowed actions: ${capabilities.actions.join(", ")}.\nPedestal prompt: one centered object, transparent/plain background, no text, no character.`;
}

function readOption(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ""; }
function requireSetting(name) { if (!env[name]) fail(`${name} is required in .env.`); }
function assertText(value, name) { if (typeof value !== "string" || !value.trim()) fail(`${name} must be a non-empty string.`); }
function assertNumber(value, name, min, max) { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${name} must be a number from ${min}–${max}.`); }
function fail(message) { throw new Error(message); }
async function readEnv(file) {
  const values = {};
  try {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      if (!line || line.trimStart().startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index > 0) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return values;
}

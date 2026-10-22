import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { atomicWrite, makeIcon, makeSpriteSheet, validateSchema, toLua } from './runtime.mjs';
import { assertComfyUiReady, generateComfyImage } from "./comfyui.mjs";
import { chatCompletionPayload, requestTextModel } from "./network.mjs";
import { buildDesignPrompt, isUnderspecifiedIdea } from "./idea.mjs";
import { artSlotName, familiarArtSlotName, familiarAnimationResource, familiarSheetResource } from '../native/ipc/art-slots.mjs';
import { applyRegion, applySystems, repairNote, repairProfile } from './prompt-features.mjs';
import { assertCatalogWeights, fitWeightBudget, profileWeight } from './weights.mjs';

const GAME_MODULE_SLOT_COUNT = 400;

const root = path.resolve(import.meta.dirname, "..");
const env = { ...await readEnv(path.join(root, ".env")), ...process.env };
const capabilities = JSON.parse(
  await readFile(path.join(root, "content-contract", "capabilities.json"), "utf8"),
);
assertCatalogWeights(capabilities);
const outputDirectory = env.NEBIUS_OUTPUT_DIRECTORY || path.join(root, "runtime", "generated");
const modDirectory = env.ISAAC_MOD_DIRECTORY
  ? path.resolve(root, env.ISAAC_MOD_DIRECTORY)
  : path.join(root, "demo", "live-sprite-swap");

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const dryRun = args.includes("--dry-run");
const noImage = args.includes("--no-image");
const prompt = readOption("--prompt") || args.filter((value) => !value.startsWith("--")).join(" ");
const requestId = readOption("--request-id");
const requestedArtSlot = readOption("--art-slot");
const requestedQuality = Number(readOption("--quality") || 3);
const requestedItemType = readOption("--item-type") || "passive";
if (!["passive", "active"].includes(requestedItemType)) fail("Item type must be passive or active.");

if (isMain && !prompt && !dryRun) {
  fail('Usage: npm run generate -- --prompt "A cursed nail that poisons enemies"');
}
if (isMain && !dryRun && requestedArtSlot === '') {
  fail('Use npm run ipc:generate -- --prompt "..." with the bridge and a run open, so artwork is safely reserved.');
}
if (!Number.isInteger(requestedQuality) || requestedQuality < 0 || requestedQuality > 4) {
  fail('Quality must be an integer from 0 through 4.');
}

const HIT_TRIGGERS = new Set(["player_hurt", "enemy_hit"]);
const MAX_ITEM_SYSTEMS = capabilities.item_limits?.max_systems ?? 6;
const MAX_TOTAL_FLAGS = capabilities.item_limits?.max_total_flags ?? 3;
const updatedBalanceGuidance = 'Balance rules: flat damage +1 costs 1 and -1 refunds 1; damage_multiplier can be any value from 0.5x through 2.0x. 1.1x costs 2 and 2.0x costs 11; 0.9x refunds 2 and 0.5x refunds 11. Range, tears, and luck cost or refund 1 per unit; signed soul_hearts cost or refund 2 per half-heart; speed and shot_speed retain their catalog costs; each named tear flag and each aura or tear_update system costs 6; flight costs 8. Orbit tears always become spectral in game, so orbit alone requests both effects. Keep explicit flags within the three-flag limit.';
const PROC_SYSTEMS = ["on_kill", "tear_impact", "collision"];
const WEAPON_SYSTEMS = ["tear_update", "bomb", "laser", "knife"];
const conditionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: { type: "string", enum: capabilities.conditions },
    chance: { type: "number", minimum: 0, maximum: 1 },
  },
};
const heartRewardGuidance = 'Heart reward catalog: ' + JSON.stringify(capabilities.heart_rewards) + '. Each amount counts the named reward, integer 1-4. Red rewards heal existing containers. grant_soul_hearts retains half-heart units. Never invent an action, heart type, handler, or parameter. Use once_per_room when requested. Unknown or out-of-bounds actions must be corrected using only this catalog.';
const tearFlagGuidance = 'Allowed tear flags: ' + capabilities.tear_flags.join(', ') + '. flags contains at most three names. explosive maps only to TEAR_EXPLOSIVE (explodes on hit); it has no configurable blast damage, radius, or chance. For explosive tears select tears and put explosive in tear_profile.flags. confusion maps only to TEAR_CONFUSION; it has no configurable duration, strength, or chance. For confusion tears select tears and put confusion in tear_profile.flags. knockback maps only to TEAR_KNOCKBACK; it has no configurable strength, distance, or multiplier. For knockback tears select tears and put knockback in tear_profile.flags. Never invent a flag or a parameter. Use only catalog names when repairing flags.';
const uniqueEffectGuidance = 'Prefer distinctive catalog mechanics over room-clear loot. Permanent stats.damage or stats.tears is a damage or tears up. on_kill uses damage_burst with cooldown 30, amount 1-3, and radius 40-120. tear_impact uses apply_status with cooldown 30, status slow, burn, or fear, duration 15-120, and amount 1-2. collision and player_hurt use retaliate with cooldown 30 and amount 1-3. grant_stat on room_clear grants a next-room damage, tears, or luck bonus. convert_resource trades coins, keys, or bombs. Use spawn_pickup or grant_soul_hearts only when the wish asks for loot or healing. Do not pad a flavor item with a room-clear coin or soul heart.';
const lifecycleGuidance = 'Rules and procs may include cooldown (integer 15-1800 game frames). grant_stat optionally accepts duration (15-1800 frames, expires no later than next room) and stack_limit (1-4); each proc adds amount up to amount times stack_limit and refreshes duration. Omit those fields for legacy maximum-per-item/stat room bonuses. spawn_pickup optionally accepts a named pickup_subtype from ' + JSON.stringify(capabilities.pickup_subtypes) + '. Do not add these optional fields unless requested.';
const batchGuidance = 'grant_stat catalog: ' + JSON.stringify(capabilities.room_stat_reward) + '. Use action {type: grant_stat, stat: damage|tears|luck, amount: integer 1-4} on an existing rule or proc. stat is required only for grant_stat; omit it for other actions. No permanent stats block is needed for a room-only reward. Repeated grants use the maximum per item/player/stat, never sum; tears reduces fire delay in the same units as stats.tears. Aura status catalog: ' + JSON.stringify(capabilities.aura_statuses) + '. Aura has one type. All types require radius and cooldown. damage aura requires damage and omits duration. Status auras require duration (integer frames 15-120). burn requires damage (per burn tick); slow and fear omit damage. Slow factor is fixed at 0.5. Bomb flags: ' + JSON.stringify(capabilities.bomb_flag_effects) + '. Optional bomb.flags is [] or [poison], requires the bomb system and existing damage/radius. It never changes tears, lasers, or knives. No other status, weapon, strength, or Lua parameter is allowed. Omit new fields unless used.';
const actionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "amount"],
  properties: {
    type: { type: "string", enum: capabilities.actions, description: heartRewardGuidance + " " + batchGuidance + " " + lifecycleGuidance + ' Combat effects: ' + JSON.stringify(capabilities.combat_effects) + '. Combat actions always require the listed trigger and a proc/rule cooldown of at least 30 frames. amount is bounded damage (or burn damage for apply_status); radius belongs to damage_burst or nearby retaliation; status and duration only belong to apply_status. Retaliate optionally sets target_mode: attacker (default, no radius) or nearby (player_hurt only, required radius 40-120, max 8 enemies, costs 6 extra plus radius weight). Collision always targets only the collider.' },
    amount: { type: "integer", minimum: 1, maximum: 4 },
    pickup_type: { type: "string", enum: capabilities.pickup_types },
    friendly_type: { type: "string", enum: capabilities.friendlies },
    stat: { type: "string", enum: capabilities.room_stat_reward.stats },
    duration: { type: "integer", minimum: 15, maximum: 1800 },
    stack_limit: { type: "integer", minimum: 1, maximum: 4 },
    pickup_subtype: { type: "string", enum: [...new Set(Object.values(capabilities.pickup_subtypes).flatMap(Object.keys))] },
    status: { type: "string", enum: ["slow", "burn", "fear"] },
    radius: { type: "number", minimum: 40, maximum: 120 },
    target_mode: { type: "string", enum: capabilities.combat_effects.retaliate.target_modes },
    input_resource: { type: "string", enum: Object.keys(capabilities.resources) },
    output_resource: { type: "string", enum: Object.keys(capabilities.resources) },
    cost: { type: "integer", minimum: 1, maximum: 4 },
  },
};
const procSchema = {
  type: "object",
  additionalProperties: false,
  required: ["conditions", "actions"],
  properties: {
    conditions: { type: "array", maxItems: 2, items: conditionSchema },
    actions: { type: "array", minItems: 1, maxItems: 2, items: actionSchema },
    cooldown: { type: "integer", minimum: 15, maximum: 1800 },
  },
};

export const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["region", "systems", "affects_stats", "metadata", "visuals", "rules"],
  properties: {
    region: { type: "string", enum: capabilities.regions },
    active: { type: "object", additionalProperties: false, required: ["effect", "charges", "targeting", "damage", "radius"], properties: {
      effect: { type: "string", enum: capabilities.active.effects },
      charges: { type: "integer", enum: capabilities.active.charges },
      targeting: { type: "string", enum: capabilities.active.targeting },
      damage: { type: "number", minimum: capabilities.active.damage_bounds[0], maximum: capabilities.active.damage_bounds[1] },
      radius: { type: "number", minimum: capabilities.active.radius_bounds[0], maximum: capabilities.active.radius_bounds[1] },
    } },
    systems: { type: "array", maxItems: MAX_ITEM_SYSTEMS, items: { type: "string", enum: capabilities.systems } },
    affects_stats: { type: "boolean" },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["display_name", "description", "quality", "theme", "balance_note"],
      properties: {
        display_name: { type: "string", minLength: 1, maxLength: 64 },
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
        damage: { type: "number", minimum: capabilities.stat_bounds.damage[0], maximum: capabilities.stat_bounds.damage[1] },
        damage_multiplier: { type: "number", minimum: capabilities.stat_bounds.damage_multiplier[0], maximum: capabilities.stat_bounds.damage_multiplier[1] },
        tears: { type: "number", minimum: capabilities.stat_bounds.tears[0], maximum: capabilities.stat_bounds.tears[1] },
        shot_speed: { type: "number", minimum: capabilities.stat_bounds.shot_speed[0], maximum: capabilities.stat_bounds.shot_speed[1] },
        range: { type: "number", minimum: capabilities.stat_bounds.range[0], maximum: capabilities.stat_bounds.range[1] },
        speed: { type: "number", minimum: capabilities.stat_bounds.speed[0], maximum: capabilities.stat_bounds.speed[1] },
        luck: { type: "number", minimum: capabilities.stat_bounds.luck[0], maximum: capabilities.stat_bounds.luck[1] },
        soul_hearts: { type: "integer", minimum: -4, maximum: 4 },
        flying: { type: "boolean" },
      },
    },
    tear_profile: {
      type: "object",
      additionalProperties: false,
      required: ["flags", "color", "scale"],
      properties: {
        flags: { type: "array", maxItems: 3, items: { type: "string", enum: capabilities.tear_flags, description: tearFlagGuidance } },
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
      properties: { pedestal_prompt: { type: "string", minLength: 1, maxLength: 500 },
        sound: { type: "string", enum: capabilities.presentation.sounds },
        animation: { type: "string", enum: capabilities.presentation.animations },
      },
    },
    familiar: {
      type: "object",
      additionalProperties: false,
      required: ["type", "damage", "cooldown", "range", "sprite_prompt"],
      properties: {
        type: { type: "string", enum: capabilities.familiars },
        damage: { type: "number", minimum: 0.5, maximum: 3 },
        cooldown: { type: "integer", minimum: 15, maximum: 90 },
        range: { type: "number", minimum: 80, maximum: 320 },
        sprite_prompt: { type: "string", minLength: 1, maxLength: 500 },
        attack: {
          type: "object",
          additionalProperties: false,
          required: ["pattern", "flags", "color", "scale", "speed"],
          properties: {
            pattern: { type: "string", enum: capabilities.familiar_patterns },
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
            speed: { type: "number", minimum: 4, maximum: 12 },
          },
        },
      },
    },
    aura: {
      type: "object",
      additionalProperties: false,
      required: ["type", "radius", "cooldown"],
      properties: {
        type: { type: "string", enum: capabilities.auras, description: batchGuidance },
        triggered: { type: "boolean" },
        duration: { type: "integer", minimum: 15, maximum: 120 },
        damage: { type: "number", minimum: 0.25, maximum: 2 },
        radius: { type: "number", minimum: 50, maximum: 180 },
        cooldown: { type: "integer", minimum: 15, maximum: 90 },
      },
    },
    on_kill: procSchema,
    tear_impact: procSchema,
    collision: procSchema,
    tear_update: {
      type: "object",
      additionalProperties: false,
      required: ["behavior", "strength"],
      properties: {
        behavior: { type: "string", enum: capabilities.tear_update_behaviors },
        strength: { type: "number", minimum: 0.5, maximum: 2 },
      },
    },
    bomb: {
      type: "object",
      additionalProperties: false,
      required: ["damage", "radius"],
      properties: {
        damage: { type: "number", minimum: 0.5, maximum: 3 },
        radius: { type: "number", minimum: 40, maximum: 120 },
        flags: { type: "array", maxItems: 1, items: { type: "string", enum: capabilities.bomb_flags } },
      },
    },
    laser: {
      type: "object",
      additionalProperties: false,
      required: ["damage"],
      properties: { damage: { type: "number", minimum: 0.5, maximum: 3 } },
    },
    knife: {
      type: "object",
      additionalProperties: false,
      required: ["damage"],
      properties: { damage: { type: "number", minimum: 0.5, maximum: 3 } },
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
          cooldown: { type: "integer", minimum: 15, maximum: 1800 },
          conditions: { type: "array", maxItems: 2, items: conditionSchema },
          actions: { type: "array", minItems: 1, maxItems: 2, items: actionSchema },
        },
      },
    },
  },
};

const fixture = {
  region: "passive",
  systems: ["stats", "tears", "rules"],
  affects_stats: true,
  metadata: { display_name: "Ashen Nail", description: "Poisons from beyond", quality: 2, theme: "cursed", balance_note: "" },
  stats: { damage: 0.4, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0 },
  tear_profile: { flags: ["poison"], color: { r: 0.3, g: 0.75, b: 0.35, a: 1 }, scale: 1 },
  visuals: { pedestal_prompt: "single rusty iron nail, cursed sickly green glint, pixel art game icon, centered object, plain transparent background, no text" },
  rules: [{ trigger: "room_clear", conditions: [{ type: "chance", chance: 0.2 }, { type: "once_per_room" }], actions: [{ type: "spawn_pickup", pickup_type: "coin", amount: 1 }] }],
};

if (isMain) try {
  await preflightImageBackend();
  const activeFixture={region:"passive",systems:["active"],affects_stats:false,metadata:{...fixture.metadata,display_name:"Ashen Pulse",description:"A radial burst of damage"},visuals:fixture.visuals,rules:[],active:{effect:"radial_burst",charges:6,targeting:"self",damage:4,radius:100}};
  const profile = dryRun ? (requestedItemType === "active" ? activeFixture : fixture) : await generateProfile(prompt);
  validateProfile(profile);
  if (dryRun) {
    await mkdir(outputDirectory, {recursive:true});
    await atomicWrite(path.join(outputDirectory, 'validated-fixture.json'), JSON.stringify(profile,null,2));
  } else await writeOutputs(profile, noImage);
  console.log(`Generated ${profile.metadata.display_name}. The bridge delivers requested profiles through native IPC.`);
} catch(error) { console.error(`Generation failed: ${error.message}`); process.exitCode = 1; }

function progress(stage) { console.log('@stage ' + stage); }

async function generateProfile(playerPrompt) {
  requireSetting("NEBIUS_API_KEY");
  requireSetting("NEBIUS_TEXT_MODEL");
  const expandingIdea = isUnderspecifiedIdea(playerPrompt);
  if (expandingIdea) progress('expand');
  const { designPrompt, ideaBrief } = requestedItemType === "active" ? { designPrompt: playerPrompt } : await buildDesignPrompt(playerPrompt, capabilities, env, undefined, requestId || String(Date.now()));
  const qualityPrompt = `\nRequested quality: ${requestedQuality}. This is an exact target, not a maximum. Keep the item within quality ${requestedQuality}'s budget of ${capabilities.quality_budgets[requestedQuality]}. Spend that budget on distinctive stats, combat procs, auras, familiars, or tear effects. Do not pad with a room-clear coin or soul heart.`;
  if (ideaBrief) {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "last-idea-brief.txt"), `${ideaBrief}\n`);
  }
  let correction = '';
  for (let attempt=0; attempt<2; attempt++) {
  progress(attempt ? 'repair' : 'text');
  const response = await requestTextModel(`${(env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, '')}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(chatCompletionPayload(env, {
      temperature: attempt ? 0 : 0.7,
      max_tokens: Number(env.NEBIUS_TEXT_MAX_TOKENS || 6144),
      response_format: { type: "json_schema", json_schema: { name: "passive_item_profile", strict: true, schema: ITEM_SCHEMA } },
      messages: [
        { role: "system", content: systemPrompt() + '\n' + updatedBalanceGuidance + '\nRequired schema: ' + JSON.stringify(ITEM_SCHEMA) },
        { role: "user", content: designPrompt + qualityPrompt + correction },
      ],
    })),
  });
  if (!response.ok) fail(`Token Factory text request failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  await mkdir(outputDirectory, { recursive: true });
  const reasoning = choice?.message?.reasoning_content || choice?.message?.reasoning || "";
  await writeFile(path.join(outputDirectory, "last-text-diagnostic.json"), JSON.stringify({
    finish_reason: choice?.finish_reason || null,
    content_length: typeof content === "string" ? content.length : 0,
    reasoning_length: typeof reasoning === "string" ? reasoning.length : 0,
    usage: body.usage || null,
  }, null, 2));
  if (content) await writeFile(path.join(outputDirectory, "last-text-response.txt"), `${typeof content === "string" ? content : JSON.stringify(content, null, 2)}\n`);
  try {
    if(choice?.finish_reason === 'length') throw Error('Response was truncated before the item profile was complete');
    if (!content) throw Error("Token Factory returned no item profile");
    const profile = parseModelJson(content);
    repairGeneratedProfile(profile, designPrompt, requestedQuality);
    validateProfile(profile);
    if (Boolean(profile.active) !== (requestedItemType === "active")) throw Error("The generated item type does not match the requested type.");
    return profile;
  } catch(error) {
    if(attempt === 1) throw Error('Item design failed validation after two attempts: ' + error.message);
    correction = '\n' + repairNote(error.message) + '\n' + uniqueEffectGuidance + '\n' + heartRewardGuidance + '\n' + tearFlagGuidance + '\n' + batchGuidance;
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
  delete profile.region;
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(path.join(modDirectory, "resources", "gfx", "items", "collectibles"), { recursive: true });
  const runtimeProfile = { version: capabilities.profile_version, generated_at: new Date().toISOString(), ...(requestId ? { bridge_request_id: requestId } : {}), ...profile };
  // Isaac indexes mod resources at startup. Generation therefore replaces one
  // of these predeclared slots instead of adding a new invisible filename.
  const artSlot = Number(requestedArtSlot);
  if (!Number.isInteger(artSlot) || artSlot < 0 || artSlot >= 64) fail('Artwork slot must be an integer from 0 to 63.');
  const assetName = artSlotName(artSlot);
  runtimeProfile.sprite_sheet = 'gfx/items/collectibles/' + assetName;
  const runtimeAsset = path.join(modDirectory, 'resources', runtimeProfile.sprite_sheet);
  try { await readFile(runtimeAsset); }
  catch (error) {
    if (error.code === 'ENOENT') fail('Native artwork slots are missing. Run `npm run art:prepare`, then restart Isaac before generating.');
    throw error;
  }
  if (skipImage) {
    await copyFile(path.join(modDirectory, "resources", "gfx", "items", "collectibles", "ember_orb.png"), runtimeAsset);
  } else {
    const source = await generateItemArtwork(profile);
    progress('art');
    await writeFile(runtimeAsset, await makeIcon(source));
  }
  if (profile.familiar) {
    const familiarAsset = path.join(modDirectory, 'resources', 'gfx', 'items', 'collectibles', familiarArtSlotName(artSlot));
    const animationAsset = path.join(modDirectory, 'resources', familiarAnimationResource(artSlot));
    const sheetAsset = path.join(modDirectory, 'resources', familiarSheetResource(artSlot));
    try {
      await readFile(familiarAsset);
      await readFile(animationAsset);
      await readFile(sheetAsset);
    } catch (error) {
      if (error.code === 'ENOENT') fail('Native familiar artwork slots are missing. Run `npm run art:prepare`, then restart Isaac before generating.');
      throw error;
    }
    runtimeProfile.familiar_sprite_sheet = 'gfx/items/collectibles/' + familiarArtSlotName(artSlot);
    runtimeProfile.familiar_animation = familiarAnimationResource(artSlot);
    runtimeProfile.familiar_animation_sheet = familiarSheetResource(artSlot);
    if (skipImage) {
      await copyFile(path.join(modDirectory, 'resources', 'gfx', 'items', 'collectibles', 'ember_orb.png'), familiarAsset);
      await copyFile(path.join(modDirectory, 'resources', 'gfx', 'familiars', 'generated_familiar_blank.png'), sheetAsset);
    } else {
      progress('familiar_art');
      const portrait = await generateFamiliarArtwork(profile);
      await writeFile(familiarAsset, await makeIcon(portrait));
      progress('familiar_anim');
      await writeFile(sheetAsset, await makeSpriteSheet(await generateFamiliarSheet(profile)));
    }
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

async function generateFamiliarArtwork(profile) {
  const prompt = `One tiny full-body pixel art character familiar: ${profile.familiar.sprite_prompt}. A readable miniature companion character with a head, body, and pose, centered and isolated, bold dark outline, limited palette, pure solid white background, no shadow, no text, no frame, no pedestal.`;
  const negative = "text, letters, words, UI, border, frame, scenery, room, multiple characters, photorealistic, item icon, pedestal";
  return requestImage(prompt, negative, 512, 512, "familiar image");
}

async function generateFamiliarSheet(profile) {
  const prompt = `One pixel-art spritesheet of a single familiar: ${profile.familiar.sprite_prompt}. Exactly 8 equal cells in one horizontal row, touching, no gaps, no labels, no grid lines. Cells 1 and 2 are a gentle idle bob. Cells 3 and 4 are a float. Cells 5 and 6 are a hop. Cells 7 and 8 are a spin. The same character, size, and colors in every cell, bold dark outline, limited palette, pure solid white background, no shadow, no text, no frame.`;
  const negative = "text, letters, words, numbers, UI, border, frame, scenery, room, photorealistic, item icon, pedestal, grid lines, labels, different characters";
  return requestImage(prompt, negative, 1024, 256, "familiar animation");
}

async function requestImage(prompt, negative, width, height, label) {
  const backend = (env.IMAGE_BACKEND || "comfyui").toLowerCase();
  if (backend === "comfyui") return generateComfyImage({ baseUrl: env.COMFYUI_URL || "http://127.0.0.1:8188", checkpoint: env.COMFYUI_CHECKPOINT, prompt, negative, width, height, onStage: progress });
  if (backend !== "nebius") fail(`Unsupported IMAGE_BACKEND: ${backend}. Use comfyui, nebius, or --no-image.`);
  progress('image');
  const response = await fetch(`${env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/"}images/generations`, { signal: AbortSignal.timeout(120000), method: "POST", headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.NEBIUS_IMAGE_MODEL, prompt, response_format: "b64_json", response_extension: "png", width, height, num_inference_steps: 4 }) });
  if (!response.ok) fail(`Token Factory image request failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  if (!payload.data?.[0]?.b64_json) fail(`Token Factory returned no ${label} data.`);
  return Buffer.from(payload.data[0].b64_json, "base64");
}

async function preflightImageBackend() {
  if (dryRun || noImage) return;
  const backend = (env.IMAGE_BACKEND || "comfyui").toLowerCase();
  if (backend !== "comfyui") return;
  requireSetting("COMFYUI_CHECKPOINT");
  await assertComfyUiReady(env.COMFYUI_URL || "http://127.0.0.1:8188");
}

function assertKnownFields(value, schema, location = "profile") {
  if (schema.enum && !schema.enum.includes(value)) fail(`${location} has an unsupported value`);
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) fail(`${location}.${key} is unsupported`);
      assertKnownFields(entry, schema.properties[key], `${location}.${key}`);
    }
  } else if (schema.type === "array" && Array.isArray(value)) {
    value.forEach((entry, index) => assertKnownFields(entry, schema.items, `${location}[${index}]`));
  }
}

function assertActiveOnly(profile) {
  if (!profile?.systems?.includes("active") && profile?.active === undefined) return;
  if (!Array.isArray(profile.systems) || profile.systems.length !== 1 || profile.systems[0] !== "active"
      || !profile.active || profile.region !== "passive" || profile.affects_stats !== false
      || !Array.isArray(profile.rules) || profile.rules.length !== 0
      || ["stats", "tear_profile", "familiar", "aura", ...PROC_SYSTEMS, ...WEAPON_SYSTEMS].some(key => profile[key] !== undefined)) {
    fail("Active items must contain only the active system.");
  }
}

export function repairGeneratedProfile(profile, playerPrompt, quality) {
  assertKnownFields(profile, ITEM_SCHEMA);
  assertActiveOnly(profile);
  if (profile?.systems?.includes("active")) { fitWeightBudget(profile, capabilities, quality); return profile; }
  // Permanent-stat phrase repair must not turn a room-only request into a passive bonus.
  const permanentPrompt = playerPrompt.split(/(?<=[.!?;])\s+/)
    .filter(sentence => !/\b(?:for (?:this|the current|one|the rest of (?:this|the)) room|until (?:the )?next room|room[- ]long)\b/i.test(sentence)).join(" ");
  repairProfile(profile, permanentPrompt);
  applyRegion(profile);
  applySystems(profile);
  fitWeightBudget(profile, capabilities, quality);
  applyRegion(profile);
  applySystems(profile);
  return profile;
}

export function validateProfile(profile) {
  if (!profile || typeof profile !== "object") fail("Profile must be an object.");
  assertKnownFields(profile, ITEM_SCHEMA);
  validateSchema(profile, ITEM_SCHEMA);
  assertActiveOnly(profile);
  if (!capabilities.regions.includes(profile.region)) fail("region must be passive, familiar, aura, or familiar_aura.");
  const selected = new Set();
  for (const name of profile.systems) {
    if (!capabilities.systems.includes(name) || selected.has(name)) fail("systems must be unique catalog ids.");
    selected.add(name);
  }
  if (selected.has("active")) {
    if (selected.size !== 1 || !profile.active || profile.rules.length !== 0 || profile.region !== "passive") fail("Active items must contain only the active system.");
  } else if (profile.active !== undefined) fail("active requires the active system.");
  const flagCount = (profile.tear_profile?.flags?.length || 0)
    + (profile.familiar?.attack?.flags?.length || 0)
    + (profile.bomb?.flags?.length || 0);
  if (flagCount > MAX_TOTAL_FLAGS) fail(`An item can use at most ${MAX_TOTAL_FLAGS} total flag effects.`);
  if (profile.affects_stats !== selected.has("stats")) fail("affects_stats must match the stats system.");
  const familiarRegion = profile.region === "familiar" || profile.region === "familiar_aura";
  const auraRegion = profile.region === "aura" || profile.region === "familiar_aura";
  if (familiarRegion !== selected.has("familiar")) fail("The familiar system must match the region.");
  if (auraRegion !== selected.has("aura")) fail("The aura system must match the region.");
  if (selected.has("stats") && !profile.stats) fail("The stats system requires stats.");
  if (!selected.has("stats") && profile.stats) fail("stats requires the stats system.");
  if (selected.has("tears") && !profile.tear_profile) fail("The tears system requires a tear profile.");
  if (!selected.has("tears") && profile.tear_profile) fail("tear_profile requires the tears system.");
  if (selected.has("familiar") && !profile.familiar) fail("The familiar system requires a familiar.");
  if (selected.has("aura") && !profile.aura) fail("The aura system requires an aura.");
  for (const name of PROC_SYSTEMS) {
    if (selected.has(name) && !profile[name]) fail(`The ${name} system requires its proc.`);
    if (!selected.has(name) && profile[name]) fail(`${name} requires its system.`);
  }
  for (const name of WEAPON_SYSTEMS) {
    if (selected.has(name) && !profile[name]) fail(`The ${name} system requires its block.`);
    if (!selected.has(name) && profile[name]) fail(`${name} requires its system.`);
  }
  assertText(profile.metadata?.display_name, "metadata.display_name", 64);
  assertText(profile.metadata?.description, "metadata.description", 64);
  assertText(profile.metadata?.balance_note, "metadata.balance_note", 256, true);
  if (!Number.isInteger(profile.metadata?.quality) || profile.metadata.quality < 0 || profile.metadata.quality > 4) fail("metadata.quality must be 0–4.");
  const spent = profileWeight(profile, capabilities);
  const budget = capabilities.quality_budgets[profile.metadata.quality];
  if (spent > budget) fail(`Item spends ${spent} weight and quality ${profile.metadata.quality} allows ${budget}. The weight budget cannot hold this item.`);
  if (profile.stats) {
    for (const [name, bounds] of Object.entries(capabilities.stat_bounds)) {
      if (name === "damage_multiplier" && profile.stats[name] === undefined) continue;
      assertNumber(profile.stats?.[name], `stats.${name}`, bounds[0], bounds[1]);
    }
    if (profile.stats.flying !== undefined && typeof profile.stats.flying !== "boolean") fail("stats.flying must be a boolean.");
  }
  if (profile.tear_update) {
    if (!capabilities.tear_update_behaviors.includes(profile.tear_update.behavior)) fail("tear_update.behavior is not allowed.");
    assertNumber(profile.tear_update.strength, "tear_update.strength", 0.5, 2);
  }
  if (profile.bomb) {
    assertNumber(profile.bomb.damage, "bomb.damage", 0.5, 3);
    assertNumber(profile.bomb.radius, "bomb.radius", 40, 120);
  }
  if (profile.laser) assertNumber(profile.laser.damage, "laser.damage", 0.5, 3);
  if (profile.knife) assertNumber(profile.knife.damage, "knife.damage", 0.5, 3);
  const tear = profile.tear_profile;
  if (tear) {
    if (!Array.isArray(tear.flags) || tear.flags.length > 3 || tear.flags.some((flag) => !capabilities.tear_flags.includes(flag))) fail("tear_profile.flags is not allowed.");
    for (const channel of ["r", "g", "b", "a"]) assertNumber(tear?.color?.[channel], `tear_profile.color.${channel}`, 0, 1);
    assertNumber(tear?.scale, "tear_profile.scale", 0.5, 2);
  }
  assertText(profile.visuals?.pedestal_prompt, "visuals.pedestal_prompt", 500);
  if (profile.familiar) {
    const familiar = profile.familiar;
    if (!capabilities.familiars.includes(familiar.type)) fail("familiar.type is not allowed.");
    assertNumber(familiar.damage, "familiar.damage", 0.5, 3);
    if (!Number.isInteger(familiar.cooldown) || familiar.cooldown < 15 || familiar.cooldown > 90) fail("familiar.cooldown must be an integer from 15–90.");
    assertNumber(familiar.range, "familiar.range", 80, 320);
    assertText(familiar.sprite_prompt, "familiar.sprite_prompt", 500);
    const ranged = familiar.type === "sentry" || familiar.type === "normal";
    if (ranged) validateFamiliarAttack(familiar.attack);
    else if (familiar.attack) fail("Melee and shield familiars cannot include an attack.");
  }
  if (profile.aura) {
    const aura = profile.aura;
    if (!capabilities.auras.includes(aura.type)) fail("aura.type is not allowed.");
    if (aura.type === "damage" || aura.type === "burn") assertNumber(aura.damage, "aura.damage", 0.25, 2);
    else if (aura.damage !== undefined) fail("slow and fear auras cannot include damage.");
    if (aura.type === "damage") {
      if (aura.duration !== undefined) fail("damage aura cannot include duration.");
    } else if (!Number.isInteger(aura.duration) || aura.duration < 15 || aura.duration > 120) fail("status aura.duration must be an integer from 15-120.");
    assertNumber(aura.radius, "aura.radius", 50, 180);
    if (!Number.isInteger(aura.cooldown) || aura.cooldown < 15 || aura.cooldown > 90) fail("aura.cooldown must be an integer from 15–90.");
  }
  if (!Array.isArray(profile.rules) || profile.rules.length > 2) fail("rules must contain at most two rules.");
  let sawRule = false;
  let sawHit = false;
  for (const rule of profile.rules) {
    if (!capabilities.triggers.includes(rule.trigger)) fail(`Unsupported trigger: ${rule.trigger}`);
    const hit = HIT_TRIGGERS.has(rule.trigger);
    if (hit && !selected.has("on_hit")) fail("Hit rules require the on_hit system.");
    if (!hit && !selected.has("rules")) fail("Room, pickup, floor, and tear rules require the rules system.");
    if (hit) sawHit = true;
    else sawRule = true;
    if (!Array.isArray(rule.conditions) || !Array.isArray(rule.actions) || !rule.actions.length) fail("Every rule needs conditions and at least one action.");
    for (const condition of rule.conditions) {
      if (!capabilities.conditions.includes(condition.type)) fail(`Unsupported condition: ${condition.type}`);
      if (condition.type === "chance") assertNumber(condition.chance, "condition.chance", 0, 1);
      else if (condition.chance !== undefined) fail("chance requires the chance condition.");
    }
    for (const action of rule.actions) validateAction(action, "action", rule.trigger, rule.cooldown);
  }
  if (selected.has("rules") && !sawRule) fail("The rules system requires a room, pickup, floor, or tear rule.");
  if (selected.has("on_hit") && !sawHit) fail("The on_hit system requires a player_hurt or enemy_hit rule.");
  for (const name of PROC_SYSTEMS) if (profile[name]) validateProc(profile[name], name);
  const activations = [...profile.rules, ...PROC_SYSTEMS.map(name => profile[name]).filter(Boolean)].flatMap(entry => entry.actions).filter(action => action.type === "activate_aura");
  if (activations.length > 0 && profile.aura?.triggered !== true) fail("activate_aura requires a triggered aura on the same item.");
  if (profile.aura?.triggered === true && !activations.length) fail("A triggered aura requires an activate_aura action.");
}

function validateActionStat(action) {
  if (action.type === "grant_stat") {
    if (!capabilities.room_stat_reward.stats.includes(action.stat)) fail("grant_stat requires stat damage, tears, or luck.");
    if (action.pickup_type !== undefined) fail("grant_stat cannot include pickup_type.");
  } else if (action.stat !== undefined) fail("stat requires grant_stat.");
}

function validateAction(action, label, trigger, cooldown) {
  validateActionStat(action);
  if (action.target_mode !== undefined && (action.type !== "retaliate" || !capabilities.combat_effects.retaliate.target_modes.includes(action.target_mode))) fail("target_mode requires an allowed retaliation mode.");
  const combat = capabilities.combat_effects[action.type];
  if (combat) {
    if (!combat.triggers.includes(trigger) || !Number.isInteger(cooldown) || cooldown < combat.minimum_cooldown) fail("Combat effects require their catalog trigger and at least 30 frames cooldown.");
    assertNumber(action.amount, "combat amount", ...combat.amount_bounds);
    if (action.type === "damage_burst") assertNumber(action.radius, "burst radius", ...combat.radius_bounds);
    else if (action.type === "retaliate" && action.target_mode === "nearby") {
      if (trigger !== combat.nearby_trigger) fail("Nearby retaliation requires player_hurt.");
      assertNumber(action.radius, "retaliation radius", ...combat.radius_bounds);
    } else if (action.radius !== undefined) fail("radius requires damage_burst or nearby retaliation.");
    if (action.type === "apply_status") {
      if (!combat.statuses.includes(action.status)) fail("apply_status requires an allowed status.");
      assertNumber(action.duration, "status duration", ...combat.duration_bounds);
    } else if (action.status !== undefined || action.duration !== undefined) fail("status and duration require apply_status.");
  } else if (action.status !== undefined || action.radius !== undefined) fail("status and radius require a combat effect.");
  if (!["grant_stat", "apply_status", "activate_aura"].includes(action.type) && action.duration !== undefined) fail("duration requires grant_stat, apply_status, or activate_aura.");
  if (action.type !== "grant_stat" && action.stack_limit !== undefined) fail("stack_limit requires grant_stat.");
  if (action.pickup_subtype !== undefined && (action.type !== "spawn_pickup" || !Object.hasOwn(capabilities.pickup_subtypes[action.pickup_type] || {}, action.pickup_subtype))) fail("pickup_subtype must belong to the selected pickup family.");
  if (action.type === "convert_resource") {
    if (!Object.hasOwn(capabilities.resources, action.input_resource) || !Object.hasOwn(capabilities.resources, action.output_resource) || action.input_resource === action.output_resource) fail("Conversion needs two different catalog resources.");
    assertNumber(action.cost, "conversion cost", 1, 4);
    if (!Number.isInteger(cooldown) || cooldown < 30) fail("Conversion requires at least 30 frames cooldown.");
  } else if (action.input_resource !== undefined || action.output_resource !== undefined || action.cost !== undefined) fail("Resource parameters require convert_resource.");
  if (action.type === "activate_aura" && (action.amount !== 1 || action.duration === undefined || !Number.isInteger(cooldown) || cooldown < 30)) fail("activate_aura needs amount 1, duration, and at least 30 frames cooldown.");
  if (!capabilities.actions.includes(action.type)) fail(`Unsupported action: ${action.type}`);
  if (!Number.isInteger(action.amount) || action.amount < 1 || action.amount > 4) fail(`${label}.amount must be an integer from 1–4.`);
  if (action.type === "spawn_pickup") {
    if (!capabilities.pickup_types.includes(action.pickup_type)) fail("spawn_pickup requires an allowed pickup_type.");
    if (action.friendly_type !== undefined) fail("spawn_pickup cannot include friendly_type.");
  } else if (action.pickup_type !== undefined) fail("pickup_type requires spawn_pickup.");
  if (action.type === "spawn_friendly") {
    if (action.amount !== 1) fail("spawn_friendly amount must be 1.");
    if (!capabilities.friendlies.includes(action.friendly_type)) fail("spawn_friendly requires friendly_type attack_fly, spider, or pooter.");
  } else if (action.friendly_type !== undefined) fail("friendly_type requires spawn_friendly.");
}

function validateProc(proc, name) {
  if (!Array.isArray(proc.conditions) || !Array.isArray(proc.actions) || !proc.actions.length) fail(`${name} needs conditions and at least one action.`);
  for (const condition of proc.conditions) {
    if (!capabilities.conditions.includes(condition.type)) fail(`Unsupported condition: ${condition.type}`);
    if (condition.type === "chance") assertNumber(condition.chance, `${name}.chance`, 0, 1);
    else if (condition.chance !== undefined) fail("chance requires the chance condition.");
  }
  for (const action of proc.actions) validateAction(action, name, name, proc.cooldown);
}

function validateFamiliarAttack(attack) {
  if (!attack || typeof attack !== "object") fail("Sentry and normal familiars require an attack profile.");
  if (!capabilities.familiar_patterns.includes(attack.pattern)) fail("familiar.attack.pattern is not allowed.");
  if (!Array.isArray(attack.flags) || attack.flags.length > 3) fail("familiar.attack.flags is not allowed.");
  const seen = new Set();
  for (const flag of attack.flags) {
    if (!capabilities.tear_flags.includes(flag) || seen.has(flag)) fail("familiar.attack.flags is not allowed.");
    seen.add(flag);
  }
  for (const channel of ["r", "g", "b", "a"]) assertNumber(attack.color?.[channel], `familiar.attack.color.${channel}`, 0, 1);
  assertNumber(attack.scale, "familiar.attack.scale", 0.5, 2);
  assertNumber(attack.speed, "familiar.attack.speed", 4, 12);
}

function systemPrompt() {
  if (requestedItemType === "active") return "Create one Binding of Isaac active collectible. Return only the supplied JSON schema. Region is passive, systems is [active], affects_stats is false, and rules is empty. Include active with effect radial_burst, charges 6, targeting self, damage 1 through 6, and radius 40 through 120. Omit all other mechanic blocks. Never return code or callback flags. Respect the requested quality budget; weight is 2 + damage + ceil(radius/60). Use the wish for the item name, theme, and art. Describe its radial damage burst honestly. The burst hits at most eight enemies and spends charge only when an enemy can be hit.";
  return `${heartRewardGuidance}\n${tearFlagGuidance}\n${batchGuidance}\n${uniqueEffectGuidance}\nCreate one Binding of Isaac passive item that uses distinctive catalog mechanics. Return only the supplied JSON schema. Never output Lua, callback names, extra keys, or any state key. First choose region from the meaning of the wish. Then choose systems, and fill a parameter block only for a system you chose. passive: Isaac's own stats, tears, or a reward. familiar: a separate actor that follows, orbits, shoots, strikes, or protects Isaac. aura: a damage or status field around Isaac. familiar_aura: both. Honor named mechanics; do not add extras to a specific wish. If the wish is flavor or an expanded brief, implement those distinctive effects instead of a room-clear coin or soul heart. "Add damage. Tears burn. When an enemy dies, deal a small burst." is passive with systems stats, tears, and on_kill. stats.damage is above 0. tear_profile.flags is ["burn"]. on_kill has cooldown 30 and action damage_burst with amount 1 and radius 80. "Add luck. Tears glow. When I clear a room, grant me a soul heart." is passive with systems stats, tears, and rules, and the rule trigger is room_clear. "When I get hit, I sometimes find a coin. Tears poison. Add luck." is passive with systems stats, tears, and on_hit. stats.luck is above 0 and the other stats are 0. tear_profile.flags is ["poison"]. rules is one player_hurt rule with a chance condition and action spawn_pickup, pickup_type coin, amount 1. "When I hit an enemy" uses trigger enemy_hit. "When an enemy dies" is the on_kill proc, not a rule. "When a tear hits an enemy" is tear_impact. "When I touch an enemy" is collision. "When I clear a room", "reach a new floor", "pick this up", and "enter a room" use the rules system. "Give me a friend that shoots explosive bombs." is familiar with the familiar system and no stats unless the wish also changes Isaac. "Enemies who stand near me get hurt." is aura. Systems: stats changes damage, tears, shot speed, range, speed, or luck. tears changes Isaac's own shots. rules covers room_enter, room_clear, pickup, new_floor, and tear_fire. on_hit is only player_hurt and enemy_hit, and that system is invalid without one of those rules. familiar and aura must match the region. on_kill procs once per dead enemy. tear_impact procs once per tear that hits an enemy. collision procs once per enemy Isaac touches in a room. Those three procs use the same conditions and actions as rules. Omit stats, tear_profile, familiar, aura, on_kill, tear_impact, collision, tear_update, bomb, laser, and knife when their system is not selected. affects_stats is true only when stats is selected. Unselected stat numbers are omitted, not zero. Selecting a system without its object is invalid: stats needs the stats object, tears needs tear_profile, and on_kill, tear_impact, and collision need their own objects with conditions and actions. "Move a bit faster" is stats.speed. "Add range" is stats.range. "Raise shot speed" is stats.shot_speed, not the tears system. "Tears split", "Tears can pierce", "Tears pierce", "Tears poison", "Tears charm enemies", and "Tears orbit me" are tear_profile flags, including when a familiar is also present. "When an enemy dies, deal a small burst" is on_kill with cooldown 30 and damage_burst. "When an enemy dies, I sometimes find a coin" is on_kill with a chance condition and spawn_pickup coin. "When a tear hits an enemy, I sometimes find a key" is tear_impact, not a rule. description is one sentence that says what the item does, under 60 characters. Example: Damage up. Burning tears. Burst on kill. stats.flying is true only when the wish grants flight. tear_update is home, pulse, or shrink with strength 0.5–2, for a tear that keeps changing after it is fired. bomb, laser, and knife add bounded damage when Isaac fires that weapon. display_name and description are each at most 64 UTF-8 bytes. Familiar shots can use only the allowed tear flags. If the wish asks for a shot outside that list, choose the closest allowed flags and say so in metadata.balance_note. Familiar type is sentry (orbits and fires), normal (follows behind Isaac and fires), melee (contact strike, no attack), or shield (stands between Isaac and the nearest threat, blocks shots that touch it, cancels one hit per cooldown, deals contact damage, no attack). Sentry and normal require familiar.attack. Melee and shield must omit attack. attack.pattern is single, fan, lob, or varied. attack.flags holds up to three allowed tear flags and is the shot's only effect list. varied rerolls delivery and size using those same flags. attack.color, scale, and speed describe the shot. familiar.damage is one single shot; fan shots are 0.7x and lob shots are 1.25x. cooldown is frames between attacks. sprite_prompt must describe one tiny full-body companion character, not an object, icon, item, or pedestal.\nAllowed regions: ${capabilities.regions.join(", ")}.\nAllowed systems: ${capabilities.systems.join(", ")}.\nAllowed triggers: ${capabilities.triggers.join(", ")}.\nAllowed conditions: ${capabilities.conditions.join(", ")}.\nAllowed actions: ${capabilities.actions.join(", ")}.\nAllowed familiars: ${capabilities.familiars.join(", ")}. Allowed familiar patterns: ${capabilities.familiar_patterns.join(", ")}. Allowed auras: ${capabilities.auras.join(", ")}. Allowed friendlies: ${capabilities.friendlies.join(", ")}.\nQuality is a weight budget ${capabilities.quality_budgets.map((budget, quality) => `${quality}=${budget}`).join(", ")}. Spend the quality budget on the distinctive effects in the wish or expanded brief. Do not spend leftover budget on a room-clear coin or soul heart filler. Weights: ${JSON.stringify(capabilities.weights)}. A missing weight means the effect is not available. grant_soul_hearts costs 8 per heart, so one soul heart when a room is cleared needs quality 1 or higher. Negative stats refund weight and stop at their floors: speed -0.15, damage -1, tears -1, shot_speed -0.3, range -5, luck -1. Never deal damage to Isaac. spawn_friendly uses friendly_type attack_fly, spider, or pooter and amount 1. Extra pickups are pill, card, battery, trinket, chest, and sack. Path tear flags are continuum, boomerang, grow, shrink, sticky, wiggle, and slowing_creep. slowing_creep slows; it has no damage parameter.\nPedestal prompt: one centered object, transparent/plain background, no text.`;
}

function readOption(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ""; }
function requireSetting(name) { if (!env[name]) fail(`${name} is required in .env.`); }
function assertText(value, name, maximumBytes, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) fail(`${name} must be ${allowEmpty ? "a string" : "a non-empty string"}.`);
  if (maximumBytes && Buffer.byteLength(value, "utf8") > maximumBytes) {
    fail(`${name} exceeds the ${maximumBytes}-byte game limit.`);
  }
}
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

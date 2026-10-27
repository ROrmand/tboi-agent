import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ITEM_SCHEMA, buildDesignSchema, designUntilValid, repairGeneratedProfile, validateProfile } from "./generate.mjs";
import { validateSchema } from './runtime.mjs';
import { buildPowerDesignBrief, validatePowerDesign } from './power-design.mjs';
import { MECHANIC_CATALOG } from './power-planner.mjs';
import { POWER_CONTRACT_VERSION, powerFingerprint } from '../content-contract/powers.mjs';

const emptyPowerContext = { version: POWER_CONTRACT_VERSION, accepted_count: 0, power_usage: {}, power_history: [], recent_power_fingerprints: [] };

test('generated health is nonnegative in broad and targeted schemas and profile validation', () => {
  const schema = ITEM_SCHEMA.properties.stats;
  assert.equal(schema.properties.soul_hearts.minimum, 0);
  const stats = { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 1 };
  const profile = retaliationProfile({ type: 'retaliate', amount: 1 });
  profile.systems.push('stats'); profile.affects_stats = true; profile.stats = stats;
  validateProfile(profile);
  for (const soul_hearts of [-4, -1, -0.5]) {
    const invalid = { ...stats, soul_hearts };
    assert.throws(() => validateSchema(invalid, schema));
    assert.throws(() => validateProfile({ ...profile, stats: invalid }));
  }
  const { skeleton } = buildPowerDesignBrief('Add luck.', emptyPowerContext, { quality: 1, seed: 1, validateProfile });
  const invalid = structuredClone(skeleton.profile); invalid.stats.soul_hearts = -1;
  assert.throws(() => validateSchema(invalid, buildDesignSchema(skeleton)));
});

test('repeatable status creep and summons have truthful zero-cooldown targeted schemas', () => {
  for (const mechanic of MECHANIC_CATALOG.filter(entry => /status[.]|rules[.](creep|summon)[.]/.test(entry.id))) {
    const profile = retaliationProfile({ type: 'retaliate', amount: 1 });
    profile.rules = [];
    Object.assign(profile, structuredClone(mechanic.fragment));
    const schema = buildDesignSchema({ fragment: profile, quality: 4 });
    validateSchema(profile, schema);
    validateProfile(profile);
    const proc = profile.rules[0] ?? profile.tear_impact ?? profile.collision ?? profile.on_kill;
    assert.equal(proc.cooldown, 0);
    proc.cooldown = 30;
    assert.throws(() => validateSchema(profile, schema));
    proc.cooldown = 0; proc.conditions = [{ type: 'once_per_room' }];
    assert.throws(() => validateSchema(profile, schema));
  }
  const status = retaliationProfile({ type: 'apply_status', amount: 1, status: 'slow', duration: 60 }, 'enemy_hit');
  status.rules[0].cooldown = 0;
  validateProfile(status);
  const deadTarget = retaliationProfile({ type: 'apply_status', amount: 1, status: 'slow', duration: 60 }, 'on_kill');
  deadTarget.on_kill.cooldown = 0;
  assert.throws(() => validateProfile(deadTarget), /apply_status.*catalog trigger/);
  delete status.rules[0].cooldown;
  assert.throws(() => validateProfile(status), /apply_status.*0 frames/);
  const reward = retaliationProfile({ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }, 'on_kill');
  reward.on_kill.cooldown = 0;
  assert.throws(() => validateProfile(reward), /15 frames/);
  reward.on_kill.cooldown = 15;
  validateProfile(reward);
  for (const [action, trigger] of [[{ type: 'damage_burst', amount: 1, radius: 40 }, 'on_kill'], [{ type: 'retaliate', amount: 1 }, 'player_hurt']]) {
    const profile = retaliationProfile(action, trigger);
    (profile.rules[0] ?? profile.on_kill).cooldown = 0;
    assert.throws(() => validateProfile(profile), /30 frames/);
  }
});

test('familiar schema discriminates all firing and contact types before runtime validation', () => {
  const attack = { pattern: 'single', flags: [], color: { r: 1, g: 1, b: 1, a: 1 }, scale: 1, speed: 6 };
  for (const type of ['normal', 'sentry', 'melee', 'shield', 'orbit_contact']) {
    const ranged = ['normal', 'sentry'].includes(type);
    const familiar = { type, damage: 0.5, cooldown: 60, range: 120, sprite_prompt: 'A tiny full-body guardian.', ...(ranged ? { attack } : {}) };
    const schema = ITEM_SCHEMA.properties.familiar;
    validateSchema(familiar, schema);
    const invalid = { ...familiar, attack };
    if (ranged) delete invalid.attack;
    assert.throws(() => validateSchema(invalid, schema));
    const profile = { region: 'familiar', systems: ['familiar'], affects_stats: false, familiar, rules: [],
      metadata: { display_name: 'Guardian', description: 'A companion', quality: 4, theme: 'none', balance_note: '' }, visuals: { pedestal_prompt: 'A small charm' } };
    validateProfile(profile);
    assert.throws(() => validateProfile({ ...profile, familiar: invalid }));
  }
});

test('targeted schema requires planned kill bursts and exact supporting choices while allowing bounded tuning', () => {
  const { skeleton } = buildPowerDesignBrief('Add luck. When an enemy dies, deal a small burst.', emptyPowerContext, { quality: 2, seed: 'planned-schema', validateProfile });
  const schema = buildDesignSchema(skeleton);
  const profile = structuredClone(skeleton.profile);
  validateSchema(profile, schema);
  assert.ok(schema.required.includes('on_kill'));
  assert.equal(schema.properties.on_kill.properties.actions.items.properties.type.const, 'damage_burst');
  assert.equal(schema.properties.on_kill.properties.cooldown.minimum, 30);
  assert.equal(schema.properties.on_kill.properties.actions.items.properties.amount.maximum, 3);
  assert.equal(schema.properties.on_kill.properties.actions.items.properties.radius.minimum, 40);
  profile.on_kill.actions[0].radius = 41;
  profile.metadata.display_name = 'A different name';
  validateSchema(profile, schema);
  validatePowerDesign(profile, skeleton, validateProfile);
  for (const mutate of [
    p => { delete p.on_kill; },
    p => { p.systems = p.systems.filter(system => system !== 'on_kill'); delete p.on_kill; },
    p => { p.on_kill.actions[0] = { type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }; },
    p => { p.on_kill.actions[0].amount = 4; },
    p => { p.on_kill.actions[0].radius = 39; },
    p => { p.on_kill.cooldown = 29; },
    p => { p.on_kill.conditions = []; },
    p => { p.stats.luck += 1; },
    p => { p.stats.soul_hearts += 1; },
    p => { p.metadata.quality = 4; },
  ]) {
    const invalid = structuredClone(profile); mutate(invalid);
    assert.throws(() => validateSchema(invalid, schema));
  }
  const tight = buildPowerDesignBrief('When an enemy dies, deal a small burst.', emptyPowerContext, { quality: 1, seed: 1, validateProfile }).skeleton;
  const expensive = structuredClone(tight.profile);
  expensive.on_kill.actions[0].amount = 3;
  expensive.on_kill.actions[0].radius = 120;
  validateSchema(expensive, buildDesignSchema(tight));
  assert.throws(() => validatePowerDesign(expensive, tight, validateProfile), /budget/);
});

test('targeted schemas cover every catalog mechanic and keep selected branches bounded', () => {
  const originalSchema = structuredClone(ITEM_SCHEMA);
  for (const mechanic of MECHANIC_CATALOG) {
    const fragment = { region: 'passive', systems: [], affects_stats: false, rules: [], ...structuredClone(mechanic.fragment) };
    const schema = buildDesignSchema({ fragment, quality: 2 });
    const profile = { ...fragment, metadata: { display_name: 'Catalog', description: 'Catalog', quality: 2, theme: 'none', balance_note: '' }, visuals: { pedestal_prompt: 'A charm' } };
    validateSchema(profile, schema);
    for (const field of Object.keys(fragment)) assert.ok(schema.required.includes(field), `${mechanic.id}: ${field}`);
    for (const proc of [...profile.rules, ...['on_kill', 'tear_impact', 'collision'].map(key => profile[key]).filter(Boolean)]) {
      if (proc.actions[0].type === 'apply_status') {
        proc.actions[0].duration = 121;
        assert.throws(() => validateSchema(profile, schema));
      }
    }
  }
  assert.deepEqual(ITEM_SCHEMA, originalSchema);
});

test('quality-four targeted familiar schemas preserve planned strength without fixing artwork text', () => {
  for (const type of ['shield', 'sentry', 'orbit_contact', 'melee', 'normal']) {
    const fragment = structuredClone(MECHANIC_CATALOG.find(entry => entry.id === 'familiar.' + type).fragment);
    Object.assign(fragment, { region: 'familiar', affects_stats: false, rules: [] });
    Object.assign(fragment.familiar, { damage: 3, cooldown: 30, range: 240 });
    const profile = { ...structuredClone(fragment), metadata: { display_name: 'Legacy guardian', description: 'A saved familiar.', quality: 4, theme: 'none', balance_note: '' }, visuals: { pedestal_prompt: 'A small guardian.' } };
    const skeleton = { version: 1, quality: 4, mechanicIds: ['familiar.' + type], fragment, profile, fingerprint: powerFingerprint(profile) };
    const schema = buildDesignSchema(skeleton);
    profile.familiar.sprite_prompt = 'A small full-body soap knight.';
    validateSchema(profile, schema);
    validatePowerDesign(profile, skeleton, validateProfile);
    for (const patch of [{ damage: 0.5 }, { cooldown: 90 }, { range: 80 }]) {
      assert.throws(() => validateSchema({ ...profile, familiar: { ...profile.familiar, ...patch } }, schema));
    }
  }
});

test('creep generation requires its complete bounded action without a permissive legacy fallback', () => {
  const schema = ITEM_SCHEMA.properties.rules.items.properties.actions.items;
  const creep = schema.anyOf.find(option => option.properties.type.const === 'spawn_creep');
  assert.deepEqual(creep.required, ['type', 'amount', 'creep', 'radius', 'duration']);
  assert.equal(schema.anyOf.filter(option => option.properties.type.enum?.includes('spawn_creep')).length, 0);
  for (const type of ['on_kill', 'tear_impact', 'collision']) {
    assert.equal(ITEM_SCHEMA.properties[type].properties.actions.items, schema);
  }
  for (const color of ['red', 'green', 'black', 'yellow']) {
    for (const radius of [20, 80]) {
      for (const duration of [15, 180]) {
        for (const amount of [1, 4]) validateSchema({ type: 'spawn_creep', amount, creep: color, radius, duration }, schema);
      }
    }
  }
  const valid = { type: 'spawn_creep', amount: 1, creep: 'yellow', radius: 20, duration: 15 };
  for (const key of creep.required) {
    const missing = { ...valid };
    delete missing[key];
    assert.throws(() => validateSchema(missing, schema));
  }
  for (const invalid of [
    { radius: 19 }, { radius: 81 }, { radius: null }, { radius: '20' },
    { duration: 14 }, { duration: 181 }, { duration: 15.5 },
    { amount: 0 }, { amount: 5 }, { creep: 'invented' },
    { cost: 3 }, { status: 'slow' }, { target_mode: 'nearby' },
  ]) assert.throws(() => validateSchema({ ...valid, ...invalid }, schema));
  const profile = retaliationProfile(valid, 'tear_impact');
  validateProfile(profile);
  for (const invalid of [{ ...valid, radius: 81 }, { ...valid, duration: 181 }, { ...valid, cost: 3 }]) {
    assert.throws(() => validateProfile(retaliationProfile(invalid, 'tear_impact')));
  }
});

function retaliationProfile(action, trigger = "player_hurt") {
  const proc = { conditions: [], actions: [action], cooldown: 30 };
  const direct = ["collision", "on_kill", "tear_impact"].includes(trigger);
  return {
    region: "passive", systems: [direct ? trigger : ["player_hurt", "enemy_hit"].includes(trigger) ? "on_hit" : "rules"], affects_stats: false,
    metadata: { display_name: "Thorn", description: "Retaliates", quality: 4, theme: "none", balance_note: "" },
    visuals: { pedestal_prompt: "a thorn" }, rules: direct ? [] : [{ trigger, ...proc }],
    ...(direct ? { [trigger]: proc } : {}),
  };
}

test("retaliation preserves attacker defaults and exposes optional catalog-bounded nearby targeting", async () => {
  const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));
  assert.equal(catalog.version, 12);
  assert.equal(catalog.profile_version, 1);
  const spec = catalog.combat_effects.retaliate;
  assert.equal(spec.default_target_mode, "attacker");
  assert.equal(spec.nearby_trigger, "player_hurt");
  assert.equal(spec.max_targets, 8);
  const schema = ITEM_SCHEMA.properties.rules.items.properties.actions.items.anyOf[0];
  assert.deepEqual(schema.properties.target_mode.enum, spec.target_modes);
  assert.ok(!schema.required.includes("target_mode"));
  assert.equal(schema.properties.radius.minimum, 20);
  assert.equal(spec.radius_bounds[0], 40);
  assert.equal(schema.properties.radius.maximum, spec.radius_bounds[1]);
  for (const trigger of ["player_hurt", "collision"]) {
    for (const action of [{ type: "retaliate", amount: 2 }, { type: "retaliate", amount: 2, target_mode: "attacker" }]) {
      const profile = retaliationProfile(action, trigger);
      const original = structuredClone(profile);
      validateProfile(profile);
      assert.deepEqual(profile, original);
    }
  }
  for (const radius of [40, 60, 60.5, 120]) validateProfile(retaliationProfile({ type: "retaliate", amount: 3, target_mode: "nearby", radius }));
});

test("retaliation rejects unsupported modes, contexts, radius combinations and custom target limits", () => {
  for (const patch of [
    { target_mode: "all" }, { target_mode: null }, { target_mode: false },
    { radius: 80 }, { target_mode: "attacker", radius: 80 },
    { target_mode: "nearby" }, { target_mode: "nearby", radius: 39 },
    { target_mode: "nearby", radius: 121 }, { target_mode: "nearby", radius: Infinity },
    { target_mode: "nearby", radius: 80, max_targets: 9 },
  ]) assert.throws(() => validateProfile(retaliationProfile({ type: "retaliate", amount: 2, ...patch })));
  validateProfile(retaliationProfile({ type: "retaliate", amount: 2, target_mode: "nearby", radius: 80 }, "collision"));
  for (const trigger of ["enemy_hit", "on_kill", "tear_impact", "room_clear", "tear_fire"]) {
    assert.throws(() => validateProfile(retaliationProfile({ type: "retaliate", amount: 2, target_mode: "nearby", radius: 80 }, trigger)));
  }
  for (const action of [
    { type: "damage_burst", amount: 2, radius: 80, target_mode: "nearby" },
    { type: "apply_status", amount: 1, status: "fear", duration: 30, target_mode: "attacker" },
    { type: "grant_soul_hearts", amount: 1, target_mode: "nearby" },
  ]) assert.throws(() => validateProfile(retaliationProfile(action, action.type === "damage_burst" ? "on_kill" : action.type === "apply_status" ? "tear_impact" : "room_clear")));
  const profile = retaliationProfile({ type: "retaliate", amount: 2, target_mode: "nearby", radius: 80 });
  profile.rules[0].cooldown = 29;
  assert.throws(() => validateProfile(profile));
});

function activeProfile() {
  return {
    region: "passive", systems: ["active"], affects_stats: false,
    metadata: { display_name: "Ashen Pulse", description: "A radial damage burst", quality: 1, theme: "cursed", balance_note: "" },
    visuals: { pedestal_prompt: "a tiny bell", sound: "chime", animation: "pulse" },
    rules: [], active: { effect: "radial_burst", charges: 6, targeting: "self", damage: 4, radius: 100 },
  };
}

test("active schema bounds follow the catalog and accepted profiles remain unchanged", async () => {
  const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));
  assert.equal(ITEM_SCHEMA.properties.active.properties.damage.maximum, catalog.active.damage_bounds[1]);
  assert.equal(ITEM_SCHEMA.properties.active.properties.radius.minimum, catalog.active.radius_bounds[0]);
  const profile = activeProfile();
  const original = structuredClone(profile);
  validateProfile(profile);
  assert.deepEqual(profile, original);
  assert.equal(catalog.active.use_restrictions.spend_charge_on, "successful_damage");
  assert.equal(catalog.active.use_restrictions.allows_car_battery_use, false);
});

test("actives reject unsupported effects, charges, targets, bounds, and engine flags", () => {
  for (const patch of [
    { effect: "spawn_pickup" }, { charges: 3 }, { targeting: "cursor" },
    { damage: 0 }, { damage: 7 }, { radius: 39 }, { radius: 121 },
    { Discharge: true }, { max_targets: 100 }, { damage: Infinity },
  ]) {
    const profile = activeProfile();
    Object.assign(profile.active, patch);
    assert.throws(() => validateProfile(profile), undefined, JSON.stringify(patch));
  }
});

test("active restrictions cannot be removed by normalization or phrase repair", () => {
  for (const patch of [
    { systems: ["active", "stats"] }, { systems: ["active", "active"] },
    { systems: [] }, { affects_stats: true }, { region: "familiar" },
    { stats: { damage: -1 } }, { familiar: { type: "normal" } },
    { tear_profile: { flags: [] } }, { rules: [{ trigger: "room_clear", conditions: [], actions: [] }] },
  ]) {
    const profile = Object.assign(activeProfile(), patch);
    const original = structuredClone(profile);
    assert.throws(() => repairGeneratedProfile(profile, "Add damage. Tears poison.", 1), /Active items/);
    assert.deepEqual(profile, original);
    assert.throws(() => validateProfile(profile));
  }
  const profile = activeProfile();
  repairGeneratedProfile(profile, "Add damage. Tears poison.", 1);
  assert.deepEqual(profile.systems, ["active"]);
  validateProfile(profile);
  profile.metadata.quality = 0;
  assert.throws(() => validateProfile(profile), /weight budget/);
});

test("unknown fields and IDs are rejected before discarded blocks and rules are repaired", () => {
  for (const patch of [
    { unsupported: true }, { constructor: 0 },
    { stats: { damage: 0, execute: "code" } },
    { rules: [{ trigger: "unknown", conditions: [], actions: [] }] },
    { rules: [{ trigger: "room_clear", conditions: [], actions: [{ type: "execute", amount: 1 }] }] },
    { visuals: { pedestal_prompt: "bell", sound: "unknown" } },
  ]) {
    const profile = Object.assign(activeProfile(), { systems: [], active: undefined }, patch);
    assert.throws(() => repairGeneratedProfile(profile, "", 1), /unsupported/);
    assert.throws(() => validateProfile(profile));
  }
});

test("condition parameters belong only to their declared condition", () => {
  for (const system of ["rules", "on_kill"]) {
    const profile = activeProfile();
    delete profile.active;
    profile.systems = [system];
    const proc = { conditions: [{ type: "once_per_room", chance: 0.5 }], actions: [{ type: "spawn_pickup", pickup_type: "coin", amount: 1 }] };
    if (system === "rules") profile.rules = [{ ...proc, trigger: "room_clear" }];
    else profile.on_kill = proc;
    assert.throws(() => validateProfile(profile), /conditions\[0\]\.chance is unsupported for once_per_room/);
  }
});

test("flavor briefs repair into damage and combat instead of room-clear loot", () => {
  const profile = {
    region: "passive",
    systems: ["stats", "on_kill"],
    affects_stats: true,
    metadata: { display_name: "Burst Charm", description: "Damage and a kill burst", quality: 3, theme: "none", balance_note: "" },
    stats: { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0 },
    visuals: { pedestal_prompt: "a small charm" },
    rules: [],
  };
  const prompt = 'A passive item inspired by "poopsock" slightly raises Isaac\'s damage and when an enemy dies, deals a small damage burst.';
  repairGeneratedProfile(profile, prompt, 3);
  assert.ok(profile.stats.damage > 0);
  assert.equal(profile.on_kill.actions[0].type, "damage_burst");
  assert.equal(profile.on_kill.cooldown, 30);
  assert.ok(!profile.rules?.some((rule) => rule.actions?.some((action) => action.type === "spawn_pickup" || action.type === "grant_soul_hearts")));
  validateProfile(profile);
  const tight = structuredClone(profile);
  tight.metadata.quality = 1;
  tight.stats.damage = 1;
  tight.on_kill.actions[0] = { type: "damage_burst", amount: 1, radius: 80 };
  repairGeneratedProfile(tight, prompt, 1);
  assert.equal(tight.metadata.quality, 1);
  assert.equal(tight.on_kill.actions[0].type, "damage_burst");
  validateProfile(tight);
});

test("capability catalog exposes only bounded passive and active effect families", async () => {
  const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));
  assert.deepEqual(catalog.actions, ["spawn_pickup", "spawn_friendly", "grant_soul_hearts", "grant_half_red_hearts", "grant_full_red_hearts", "grant_black_hearts", "grant_eternal_hearts", "grant_bone_hearts", "grant_gold_hearts", "grant_rotten_hearts", "grant_heart_containers", "grant_stat", "damage_burst", "apply_status", "retaliate", "convert_resource", "activate_aura", "spawn_creep", "refill_charge", "extra_tears", "target_impulse", "block_projectiles", "reflect_projectiles", "execute_enemy", "dash", "coins_to_charge", "temporary_ally"]);
  assert.deepEqual(catalog.quality_budgets, [4, 8, 12, 18, 24]);
  assert.deepEqual(catalog.friendlies, ["attack_fly", "spider", "pooter", "dip", "minisaac"]);
  assert.deepEqual(catalog.stat_bounds.speed, [-0.15, 0.5]);
  assert.deepEqual(catalog.regions, ["passive", "familiar", "aura", "familiar_aura"]);
  assert.deepEqual(catalog.systems, ["stats", "tears", "rules", "familiar", "aura", "on_hit", "on_kill", "tear_impact", "collision", "tear_update", "bomb", "laser", "knife", "active"]);
  assert.deepEqual(catalog.tear_update_behaviors, ["home", "pulse", "shrink", "spiral", "accelerate"]);
  assert.deepEqual(catalog.familiars, ["sentry", "melee", "normal", "shield", "orbit_contact"]);
  assert.deepEqual(catalog.familiar_patterns, ["single", "fan", "lob", "varied"]);
  assert.deepEqual(catalog.auras, ["damage", "slow", "burn", "fear", "charm", "poison", "confusion"]);
  assert.deepEqual(catalog.item_limits, { max_systems: 6, max_total_flags: 3 });
  assert.equal(catalog.entity_type, "passive_item");
  assert.deepEqual(catalog.active.effects,["radial_burst"]);
  assert.deepEqual(catalog.active.charges,[6]);
  assert.equal(catalog.active.max_targets,8);
  assert.equal(catalog.active.shell_capacity,8);
  assert.ok(catalog.triggers.includes("room_clear"));
});

test("auto design retries an invalid idea and returns the requested quality", async () => {
  const profile = {
    region: "passive", systems: ["active"], affects_stats: false,
    metadata: { display_name: "Ashen Pulse", description: "A radial burst of damage", quality: 1, theme: "cursed", balance_note: "" },
    visuals: { pedestal_prompt: "single rusty iron nail, cursed sickly green glint, pixel art game icon, centered object, plain transparent background, no text" },
    rules: [], active: { effect: "radial_burst", charges: 6, targeting: "self", damage: 4, radius: 100 },
  };
  const ideas = ["nope", "A ringing glass eye that watches the room.", "A ringing glass eye that watches the room.", "A second glass eye that blinks in the dark."];
  let index = 0;
  let designs = 0;
  const result = await designUntilValid({
    quality: 1,
    itemType: "active",
    ideas: async () => ideas[index++],
    design: async () => {
      designs += 1;
      if (designs === 1) throw Error("schema validation failed");
      return structuredClone(profile);
    },
  });
  assert.equal(designs, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.idea, "A second glass eye that blinks in the dark.");
  assert.equal(result.profile.metadata.quality, 1);
  await assert.rejects(() => designUntilValid({
    quality: 1, itemType: "active", maxAttempts: 2,
    ideas: async () => "A repeated hollow bell that never changes.",
    design: async () => { throw Error("still invalid"); },
  }), /invalid after 2 ideas/);
});

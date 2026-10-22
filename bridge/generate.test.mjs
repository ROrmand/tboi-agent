import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ITEM_SCHEMA, repairGeneratedProfile, validateProfile } from "./generate.mjs";

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
  assert.equal(catalog.version, 3);
  assert.equal(catalog.profile_version, 1);
  const spec = catalog.combat_effects.retaliate;
  assert.equal(spec.default_target_mode, "attacker");
  assert.equal(spec.nearby_trigger, "player_hurt");
  assert.equal(spec.max_targets, 8);
  const schema = ITEM_SCHEMA.properties.rules.items.properties.actions.items;
  assert.deepEqual(schema.properties.target_mode.enum, spec.target_modes);
  assert.ok(!schema.required.includes("target_mode"));
  assert.equal(schema.properties.radius.minimum, spec.radius_bounds[0]);
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
  for (const trigger of ["collision", "enemy_hit", "on_kill", "tear_impact", "room_clear", "tear_fire"]) {
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
    assert.throws(() => validateProfile(profile), /chance requires/);
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
  assert.deepEqual(catalog.actions, ["spawn_pickup", "spawn_friendly", "grant_soul_hearts", "grant_half_red_hearts", "grant_full_red_hearts", "grant_black_hearts", "grant_eternal_hearts", "grant_bone_hearts", "grant_stat", "damage_burst", "apply_status", "retaliate", "convert_resource", "activate_aura"]);
  assert.deepEqual(catalog.quality_budgets, [4, 8, 12, 18, 24]);
  assert.deepEqual(catalog.friendlies, ["attack_fly", "spider", "pooter"]);
  assert.deepEqual(catalog.stat_bounds.speed, [-0.15, 0.5]);
  assert.deepEqual(catalog.regions, ["passive", "familiar", "aura", "familiar_aura"]);
  assert.deepEqual(catalog.systems, ["stats", "tears", "rules", "familiar", "aura", "on_hit", "on_kill", "tear_impact", "collision", "tear_update", "bomb", "laser", "knife", "active"]);
  assert.deepEqual(catalog.tear_update_behaviors, ["home", "pulse", "shrink"]);
  assert.deepEqual(catalog.familiars, ["sentry", "melee", "normal", "shield"]);
  assert.deepEqual(catalog.familiar_patterns, ["single", "fan", "lob", "varied"]);
  assert.deepEqual(catalog.auras, ["damage", "slow", "burn", "fear"]);
  assert.deepEqual(catalog.item_limits, { max_systems: 6, max_total_flags: 3 });
  assert.equal(catalog.entity_type, "passive_item");
  assert.deepEqual(catalog.active.effects,["radial_burst"]);
  assert.deepEqual(catalog.active.charges,[6]);
  assert.equal(catalog.active.max_targets,8);
  assert.equal(catalog.active.shell_capacity,8);
  assert.ok(catalog.triggers.includes("room_clear"));
});

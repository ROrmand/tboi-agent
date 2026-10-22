import test from "node:test";
import assert from "node:assert/strict";
import { applyRegion, applySystems, repairNote, repairProfile } from "./prompt-features.mjs";

const featured = (region) => ({
  region,
  familiar: { type: "normal", damage: 1, cooldown: 30, range: 120, sprite_prompt: "tiny friend" },
  aura: { type: "damage", damage: 0.5, radius: 80, cooldown: 30 },
  stats: { luck: 1 },
});

test("active profiles never acquire passive stats, flags, or rewards from phrase repair", () => {
  const profile = { systems: ["active"], active: { effect: "radial_burst" }, rules: [] };
  const original = structuredClone(profile);
  repairProfile(profile, "Add damage. Tears poison. When I clear a room, I sometimes find a coin.");
  assert.deepEqual(profile, original);
});

test("a passive region drops familiar and aura the model also filled", () => {
  const profile = applyRegion({ ...featured("passive"), systems: ["stats", "familiar", "aura", "tears"] });
  assert.equal(profile.familiar, undefined);
  assert.equal(profile.aura, undefined);
  assert.equal(profile.stats.luck, 1);
  assert.deepEqual(profile.systems, ["stats", "tears"]);
});

test("a familiar region keeps the companion and drops the aura", () => {
  const profile = applyRegion(featured("familiar"));
  assert.equal(profile.familiar.type, "normal");
  assert.equal(profile.aura, undefined);
});

test("an aura region keeps the aura and a combined region keeps both", () => {
  assert.equal(applyRegion(featured("aura")).aura.type, "damage");
  assert.equal(applyRegion(featured("aura")).familiar, undefined);
  const both = applyRegion(featured("familiar_aura"));
  assert.equal(both.familiar.type, "normal");
  assert.equal(both.aura.type, "damage");
});

test("unmarked systems drop their blocks and hit rules", () => {
  const profile = applySystems({
    systems: ["rules"],
    stats: { luck: 1 },
    tear_profile: { flags: ["glow"] },
    familiar: { type: "normal" },
    aura: { type: "damage" },
    on_kill: { conditions: [], actions: [{ type: "grant_soul_hearts", amount: 1 }] },
    rules: [
      { trigger: "room_clear", conditions: [], actions: [{ type: "spawn_pickup", amount: 1 }] },
      { trigger: "player_hurt", conditions: [], actions: [{ type: "grant_soul_hearts", amount: 1 }] },
    ],
  });
  assert.equal(profile.stats, undefined);
  assert.equal(profile.tear_profile, undefined);
  assert.equal(profile.familiar, undefined);
  assert.equal(profile.aura, undefined);
  assert.equal(profile.on_kill, undefined);
  assert.equal(profile.affects_stats, false);
  assert.deepEqual(profile.rules.map((rule) => rule.trigger), ["room_clear"]);
});

test("an on_hit repair tells the model to add the hit rule", () => {
  const note = repairNote("The on_hit system requires a player_hurt or enemy_hit rule.");
  assert.match(note, /player_hurt/);
  assert.match(note, /spawn_pickup/);
  assert.doesNotMatch(note, /rules: \[\]/);
});

test("repair notes name the missing object", () => {
  assert.match(repairNote("The stats system requires stats."), /stats\.speed|speed above 0/);
  assert.match(repairNote("The tears system requires a tear profile."), /tear_profile/);
  assert.match(repairNote("The on_kill system requires its proc."), /damage_burst/);
  assert.match(repairNote("Combat effects require their catalog trigger and at least 30 frames cooldown."), /Do not replace a combat action/);
  assert.match(repairNote("The tear_impact system requires its proc."), /tear_impact/);
  assert.match(repairNote("metadata.description exceeds the 64-byte game limit."), /60 characters/);
  assert.match(repairNote("Item spends 14 weight and quality 3 allows 18. The weight budget cannot hold this item."), /Quality 3 allows 18/);
  assert.match(repairNote("Item spends 10 weight and quality 1 allows 8. The weight budget cannot hold this item."), /Quality 1 allows 8/);
  assert.match(repairNote("The aura system must match the region."), /passive cannot include familiar or aura/);
});

test("a speed and room-clear wish gets the missing stats object and rule", () => {
  const profile = repairProfile({
    region: "passive",
    systems: ["stats", "rules"],
    rules: [],
  }, "Tech theme: a sparking battery. Move a bit faster. When I clear a room, grant me a soul heart.");
  assert.equal(profile.stats.speed, 0.1);
  assert.equal(profile.stats.damage, 0);
  assert.equal(profile.rules[0].trigger, "room_clear");
  assert.equal(profile.rules[0].actions[0].type, "grant_soul_hearts");
});

test("a tear hit and a death wish get their procs", () => {
  const impact = repairProfile({
    region: "passive",
    systems: ["tear_impact"],
    rules: [],
  }, "Cosmic theme: a void pebble. When a tear hits an enemy, I sometimes find a key.");
  assert.equal(impact.tear_impact.actions[0].pickup_type, "key");
  assert.equal(impact.rules.length, 0);

  const kill = repairProfile({
    region: "passive",
    systems: ["on_kill"],
    rules: [],
  }, "Angelic theme: a small halo charm. When an enemy dies, I sometimes find a coin.");
  assert.equal(kill.on_kill.actions[0].pickup_type, "coin");
  assert.ok(kill.systems.includes("on_kill"));
});

test("shot speed does not keep an empty tears system", () => {
  const profile = repairProfile({
    region: "aura",
    systems: ["aura", "stats", "tears"],
    aura: { type: "damage", damage: 0.5, radius: 80, cooldown: 30 },
    rules: [],
  }, "Cosmic theme: a cracked star shard. Enemies near me take a cosmic pulse of damage. Raise shot speed.");
  assert.equal(profile.systems.includes("tears"), false);
  assert.equal(profile.tear_profile, undefined);
  assert.equal(profile.stats.shot_speed, 0.15);
  assert.equal(profile.aura.type, "damage");
});

test("split, pierce, and poison fill a missing tear profile", () => {
  const profile = repairProfile({
    region: "passive",
    systems: ["tears"],
    rules: [],
  }, "Gross theme: a bile sac. Tears split. Tears can pierce. Tears poison");
  assert.deepEqual(profile.tear_profile.flags, ["split", "piercing", "poison"]);
});

test("range and piercing fill stats and tears without replacing a familiar attack", () => {
  const profile = repairProfile({
    region: "familiar",
    systems: ["tears", "familiar"],
    familiar: { type: "normal", damage: 1.2, cooldown: 60, range: 160, sprite_prompt: "tiny pebble", attack: { pattern: "single", flags: ["charm"], color: { r: 0.3, g: 0.4, b: 0.8, a: 1 }, scale: 0.8, speed: 8 } },
    tear_update: { behavior: "home", strength: 1.2 },
    rules: [],
  }, "Cosmic theme: a void pebble. A cosmic familiar follows behind me and fires. Tears charm enemies.");
  assert.deepEqual(profile.tear_profile.flags, ["charm"]);
  assert.deepEqual(profile.familiar.attack.flags, ["charm"]);
  applySystems(profile);
  assert.equal(profile.tear_update, undefined);
  assert.equal(profile.systems.includes("tears"), true);
});

test("a hit wish gets a player_hurt rule and a long description is shortened", () => {
  const profile = repairProfile({
    region: "passive",
    systems: ["on_hit"],
    metadata: { display_name: "n".repeat(80), description: "d".repeat(90) },
    rules: [],
  }, "When I get hit, I sometimes find a coin. Tears poison. Add luck.");
  assert.equal(profile.rules[0].trigger, "player_hurt");
  assert.equal(profile.rules[0].actions[0].pickup_type, "coin");
  assert.deepEqual(profile.tear_profile.flags, ["poison"]);
  assert.equal(profile.stats.luck, 1);
  assert.ok(Buffer.byteLength(profile.metadata.display_name, "utf8") <= 64);
  assert.ok(Buffer.byteLength(profile.metadata.description, "utf8") <= 64);
});

test("a filled tear profile keeps the model's flags", () => {
  const profile = repairProfile({
    systems: ["stats", "tears"],
    stats: { damage: 0, tears: 0, shot_speed: 0, range: 5, speed: 0.1, luck: 0, soul_hearts: 0 },
    tear_profile: { flags: ["orbit"], color: { r: 1, g: 1, b: 1, a: 1 }, scale: 1 },
    rules: [{ trigger: "new_floor", conditions: [{ type: "chance", chance: 0.3 }], actions: [{ type: "spawn_pickup", pickup_type: "bomb", amount: 1 }] }],
  }, "Cosmic theme: a cracked star shard. Add range. Tears orbit me. When I reach a new floor, I sometimes find a bomb.");
  assert.equal(profile.stats.range, 5);
  assert.deepEqual(profile.tear_profile.flags, ["orbit"]);
  assert.equal(profile.rules.length, 1);
});

test("a flavor brief fills damage and a kill burst instead of a room-clear coin", () => {
  const profile = repairProfile({
    region: "passive",
    systems: ["stats", "on_kill"],
    rules: [{ trigger: "room_clear", conditions: [], actions: [{ type: "spawn_pickup", pickup_type: "coin", amount: 1 }] }],
  }, 'A passive item inspired by "poopsock" slightly raises Isaac\'s damage and when an enemy dies, deals a small damage burst.');
  assert.equal(profile.stats.damage, 1);
  assert.equal(profile.on_kill.actions[0].type, "damage_burst");
  assert.equal(profile.on_kill.cooldown, 30);
  assert.equal(profile.rules.some((rule) => rule.actions?.some((action) => action.type === "spawn_pickup")), false);
});

test("a kill burst missing cooldown keeps the combat action", () => {
  const profile = repairProfile({
    region: "passive",
    systems: ["on_kill"],
    on_kill: { conditions: [], actions: [{ type: "damage_burst", amount: 1, radius: 80 }] },
    rules: [],
  }, "When an enemy dies, deal a small burst.");
  assert.equal(profile.on_kill.cooldown, 30);
  assert.equal(profile.on_kill.actions[0].type, "damage_burst");
});

test("a marked callback keeps its proc and a stats system sets the flag", () => {
  const profile = applySystems({
    systems: ["stats", "on_kill", "tear_impact", "collision"],
    stats: { luck: 1 },
    on_kill: { conditions: [], actions: [{ type: "grant_soul_hearts", amount: 1 }] },
    tear_impact: { conditions: [], actions: [{ type: "spawn_pickup", amount: 1 }] },
    collision: { conditions: [], actions: [{ type: "spawn_pickup", amount: 1 }] },
    rules: [],
  });
  assert.equal(profile.affects_stats, true);
  assert.equal(profile.stats.luck, 1);
  assert.equal(profile.on_kill.actions[0].type, "grant_soul_hearts");
  assert.equal(profile.tear_impact.actions[0].type, "spawn_pickup");
  assert.equal(profile.collision.actions[0].type, "spawn_pickup");
});

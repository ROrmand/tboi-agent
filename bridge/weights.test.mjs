import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertCatalogWeights, fitWeightBudget, profileWeight, raiseQualityToFit, statSteps } from "./weights.mjs";

const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));

test("every catalog effect has a weight and quality spends a fixed budget", () => {
  assertCatalogWeights(catalog);
  assert.deepEqual(catalog.quality_budgets, [4, 8, 12, 18, 24]);
  assert.equal(statSteps(-0.15, 0.1), -1);
  assert.equal(statSteps(0.1, 0.1), 1);
  assert.equal(statSteps(1, 0.5), 2);
});

test("a profile spends flag, stat, pickup, and friendly weight", () => {
  const spent = profileWeight({
    metadata: { quality: 2 },
    systems: ["stats", "tears", "rules"],
    stats: { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: -0.15, luck: 0, soul_hearts: 0 },
    tear_profile: { flags: ["glow"] },
    rules: [{ actions: [{ type: "spawn_friendly", friendly_type: "attack_fly", amount: 1 }] }],
  }, catalog);
  assert.equal(catalog.weights.stats.damage.weight, 1);
  assert.equal(catalog.weights.stats.tears.weight, 1);
  assert.equal(catalog.weights.stats.luck.weight, 1);
  assert.equal(catalog.weights.stats.range.step, 1);
  assert.equal(catalog.weights.stats.speed.weight, 4);
  assert.equal(catalog.weights.stats.shot_speed.weight, 3);
  assert.equal(catalog.weights.heart_rewards.grant_soul_hearts, 8);
  assert.equal(spent, -4 + 6 + 2);
  assert.equal(profileWeight({
    systems: ["stats"],
    stats: { damage: 1, tears: 1, shot_speed: 0.1, range: 4, speed: 0.1, luck: 1, soul_hearts: 0 },
    rules: [],
  }, catalog), 1 + 1 + 3 + 4 + 4 + 1);
  assert.equal(profileWeight({
    metadata: { quality: 0 },
    systems: ["tears"],
    tear_profile: { flags: ["homing", "explosive"] },
    rules: [],
  }, catalog), 12);
  assert.equal(profileWeight({
    systems: ["rules"],
    rules: [{ trigger: "room_clear", conditions: [], actions: [{ type: "grant_soul_hearts", amount: 1 }] }],
  }, catalog), 8);
  assert.equal(profileWeight({
    systems: ["rules"],
    rules: [{ trigger: "room_clear", conditions: [], actions: [{ type: "grant_soul_hearts", amount: 2 }] }],
  }, catalog), 16);
  const raised = raiseQualityToFit({
    metadata: { quality: 3 },
    systems: ["tears", "on_kill", "tear_impact", "rules"],
    tear_profile: { flags: ["sticky", "glow", "homing"] },
    on_kill: { actions: [{ type: "spawn_friendly", friendly_type: "pooter", amount: 1 }] },
    tear_impact: { actions: [{ type: "spawn_friendly", friendly_type: "pooter", amount: 1 }] },
    rules: [{ actions: [{ type: "grant_soul_hearts", amount: 1 }] }],
  }, catalog);
  assert.equal(raised.metadata.quality, 3);
  const tooStrong = raiseQualityToFit({
    metadata: { quality: 4 },
    systems: ["rules"],
    rules: [{ actions: [{ type: "grant_soul_hearts", amount: 4 }] }],
  }, catalog);
  assert.equal(tooStrong.metadata.quality, 4);
  const greasy = fitWeightBudget({
    metadata: { quality: 4, balance_note: "" },
    region: "passive",
    systems: ["stats", "tears", "on_kill"],
    affects_stats: true,
    stats: { damage: 1, tears: 0, shot_speed: 0, range: 0, speed: 0.1, luck: 0, soul_hearts: 0 },
    tear_profile: { flags: ["burn", "glow", "wiggle"] },
    on_kill: { actions: [{ type: "spawn_friendly", friendly_type: "pooter", amount: 1 }] },
    rules: [],
  }, catalog);
  assert.equal(greasy.stats.speed, 0);
  assert.equal(greasy.stats.damage, 1);
  assert.deepEqual(greasy.tear_profile.flags, ["burn", "glow", "wiggle"]);
  assert.equal(greasy.on_kill.actions[0].friendly_type, "pooter");
  assert.match(greasy.metadata.balance_note, /cut to fit the weight budget/);
  assert.ok(profileWeight(greasy, catalog) <= catalog.quality_budgets[4]);
  const packed = fitWeightBudget({
    metadata: { quality: 4, balance_note: "" },
    region: "passive",
    systems: ["stats", "tears", "on_kill", "tear_impact", "rules"],
    stats: { damage: 1, tears: 0, shot_speed: 0.1, range: 0, speed: 0.1, luck: 0, soul_hearts: 0 },
    tear_profile: { flags: ["homing", "explosive", "piercing"] },
    on_kill: { actions: [{ type: "spawn_friendly", friendly_type: "pooter", amount: 1 }] },
    tear_impact: { actions: [{ type: "spawn_friendly", friendly_type: "pooter", amount: 1 }] },
    rules: [{ trigger: "room_clear", actions: [{ type: "grant_soul_hearts", amount: 1 }] }],
  }, catalog);
  assert.equal(packed.stats.speed, 0);
  assert.equal(packed.stats.damage, 1);
  assert.equal(packed.rules[0].actions[0].type, "grant_soul_hearts");
  assert.ok(profileWeight(packed, catalog) <= catalog.quality_budgets[4]);
  assert.match(packed.metadata.balance_note, /cut to fit the weight budget/);
  const hearts = fitWeightBudget({
    metadata: { quality: 4, balance_note: "" },
    region: "passive",
    systems: ["rules"],
    rules: [{ trigger: "room_clear", actions: [{ type: "grant_soul_hearts", amount: 2 }] }],
  }, catalog);
  assert.equal(hearts.rules[0].actions[0].amount, 2);
  assert.equal(profileWeight(hearts, catalog), 16);
  const affordable = fitWeightBudget({
    metadata: { quality: 4, balance_note: "kept" },
    region: "passive",
    systems: ["stats", "tears"],
    stats: { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0.1, luck: 0, soul_hearts: 0 },
    tear_profile: { flags: ["glow"] },
    rules: [],
  }, catalog);
  assert.equal(affordable.stats.speed, 0.1);
  assert.equal(affordable.metadata.balance_note, "kept");
  const requested = fitWeightBudget({
    metadata: { quality: 4, balance_note: "" },
    region: "passive", systems: ["tears"], tear_profile: { flags: ["glow"] }, rules: [],
  }, catalog, 1);
  assert.equal(requested.metadata.quality, 1);
  assert.ok(profileWeight(requested, catalog) <= catalog.quality_budgets[1]);
});

test("requested balance charges flat stats, multiplier, health, effects, and flight", () => {
  const stats = (changes) => ({ systems: ["stats"], stats: { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0, ...changes } });
  for (const [changes, expected] of [
    [{ damage: 1 }, 1], [{ damage: -1 }, -1],
    [{ damage_multiplier: 1.1 }, 2], [{ damage_multiplier: 2 }, 11],
    [{ damage_multiplier: 0.9 }, -2], [{ damage_multiplier: 0.5 }, -11],
    [{ range: 1 }, 1], [{ range: -1 }, -1],
    [{ tears: 1 }, 1], [{ tears: -1 }, -1],
    [{ luck: 1 }, 1], [{ luck: -1 }, -1],
    [{ soul_hearts: 1 }, 2], [{ soul_hearts: -1 }, -2],
    [{ flying: true }, 8],
  ]) assert.equal(profileWeight(stats(changes), catalog), expected, JSON.stringify(changes));
  for (const flag of catalog.tear_flags) assert.equal(profileWeight({ systems: ["tears"], tear_profile: { flags: [flag] } }, catalog), 6, flag);
  assert.equal(profileWeight({ systems: ["aura"] }, catalog), 6);
});

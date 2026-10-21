import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("capability catalog exposes only bounded passive effect families", async () => {
  const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));
  assert.deepEqual(catalog.actions, ["spawn_pickup", "spawn_friendly", "grant_soul_hearts", "grant_half_red_hearts", "grant_full_red_hearts", "grant_black_hearts", "grant_eternal_hearts", "grant_bone_hearts", "grant_stat"]);
  assert.deepEqual(catalog.quality_budgets, [4, 8, 12, 18, 24]);
  assert.deepEqual(catalog.friendlies, ["attack_fly", "spider", "pooter"]);
  assert.deepEqual(catalog.stat_bounds.speed, [-0.15, 0.5]);
  assert.deepEqual(catalog.regions, ["passive", "familiar", "aura", "familiar_aura"]);
  assert.deepEqual(catalog.systems, ["stats", "tears", "rules", "familiar", "aura", "on_hit", "on_kill", "tear_impact", "collision", "tear_update", "bomb", "laser", "knife"]);
  assert.deepEqual(catalog.tear_update_behaviors, ["home", "pulse", "shrink"]);
  assert.deepEqual(catalog.familiars, ["sentry", "melee", "normal", "shield"]);
  assert.deepEqual(catalog.familiar_patterns, ["single", "fan", "lob", "varied"]);
  assert.deepEqual(catalog.auras, ["damage", "slow", "burn", "fear"]);
  assert.deepEqual(catalog.item_limits, { max_systems: 6, max_total_flags: 3 });
  assert.equal(catalog.entity_type, "passive_item");
  assert.ok(catalog.triggers.includes("room_clear"));
});

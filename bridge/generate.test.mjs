import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("capability catalog exposes only bounded passive effect families", async () => {
  const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));
  assert.deepEqual(catalog.actions, ["spawn_pickup", "grant_soul_hearts"]);
  assert.deepEqual(catalog.regions, ["passive", "familiar", "aura", "familiar_aura"]);
  assert.deepEqual(catalog.systems, ["stats", "tears", "rules", "familiar", "aura", "on_hit", "on_kill", "tear_impact", "collision", "tear_update", "bomb", "laser", "knife"]);
  assert.deepEqual(catalog.tear_update_behaviors, ["home", "pulse", "shrink"]);
  assert.deepEqual(catalog.familiars, ["sentry", "melee", "normal", "shield"]);
  assert.deepEqual(catalog.familiar_patterns, ["single", "fan", "lob", "varied"]);
  assert.deepEqual(catalog.auras, ["damage"]);
  assert.equal(catalog.entity_type, "passive_item");
  assert.ok(catalog.triggers.includes("room_clear"));
});

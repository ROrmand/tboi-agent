import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("capability catalog stays within the first passive slice", async () => {
  const catalog = JSON.parse(await readFile(new URL("../content-contract/capabilities.json", import.meta.url)));
  assert.deepEqual(catalog.actions, ["spawn_pickup", "grant_soul_hearts"]);
  assert.equal(catalog.entity_type, "passive_item");
  assert.ok(catalog.triggers.includes("room_clear"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { applyRegion } from "./prompt-features.mjs";

const featured = (region) => ({
  region,
  familiar: { type: "normal", damage: 1, cooldown: 30, range: 120, sprite_prompt: "tiny friend" },
  aura: { type: "damage", damage: 0.5, radius: 80, cooldown: 30 },
  stats: { luck: 1 },
});

test("a passive region drops familiar and aura the model also filled", () => {
  const profile = applyRegion(featured("passive"));
  assert.equal(profile.familiar, undefined);
  assert.equal(profile.aura, undefined);
  assert.equal(profile.stats.luck, 1);
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

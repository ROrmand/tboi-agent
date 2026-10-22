import test from "node:test";
import assert from "node:assert/strict";
import { repairGeneratedProfile, validateProfile } from "./generate.mjs";

function passive(extra = {}) {
  return {
    region: "passive",
    systems: ["rules"],
    affects_stats: false,
    metadata: { display_name: "Pale Candle", description: "Grants luck", quality: 2, theme: "none", balance_note: "" },
    visuals: { pedestal_prompt: "a pale candle" },
    rules: [{ trigger: "room_enter", conditions: [], actions: [{ type: "grant_stat", amount: 1 }] }],
    ...extra,
  };
}

test("repair fills a missing grant stat from the brief and strips illegal fields", () => {
  const profile = passive();
  profile.rules[0].actions[0].input_resource = "coin";
  profile.rules[0].actions[0].cost = 1;
  profile.rules[0].conditions = [{ type: "once_per_room", chance: 0.5 }];
  repairGeneratedProfile(profile, "on room enter, grants luck", 2);
  assert.equal(profile.rules[0].actions[0].stat, "luck");
  assert.equal(profile.rules[0].actions[0].input_resource, undefined);
  assert.equal(profile.rules[0].actions[0].cost, undefined);
  assert.equal(profile.rules[0].conditions[0].chance, undefined);
  validateProfile(profile);
});

test("shot speed is chosen before the word speed", () => {
  const profile = passive();
  repairGeneratedProfile(profile, "grants shot speed for the room", 2);
  assert.equal(profile.rules[0].actions[0].stat, "shot_speed");
  validateProfile(profile);
});

test("a selected tear update with no block becomes a pulse", () => {
  const profile = passive({ systems: ["rules", "tear_update"] });
  repairGeneratedProfile(profile, "a pulsing candle", 2);
  assert.deepEqual(profile.tear_update, { behavior: "pulse", strength: 1 });
  validateProfile(profile);
});

test("player death cannot run combat, and creep and charge use their own bounds", () => {
  const burst = passive();
  burst.rules = [{ trigger: "player_death", cooldown: 30, conditions: [], actions: [{ type: "damage_burst", amount: 1, radius: 80 }] }];
  assert.throws(() => validateProfile(burst), /player_death/);

  const creep = passive();
  creep.metadata.quality = 1;
  creep.rules = [{ trigger: "room_clear", conditions: [], actions: [{ type: "spawn_creep", creep: "red", amount: 1, radius: 20, duration: 30 }] }];
  validateProfile(creep);

  const refill = passive();
  refill.metadata.quality = 1;
  refill.rules = [{ trigger: "active_use", conditions: [{ type: "luck_chance", chance: 0.1, luck_scale: 0.05 }], actions: [{ type: "refill_charge", amount: 6 }] }];
  validateProfile(refill);

  const tooMany = passive();
  tooMany.rules = [{ trigger: "room_clear", conditions: [], actions: [{ type: "spawn_pickup", pickup_type: "coin", amount: 5 }] }];
  assert.throws(() => validateProfile(tooMany), /1–4/);
});

test("new conditions accept their parameters and reject borrowed ones", () => {
  const profile = passive();
  profile.rules[0].conditions = [{ type: "room_kind", room: "boss" }, { type: "while_flying" }];
  profile.rules[0].actions = [{ type: "grant_stat", stat: "damage", amount: 1 }];
  validateProfile(profile);
  profile.rules[0].conditions = [{ type: "chance", luck_scale: 0.1, chance: 0.5 }];
  assert.throws(() => validateProfile(profile), /luck_scale/);
});

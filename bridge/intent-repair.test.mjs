import test from "node:test";
import assert from "node:assert/strict";
import { repairGeneratedProfile, validateProfile } from "./generate.mjs";

function profile() {
  return {
    region: "passive", systems: [], affects_stats: false,
    metadata: { display_name: "Thorn", description: "A generated item", quality: 4, theme: "none", balance_note: "" },
    visuals: { pedestal_prompt: "a thorn" }, rules: [],
  };
}

test("the playbook contact and hurt-nearby prompt produces both combat paths", () => {
  const item = profile();
  item.systems = ["collision", "on_hit"];
  item.collision = { conditions: [], actions: [{ type: "spawn_pickup", pickup_type: "coin", amount: 1 }] };
  item.rules = [{ trigger: "player_hurt", conditions: [], actions: [{ type: "retaliate", amount: 1 }] }];
  repairGeneratedProfile(item, "Touching an enemy damages it. When hurt, damage nearby enemies.", 4);
  validateProfile(item);
  assert.deepEqual(item.collision, { conditions: [], cooldown: 30, actions: [{ type: "retaliate", amount: 1 }] });
  assert.deepEqual(item.rules, [{ trigger: "player_hurt", conditions: [], cooldown: 30,
    actions: [{ type: "retaliate", target_mode: "nearby", amount: 1, radius: 80 }] }]);
  const repaired = structuredClone(item);
  repairGeneratedProfile(item, "Touching an enemy damages it. When hurt, damage nearby enemies.", 4);
  assert.deepEqual(item, repaired);
});

test("known combat phrases fill missing systems rather than relying on model selection", () => {
  const item = profile();
  repairGeneratedProfile(item, "Touching an enemy damages it. When hurt, damage nearby enemies.", 4);
  validateProfile(item);
  assert.deepEqual(item.systems, ["collision", "on_hit"]);
});

test("knife damage is a weapon bonus, not a permanent Isaac damage bonus", () => {
  for (const apostrophe of ["'", "\u2019"]) {
    const item = profile();
    item.systems = ["stats"];
    item.affects_stats = true;
    item.stats = { damage: 1 };
    repairGeneratedProfile(item, `Mom${apostrophe}s Knife deals extra generated damage.`, 4);
    validateProfile(item);
    assert.deepEqual(item.systems, ["knife"]);
    assert.deepEqual(item.knife, { damage: 1 });
    assert.equal(item.stats, undefined);
  }
});

test("the room-clear conversion prompt supplies cost, resources, and cooldown", () => {
  const item = profile();
  item.systems = ["rules"];
  item.rules = [{ trigger: "room_clear", conditions: [{ type: "once_per_room" }],
    actions: [{ type: "convert_resource", input_resource: "coin", output_resource: "key", amount: 1 }] }];
  repairGeneratedProfile(item, "On room clear, spend 3 coins and grant a key.", 4);
  validateProfile(item);
  assert.deepEqual(item.rules, [{ trigger: "room_clear", conditions: [{ type: "once_per_room" }], cooldown: 30,
    actions: [{ type: "convert_resource", input_resource: "coin", output_resource: "key", amount: 1, cost: 3 }] }]);
});

test("unrecognized or out-of-catalog conversions are not guessed", () => {
  for (const prompt of ["Spend coins for keys.", "On room clear, spend 9 coins and grant a key."]) {
    const item = profile();
    item.systems = ["rules"];
    item.rules = [{ trigger: "room_clear", conditions: [], cooldown: 30,
      actions: [{ type: "convert_resource", input_resource: "coin", output_resource: "key", amount: 1 }] }];
    repairGeneratedProfile(item, prompt, 4);
    assert.throws(() => validateProfile(item), /conversion cost/);
  }
});

test("explicit active generation repairs the logged rules-only shell", () => {
  const item = profile();
  item.systems = ["active"];
  item.rules = [1, 6].map(amount => ({ trigger: "active_use", conditions: [],
    actions: [{ type: "damage_burst", amount, radius: amount === 1 ? 40 : 120, cost: 1 }] }));
  repairGeneratedProfile(item, "A self-centered radial burst of damage.", 4, "active");
  validateProfile(item);
  assert.deepEqual(item.active, { effect: "radial_burst", charges: 6, targeting: "self", damage: 6, radius: 120 });
  assert.deepEqual(item.systems, ["active"]);
  assert.deepEqual(item.rules, []);
});

test("explicit active generation drops passive scaffolding and stays idempotent", () => {
  const item = profile();
  item.systems = ["stats", "on_kill"];
  item.stats = { damage: 1 };
  item.on_kill = { conditions: [], actions: [{ type: "damage_burst", amount: 1, radius: 80 }] };
  repairGeneratedProfile(item, "The cracked duck floats softly.", 4, "active");
  validateProfile(item);
  assert.equal(item.stats, undefined);
  assert.equal(item.on_kill, undefined);
  assert.deepEqual(item.active, { effect: "radial_burst", charges: 6, targeting: "self", damage: 4, radius: 100 });
  const repaired = structuredClone(item);
  repairGeneratedProfile(item, "The cracked duck floats softly.", 4, "active");
  assert.deepEqual(item, repaired);
});

test("explicit active repair still rejects unknown fields and invalid active mechanics", () => {
  const unknown = profile();
  unknown.stats = { execute: "code" };
  assert.throws(() => repairGeneratedProfile(unknown, "", 4, "active"), /unsupported/);
  const item = profile();
  item.active = { effect: "radial_burst", charges: 3, targeting: "self", damage: 4, radius: 100 };
  assert.throws(() => repairGeneratedProfile(item, "", 4, "active"), /unsupported/);
  assert.throws(() => validateProfile(item));
});

test("passive requests cannot opt into active shell repair", () => {
  const item = profile();
  item.systems = ["active"];
  assert.throws(() => repairGeneratedProfile(item, "", 4, "passive"), /Active items/);
});

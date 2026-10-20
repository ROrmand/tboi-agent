import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignPrompt, cleanIdeaBrief, isUnderspecifiedIdea } from "./idea.mjs";

const capabilities = {
  systems: ["stats", "tears", "rules", "aura", "bomb"],
  tear_flags: ["poison", "explosive"],
  actions: ["grant_soul_hearts", "spawn_pickup"],
  heart_rewards: {
    grant_soul_hearts: { handler: "AddSoulHearts" },
    grant_black_hearts: { handler: "AddBlackHearts" },
  },
  auras: ["damage", "slow"],
  bomb_flag_effects: { poison: { handler: "AddTearFlags" } },
};
const env = { NEBIUS_API_KEY: "test", NEBIUS_TEXT_MODEL: "test", NEBIUS_BASE_URL: "http://127.0.0.1:9/v1/" };

test("sparse flavor ideas are expanded while mechanical requests pass through", () => {
  assert.equal(isUnderspecifiedIdea("poopsock"), true);
  assert.equal(isUnderspecifiedIdea("A sock that hums softly in the dark"), true);
  assert.equal(isUnderspecifiedIdea("Explosive tears and a slow aura"), false);
  assert.equal(isUnderspecifiedIdea("My bombs gain poison"), false);
  assert.throws(() => cleanIdeaBrief("too short"), /usable expanded idea/);
});

test("expanded brief is catalog-bounded context for the profile request", async () => {
  let body;
  const result = await buildDesignPrompt("poopsock", capabilities, env, async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "A filthy lucky sock that grants black hearts after room clears and gives poison tears." } }] }) };
  });
  assert.equal(body.temperature, 0.9);
  assert.match(body.messages[0].content, /tear flags: poison, explosive/);
  assert.match(body.messages[0].content, /heart rewards: grant_soul_hearts, grant_black_hearts/);
  assert.match(body.messages[0].content, /bomb effects: poison/);
  assert.match(result.designPrompt, /Original idea: poopsock/);
  assert.match(result.designPrompt, /black hearts/);
  assert.equal(result.ideaBrief.startsWith("A filthy lucky sock"), true);
});

test("a specific prompt never needs an expansion request", async () => {
  const result = await buildDesignPrompt("Poison tears and a coin on room clear", capabilities, env, async () => {
    throw Error("should not request expansion");
  });
  assert.deepEqual(result, { designPrompt: "Poison tears and a coin on room clear", ideaBrief: null });
});

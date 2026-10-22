import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignPrompt, cleanIdeaBrief, DEFAULT_PLANNER_MODEL, fallbackIdeaBrief, isUnderspecifiedIdea, normalizeCatalogPlan } from "./idea.mjs";

const capabilities = {
  systems: ["stats", "tears", "rules", "on_hit", "aura", "bomb", "familiar"],
  tear_flags: ["poison", "explosive"],
  triggers: ["room_clear", "player_hurt"],
  actions: ["grant_soul_hearts", "grant_black_hearts", "spawn_pickup"],
  heart_rewards: {
    grant_black_hearts: { handler: "AddBlackHearts", label: "black heart" },
  },
  auras: ["damage", "slow"],
  familiars: ["normal"],
  bomb_flag_effects: { poison: { handler: "AddTearFlags" } },
};
const env = {
  NEBIUS_API_KEY: "test",
  NEBIUS_TEXT_MODEL: "nvidia/Nemotron-3_5-Lightning",
  NEBIUS_BASE_URL: "http://127.0.0.1:9/v1/",
};

test("sparse flavor ideas are expanded while mechanical requests pass through", () => {
  assert.equal(isUnderspecifiedIdea("poopsock"), true);
  assert.equal(isUnderspecifiedIdea("A sock that hums softly in the dark"), true);
  assert.equal(isUnderspecifiedIdea("The jar of pickle brine sits in the lunchbox, its glass cool and slick with condensation on one side where the liquid has seeped through the paper liner."), true);
  assert.equal(isUnderspecifiedIdea("A friendly spider follows Isaac"), false);
  assert.equal(isUnderspecifiedIdea("Explosive tears and a slow aura"), false);
  assert.equal(isUnderspecifiedIdea("My bombs gain poison"), false);
  assert.throws(() => cleanIdeaBrief("too short"), /usable expanded idea/);
  assert.throws(() => cleanIdeaBrief("Here's a thinking process for this item."), /reasoning/);
  assert.match(fallbackIdeaBrief("booble goof", capabilities), /A passive item inspired/);
});

test("reasoning-only expansion uses a bounded brief and continues to item design", async () => {
  const result = await buildDesignPrompt("Generate me a generic item", capabilities, env,
    async () => ({ ok: true, json: async () => ({
      choices: [{ finish_reason: "length", message: { content: null } }],
    }) }));
  assert.match(result.designPrompt, /Original idea: Generate me a generic item/);
  assert.match(result.designPrompt, /Expanded design brief: A passive item inspired/);
});

test("expanded brief is a Nano catalog plan and leaves item JSON to Lightning", async () => {
  let body;
  let timeout;
  const result = await buildDesignPrompt("poopsock", capabilities, env, async (_url, options) => {
    body = JSON.parse(options.body);
    timeout = options.timeoutMs;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      systems: ["tears", "rules"],
      tear_flags: ["poison", "freeze"],
      trigger: "room_clear",
      action: "grant_black_hearts",
    }) } }] }) };
  });
  assert.equal(body.model, DEFAULT_PLANNER_MODEL);
  assert.notEqual(body.model, env.NEBIUS_TEXT_MODEL);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.max_tokens, 256);
  assert.equal(timeout, 15000);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.match(body.messages[0].content, /tear_flags: poison, explosive/);
  assert.match(result.designPrompt, /Original idea: poopsock/);
  assert.match(result.ideaBrief, /gives tears poison/);
  assert.match(result.ideaBrief, /black heart/);
  assert.doesNotMatch(result.ideaBrief, /freeze/);
});

test("an unsupported catalog plan falls back without blocking item design", async () => {
  const result = await buildDesignPrompt("poopsock", capabilities, env, async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"systems":["teleport"],"tear_flags":["freeze"]}' } }] }),
  }));
  assert.match(result.ideaBrief, /A passive item inspired by "poopsock"/);
});

test("catalog plans keep supported effects and attach the system that implements them", () => {
  const plan = normalizeCatalogPlan({
    systems: ["bomb"],
    tear_flags: ["poison", "poison", "not-a-flag"],
    trigger: "player_hurt",
    action: "spawn_pickup",
    pickup_type: "coin",
    aura: "slow",
    familiar: "normal",
    stat: "luck",
  }, capabilities);
  assert.deepEqual(plan.systems, ["on_hit", "tears", "aura"]);
  assert.deepEqual(plan.tear_flags, ["poison"]);
  assert.equal(plan.trigger, "player_hurt");
  assert.equal(plan.action, "spawn_pickup");
  assert.equal(plan.pickup_type, "coin");
  assert.equal(plan.aura, "slow");
  assert.equal(plan.familiar, null);
  assert.equal(plan.stat, null);
});

test("a specific prompt never needs an expansion request", async () => {
  const result = await buildDesignPrompt("Poison tears and a coin on room clear", capabilities, env, async () => {
    throw Error("should not request expansion");
  });
  assert.deepEqual(result, { designPrompt: "Poison tears and a coin on room clear", ideaBrief: null });
});

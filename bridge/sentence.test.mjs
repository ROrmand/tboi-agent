import test from "node:test";
import assert from "node:assert/strict";
import { buildSentencePrompt, cleanSentence, pickSentenceSeed, requestRandomSentence } from "./sentence.mjs";

test("a model reply becomes one ordinary sentence", () => {
  assert.equal(cleanSentence('  "A glass eye that blinks when the room is dark." Extra.'), "A glass eye that blinks when the room is dark.");
  assert.equal(cleanSentence("A moon splinter under the bed"), "A moon splinter under the bed.");
  assert.throws(() => cleanSentence("too short"), /usable sentence/);
});

test("each randomize request changes the seed so the model is not given the same prompt", () => {
  const prompts = new Set(Array.from({ length: 24 }, () => buildSentencePrompt()));
  assert.ok(prompts.size > 1);
  const seed = pickSentenceSeed(() => 0);
  const prompt = buildSentencePrompt(seed);
  assert.match(prompt, /one ordinary sentence/);
  assert.match(prompt, /Object: a moth-eaten sock/);
  assert.match(prompt, /Setting: in a flooded basement/);
  assert.match(prompt, /Sensory detail: sticky/);
});

test("randomize asks the text model for one sentence and does not design an item", async () => {
  let body;
  const sentence = await requestRandomSentence({ NEBIUS_API_KEY: "test", NEBIUS_TEXT_MODEL: "test", NEBIUS_BASE_URL: "http://127.0.0.1:9/v1/" }, async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "A cracked bell that rings when nobody is looking." } }] }) };
  });
  assert.equal(sentence, "A cracked bell that rings when nobody is looking.");
  assert.equal(body.temperature, 1);
  assert.equal(body.response_format, undefined);
  assert.match(body.messages[0].content, /given object, setting, and sensory detail/);
  assert.match(body.messages[1].content, /one ordinary sentence/);
  assert.match(body.messages[1].content, /Object: /);
  assert.match(body.messages[1].content, /Setting: /);
});

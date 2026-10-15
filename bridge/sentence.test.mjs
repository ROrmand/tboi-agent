import test from "node:test";
import assert from "node:assert/strict";
import { cleanSentence, requestRandomSentence } from "./sentence.mjs";

test("a model reply becomes one ordinary sentence", () => {
  assert.equal(cleanSentence('  "A glass eye that blinks when the room is dark." Extra.'), "A glass eye that blinks when the room is dark.");
  assert.equal(cleanSentence("A moon splinter under the bed"), "A moon splinter under the bed.");
  assert.throws(() => cleanSentence("too short"), /usable sentence/);
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
  assert.match(body.messages[1].content, /one ordinary sentence/);
});

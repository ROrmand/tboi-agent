import test from "node:test";
import assert from "node:assert/strict";
import { articleFor, cleanSentence, conjugateVerb, generateSentence, requestRandomSentence, wordLists } from "./sentence.mjs";

test("a model reply becomes one ordinary sentence", () => {
  assert.equal(cleanSentence('  "A glass eye that blinks when the room is dark." Extra.'), "A glass eye that blinks when the room is dark.");
  assert.equal(cleanSentence("A moon splinter under the bed"), "A moon splinter under the bed.");
  assert.throws(() => cleanSentence("too short"), /usable sentence/);
  assert.throws(() => cleanSentence("Here's a thinking process:."), /reasoning/);
  assert.equal(cleanSentence("<think>I need a sentence.</think> A cracked bell rings in an empty room."), "A cracked bell rings in an empty room.");
});

test("word files supply every part of speech", () => {
  const lists = wordLists();
  for (const name of ["adjectives", "nouns", "verbs", "adverbs", "prepositions", "places"]) {
    assert.ok(lists[name].length >= 8, name);
    assert.ok(lists[name].every((word) => word && !word.includes(".")));
  }
});

test("articles and verbs follow ordinary singular grammar", () => {
  assert.equal(articleFor("cracked"), "a");
  assert.equal(articleFor("icy"), "an");
  assert.equal(articleFor("empty"), "an");
  assert.equal(conjugateVerb("rattle"), "rattles");
  assert.equal(conjugateVerb("twitch"), "twitches");
  assert.equal(conjugateVerb("buzz"), "buzzes");
  assert.equal(conjugateVerb("cry"), "cries");
});

test("a fixed draw builds one punctuated sentence from the first word-list entries", () => {
  assert.equal(generateSentence(() => 0), "A cracked denture rattles inside the freezer.");
});

test("randomize inserts a local sentence and does not call a model", async () => {
  let called = false;
  const seen = new Set();
  for (let index = 0; index < 24; index += 1) {
    const sentence = await requestRandomSentence({ NEBIUS_API_KEY: "test", NEBIUS_TEXT_MODEL: "test" }, () => { called = true; });
    seen.add(sentence);
    assert.match(sentence, /^[A-Z].+\.$/);
    assert.equal(sentence.includes("\n"), false);
    assert.ok(sentence.length >= 12 && sentence.length <= 180);
  }
  assert.equal(called, false);
  assert.ok(seen.size > 1);
});

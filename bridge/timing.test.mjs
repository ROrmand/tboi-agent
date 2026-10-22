import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationTimer, noteGeneratorLine } from "./timing.mjs";

test("records ordered stage durations and sums repeated stages", () => {
  const timer = createGenerationTimer(1000);
  timer.mark("text", 1100);
  timer.mark("image", 5000);
  timer.mark("image", 8000);
  const result = timer.finish(9000);
  assert.equal(result.duration_ms, 8000);
  assert.deepEqual(result.stages, [
    { name: "startup", ms: 100 },
    { name: "text", ms: 3900 },
    { name: "image", ms: 3000 },
    { name: "image", ms: 1000 },
  ]);
  assert.equal(result.totals_ms.text, 3900);
  assert.equal(result.totals_ms.image, 4000);
});

test("accepts generator stage lines and ignores other output", () => {
  const timer = createGenerationTimer(0);
  assert.equal(noteGeneratorLine(timer, "@stage familiar_art\r"), "familiar_art");
  assert.equal(noteGeneratorLine(timer, "Generated Ashen Nail."), null);
  assert.equal(noteGeneratorLine(timer, "@stage Not A Stage"), null);
  const result = timer.finish();
  assert.deepEqual(result.stages.map((stage) => stage.name), ["startup", "familiar_art"]);
});

test("finish keeps the first snapshot", () => {
  const timer = createGenerationTimer(0, "sentence");
  const first = timer.finish(25);
  timer.mark("text", 40);
  const second = timer.finish(50);
  assert.equal(first, second);
  assert.deepEqual(first.stages, [{ name: "sentence", ms: 25 }]);
  assert.equal(first.duration_ms, 25);
  assert.equal(first.totals_ms.sentence, 25);
});

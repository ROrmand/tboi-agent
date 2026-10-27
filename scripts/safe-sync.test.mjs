import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { protectedChanges, safeSync } from "./safe-sync.mjs";
import { MOD_FILES } from "../bridge/sync-mod.mjs";

test("protected differences include additions and removals with bounded details", () => {
  const before = new Map(Array.from({ length: 1000 }, (_, index) => [`save-${index}`, "before"]));
  const after = new Map([["new-save", "after"]]);
  const result = protectedChanges(before, after);
  assert.equal(result.protected_change_count, 1001);
  assert.equal(result.protected_changes.length, 50);
  assert.equal(result.details_truncated, true);
  assert.equal(result.protected_changes[0].after, null);
  assert.deepEqual(protectedChanges(new Map(), after).protected_changes, [{ path: "new-save", before: null, after: "after" }]);
  assert.equal(protectedChanges(before, before).protected_change_count, 0);
});

test("safe sync preserves saves and generated art without serializing inventories", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "safe-sync-"));
  try {
    await writeFile(path.join(target, "save1.dat"), "keep-save");
    const generated = path.join(target, "generated");
    await mkdir(generated);
    for (let index = 0; index < 100; index++) await writeFile(path.join(generated, `${index}.png`), "keep-art");
    const source = path.resolve(import.meta.dirname, "../demo/live-sprite-swap");
    const receipt = await safeSync(source, target);
    assert.deepEqual(receipt.copied, MOD_FILES);
    assert.equal(receipt.protected_count, 101);
    assert.equal(receipt.protected_change_count, 0);
    assert.deepEqual(receipt.source_mismatches, []);
    assert.equal(Object.hasOwn(receipt, "protected_files"), false);
    assert.ok(JSON.stringify(receipt).length < 5000);
    assert.equal(await readFile(path.join(target, "save1.dat"), "utf8"), "keep-save");
    assert.equal(await readFile(path.join(generated, "99.png"), "utf8"), "keep-art");
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

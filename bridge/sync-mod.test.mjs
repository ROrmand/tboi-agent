import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MOD_FILES, syncMod } from "./sync-mod.mjs";

test("sync copies the Lua and XML Isaac loads and leaves generated art alone", async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), "mod-src-"));
  const target = await mkdtemp(path.join(os.tmpdir(), "mod-dst-"));
  try {
    for (const relative of MOD_FILES) {
      const file = path.join(source, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `source ${relative}`);
    }
    const art = path.join(target, "resources", "gfx", "items", "collectibles", "generated_slot_00.png");
    await mkdir(path.dirname(art), { recursive: true });
    await writeFile(art, "keep");
    const result = await syncMod(source, target);
    assert.deepEqual(result.copied, MOD_FILES);
    assert.equal(await readFile(path.join(target, "main.lua"), "utf8"), "source main.lua");
    assert.equal(await readFile(art, "utf8"), "keep");
    assert.deepEqual(await syncMod(source, source), { copied: [], skipped: true });
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

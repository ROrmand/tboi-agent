import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyBinding } from "./apply-repentogon-binding.mjs";

test("binding installer copies only the overlay and is repeatable", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "binding-"));
  try {
    const source = path.join(workspace, "external");
    const interfaces = path.join(source, "repentogon", "LuaInterfaces");
    await mkdir(interfaces, { recursive: true });
    await writeFile(path.join(source, "CMakeLists.txt"), "fixture");
    await writeFile(path.join(interfaces, "LuaConsole.cpp"), "unchanged");
    for (const attempt of [1, 2]) {
      const result = await applyBinding(source, workspace);
      assert.equal(result.copied.length, 2, `attempt ${attempt}`);
      for (const file of result.copied) {
        assert.equal(await readFile(path.join(interfaces, file), "utf8"), await readFile(new URL(`./repentogon-binding/${file}`, import.meta.url), "utf8"));
      }
    }
    assert.equal(await readFile(path.join(interfaces, "LuaConsole.cpp"), "utf8"), "unchanged");
    await assert.rejects(applyBinding(path.join(workspace, "missing"), workspace), { code: "ENOENT" });
    await assert.rejects(applyBinding(workspace, workspace), { code: "ENOENT" });
    const scratch = path.join(workspace, "work", "checkout");
    await mkdir(scratch, { recursive: true });
    await assert.rejects(applyBinding(scratch, workspace), /must not be inside work/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MOD_FILES, syncMod } from "./sync-mod.mjs";
import { renderConditionMetadata } from '../scripts/generate-condition-metadata.mjs';
import { renderEffectMetadata } from '../scripts/generate-effect-metadata.mjs';

test('stale effect metadata fails before any source is copied', async () => {
  const source=await mkdtemp(path.join(os.tmpdir(),'effect-src-'));
  const target=path.join(source,'target');
  try {
    await writeFile(path.join(source,'main.lua'),await readFile(new URL('../demo/live-sprite-swap/main.lua',import.meta.url),'utf8'));
    await writeFile(path.join(source,'condition_metadata.lua'),renderConditionMetadata());
    await writeFile(path.join(source,'effect_metadata.lua'),'return {}\n');
    await assert.rejects(syncMod(source,target),/Stale effect metadata/);
    await assert.rejects(readFile(path.join(target,'main.lua')),{code:'ENOENT'});
  } finally {await rm(source,{recursive:true,force:true});}
});

test("sync copies the Lua and XML Isaac loads and leaves generated art alone", async () => {
  const mainSource = await readFile(new URL('../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
  const source = await mkdtemp(path.join(os.tmpdir(), "mod-src-"));
  const target = await mkdtemp(path.join(os.tmpdir(), "mod-dst-"));
  try {
    for (const relative of MOD_FILES) {
      const file = path.join(source, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, relative === 'condition_metadata.lua' ? renderConditionMetadata() : relative === 'effect_metadata.lua' ? renderEffectMetadata() : relative === 'main.lua' ? mainSource : `source ${relative}`);
    }
    const art = path.join(target, "resources", "gfx", "items", "collectibles", "generated_slot_00.png");
    await mkdir(path.dirname(art), { recursive: true });
    await writeFile(art, "keep");
    const save = path.join(target, "save1.dat");
    await writeFile(save, "protected save file 1");
    assert.equal(MOD_FILES.some(relative => /save|\.dat$/i.test(relative)), false);
    const result = await syncMod(source, target);
    assert.deepEqual(result.copied, MOD_FILES);
    assert.equal(await readFile(path.join(target, "main.lua"), "utf8"), mainSource);
    assert.equal(await readFile(art, "utf8"), "keep");
    assert.equal(await readFile(save, "utf8"), "protected save file 1");
    assert.deepEqual(await syncMod(source, source), { copied: [], skipped: true });
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

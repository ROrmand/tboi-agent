import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { applyTechXLens, prepareAIsaacAssets } from "../demo/live-sprite-swap/scripts/generate_aisaac_assets.mjs";
import { MOD_FILES } from "./sync-mod.mjs";
import { characterMenuAnm2, characterPortraitsAnm2, creatorCostumeAnm2, generateCharacterArt } from "../demo/live-sprite-swap/scripts/generate_character_art.mjs";

test("AIsaac preparation copies vanilla art and produces all five quality icons", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aisaac-assets-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  const target = path.join(directory, "mod");
  for (const relative of ["gfx/characters/costumes", "gfx/ui/stage"]) {
    await mkdir(path.join(source, relative), { recursive: true });
  }
  const image = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 180, g: 100, b: 50, alpha: 0.5 } } }).png().toBuffer();
  for (const relative of ["gfx/characters/costumes/character_001_isaac_grey.png", "gfx/characters/costumes/costume_395_techx.png", "gfx/ui/stage/playerportrait_isaac.png"]) {
    await writeFile(path.join(source, relative), image);
  }
  await writeFile(path.join(source, "gfx/characters/395_techx.anm2"), '<AnimatedActor><Spritesheet Path="costumes\\Costume_395_TechX.png" Id="0"/></AnimatedActor>');
  await prepareAIsaacAssets(source, target);
  await prepareAIsaacAssets(source, target);
  const resources = path.join(target, "resources/gfx");
  assert.deepEqual(await readFile(path.join(resources, "characters/costumes/character_aisaac.png")), image);
  assert.deepEqual(await readFile(path.join(resources, "characters/costumes/costume_aisaac_techx.png")), image);
  assert.match(await readFile(path.join(resources, "characters/aisaac_techx.anm2"), "utf8"), /costumes\/costume_aisaac_techx\.png/);
  const portrait = await sharp(path.join(resources, "ui/stage/playerportrait_aisaac.png")).ensureAlpha().raw().toBuffer();
  assert.equal(portrait[0], portrait[1]);
  assert.equal(portrait[1], portrait[2]);
  assert.equal(portrait[3], 128);
  const palette = [[154, 154, 163], [61, 220, 100], [76, 124, 255], [180, 76, 255], [255, 213, 42]];
  for (const [quality, color] of palette.entries()) {
    const { data, info } = await sharp(path.join(resources, "items/collectibles/generator_q" + quality + ".png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 32);
    assert.equal(info.height, 32);
    assert.equal(data[3], 0);
    // The icon must fill most of its 32px canvas and include the quality
    // colour in its bright display. This prevents a dark/near-empty pickup.
    let opaque = 0;
    let qualityPixels = 0;
    for (let pixel = 0; pixel < data.length; pixel += 4) {
      if (data[pixel + 3] > 0) opaque += 1;
      if (data[pixel] === color[0] && data[pixel + 1] === color[1] && data[pixel + 2] === color[2] && data[pixel + 3] > 0) qualityPixels += 1;
    }
    assert.ok(opaque >= 400, `Generator ${quality} should have a substantial visible silhouette`);
    assert.ok(qualityPixels >= 100, `Generator ${quality} should have a readable quality-coloured screen`);
  }
});

test("every startup mod file is packaged in the repository", async () => {
  for (const relative of MOD_FILES) {
    await access(new URL("../demo/live-sprite-swap/" + relative, import.meta.url));
  }
});

test("item XML resolves every collectible icon through Isaac's implicit collectibles directory", async () => {
  const mod = new URL("../demo/live-sprite-swap/", import.meta.url);
  const xml = await readFile(new URL("content/items.xml", mod), "utf8");
  const gfxroot = xml.match(/<items\b[^>]*\bgfxroot="([^"]+)"/)[1];
  const items = [...xml.matchAll(/<(?:active|passive|familiar)\b[^>]*\bname="([^"]+)"[^>]*\bgfx="([^"]+)"/g)];
  assert.ok(items.length >= 6);
  for (const [, name, gfx] of items) {
    assert.ok(!gfx.startsWith("collectibles/"), `${name}: Isaac already inserts collectibles/ before gfx`);
    const relative = `resources/${gfxroot}collectibles/${gfx}`;
    await access(new URL(relative, mod));
    assert.ok(MOD_FILES.includes(relative), `${name}: the startup icon must be copied by mod:sync`);
  }
});

test("character art uses menu portraits and 32-pixel costume frames", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "character-art-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await generateCharacterArt(directory);
  assert.deepEqual(await sharp(path.join(directory, "content/gfx/characterportraits.png")).metadata().then(({ width, height }) => [width, height]), [128, 64]);
  assert.deepEqual(await sharp(path.join(directory, "content/gfx/charactermenu.png")).metadata().then(({ width, height }) => [width, height]), [444, 96]);
  assert.deepEqual(await sharp(path.join(directory, "resources/gfx/characters/costumes/costume_creator_angel.png")).metadata().then(({ width, height }) => [width, height]), [128, 64]);
  assert.match(characterPortraitsAnm2(), /Name="AIsaac"/);
  assert.match(characterPortraitsAnm2(), /Name="The Creator"/);
  assert.match(characterMenuAnm2(), /Name="AIsaac"/);
  assert.match(characterMenuAnm2(), /Name="The Creator"/);
  assert.match(creatorCostumeAnm2(), /Name="head4"/);
  assert.match(creatorCostumeAnm2(), /Name="body"/);
});

test("AIsaac Tech X lenses add cyan to normal-sized goggles", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aisaac-lens-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const goggles = path.join(directory, "goggles.png");
  await sharp({ create: { width: 256, height: 32, channels: 4, background: "#ffffff" } }).png().toFile(goggles);
  await applyTechXLens(goggles);
  const { data, info } = await sharp(goggles).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (8 * info.width + 6) * 4;
  assert.deepEqual([...data.subarray(pixel, pixel + 3)], [34, 191, 240]);
});

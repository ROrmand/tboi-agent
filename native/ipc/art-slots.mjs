import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { FAMILIAR_FRAME_COUNT, FAMILIAR_FRAME_SIZE, familiarAnimationXml } from './familiar-animation.mjs';

export const ART_SLOT_COUNT = 64;

export function artSlotName(slot) {
  return `generated_slot_${String(slot).padStart(2, '0')}.png`;
}

// These are deliberately a second, predeclared filename family. Isaac only
// discovers texture paths at startup, so a familiar may not reuse an ad-hoc
// path supplied by a model.
export function familiarArtSlotName(slot) {
  return `generated_familiar_slot_${String(slot).padStart(2, '0')}.png`;
}

export function familiarAnimationFile(slot) {
  return `generated_familiar_anim_${String(slot).padStart(2, '0')}.anm2`;
}

export function familiarSheetFile(slot) {
  return `generated_familiar_sheet_${String(slot).padStart(2, '0')}.png`;
}

export function familiarAnimationResource(slot) {
  return `gfx/familiars/${familiarAnimationFile(slot)}`;
}

export function familiarSheetResource(slot) {
  return `gfx/familiars/${familiarSheetFile(slot)}`;
}

export function artSlotFor(requestId = '') {
  let hash = 2166136261;
  for (const character of String(requestId)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % ART_SLOT_COUNT;
}

async function transparentSheet() {
  return sharp({
    create: {
      width: FAMILIAR_FRAME_COUNT * FAMILIAR_FRAME_SIZE,
      height: FAMILIAR_FRAME_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer();
}

async function writeIfMissing(target, contents) {
  try { await access(target); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(target, contents);
  }
}

export async function prepareArtSlots(modDirectory) {
  const directory = path.join(modDirectory, 'resources', 'gfx', 'items', 'collectibles');
  const familiarDirectory = path.join(modDirectory, 'resources', 'gfx', 'familiars');
  const seed = path.join(directory, 'ember_orb.png');
  await access(seed);
  await mkdir(directory, { recursive: true });
  await mkdir(familiarDirectory, { recursive: true });
  const blankSheet = await transparentSheet();
  await writeIfMissing(path.join(familiarDirectory, 'generated_familiar_blank.png'), blankSheet);
  await writeFile(path.join(familiarDirectory, 'generated_familiar_blank.anm2'), familiarAnimationXml('familiars/generated_familiar_blank.png'));
  await Promise.all(Array.from({ length: ART_SLOT_COUNT }, async (_, slot) => {
    for (const name of [artSlotName(slot), familiarArtSlotName(slot)]) {
      const target = path.join(directory, name);
      try { await access(target); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await copyFile(seed, target);
      }
    }
    await writeIfMissing(path.join(familiarDirectory, familiarSheetFile(slot)), blankSheet);
    await writeFile(
      path.join(familiarDirectory, familiarAnimationFile(slot)),
      familiarAnimationXml(`familiars/${familiarSheetFile(slot)}`),
    );
  }));
}

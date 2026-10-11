import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const ART_SLOT_COUNT = 64;

export function artSlotName(slot) {
  return `generated_slot_${String(slot).padStart(2, '0')}.png`;
}

export function artSlotFor(requestId = '') {
  let hash = 2166136261;
  for (const character of String(requestId)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % ART_SLOT_COUNT;
}

export async function prepareArtSlots(modDirectory) {
  const directory = path.join(modDirectory, 'resources', 'gfx', 'items', 'collectibles');
  const seed = path.join(directory, 'ember_orb.png');
  await access(seed);
  await mkdir(directory, { recursive: true });
  await Promise.all(Array.from({ length: ART_SLOT_COUNT }, async (_, slot) => {
    const target = path.join(directory, artSlotName(slot));
    try { await access(target); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await copyFile(seed, target);
    }
  }));
}

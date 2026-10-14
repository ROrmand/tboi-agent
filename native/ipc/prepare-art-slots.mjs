import path from 'node:path';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { ART_SLOT_COUNT, prepareArtSlots } from './art-slots.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const env = { ...await readEnv(path.join(root, '.env')), ...process.env };
const modDirectory = env.ISAAC_MOD_DIRECTORY
  ? path.resolve(root, env.ISAAC_MOD_DIRECTORY)
  : path.join(root, 'demo', 'live-sprite-swap');

await prepareArtSlots(modDirectory);
console.log(`Prepared ${ART_SLOT_COUNT} pedestal and familiar artwork slot pairs in ${modDirectory}`);

async function readEnv(file) {
  const values = {};
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index > 0 && !line.trimStart().startsWith('#')) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return values;
}

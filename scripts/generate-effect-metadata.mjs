import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expandedEffects } from '../bridge/expanded-effects.mjs';
import { toLua } from '../bridge/runtime.mjs';

export const effectMetadataFile = new URL('../demo/live-sprite-swap/effect_metadata.lua', import.meta.url);
export function renderEffectMetadata() { return 'return ' + toLua(expandedEffects) + '\n'; }
export async function checkEffectMetadata(file = effectMetadataFile) {
  if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== renderEffectMetadata()) throw Error('Stale effect metadata; run npm run effects:generate.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--check')) await checkEffectMetadata();
  else await writeFile(effectMetadataFile, renderEffectMetadata());
}

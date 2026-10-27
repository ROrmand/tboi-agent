import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { conditionNames, luaConditionMetadata } from '../content-contract/conditions.mjs';
import { toLua } from '../bridge/runtime.mjs';

export const conditionMetadataFile = new URL('../demo/live-sprite-swap/condition_metadata.lua', import.meta.url);

export function renderConditionMetadata() {
  const sections = Object.entries(luaConditionMetadata).map(([section, values]) =>
    '  ' + section + ' = {\n' + Object.entries(values).map(([name, value]) => '    [' + toLua(name) + '] = ' + toLua(value) + ',').join('\n') + '\n  },');
  return 'return {\n' + sections.join('\n') + '\n}\n';
}

export async function checkConditionMetadata(file = conditionMetadataFile) {
  if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== renderConditionMetadata()) throw Error('Stale condition metadata; run npm run conditions:generate.');
}

export function checkConditionHandlers(source) {
  const table = source.match(/local conditionHandlers = \{([\s\S]*?)\n\}/);
  const handlers = table ? [...table[1].matchAll(/^  (\w+) = function/gm)].map(match => match[1]) : [];
  if (JSON.stringify(handlers.sort()) !== JSON.stringify([...conditionNames].sort())) throw Error('Condition registry and Lua handlers differ.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--check')) {
    await checkConditionMetadata();
    checkConditionHandlers(await readFile(new URL('../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8'));
  } else await writeFile(conditionMetadataFile, renderConditionMetadata());
}

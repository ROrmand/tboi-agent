import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const index = process.argv.indexOf('--install');
if (index === -1) throw Error('Use --install with the Isaac mods directory.');
const modsDirectory = path.resolve(process.argv[index + 1] || '');
await access(modsDirectory);
const stageIndex = process.argv.indexOf('--stage');
const stage = stageIndex === -1 ? '2a' : process.argv[stageIndex + 1];
if (!['2a', '2b'].includes(stage)) throw Error('--stage must be 2a or 2b.');
const source = path.join(import.meta.dirname, stage === '2a' ? 'mod' : 'mod-stage2b');
const target = path.join(modsDirectory, `nebius_ipc_stage${stage}`);
await mkdir(target, { recursive: true });
for (const name of ['main.lua', 'metadata.xml']) {
  const destination = path.join(target, name);
  try { await access(destination); throw Error(`Refusing to overwrite ${destination}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await copyFile(path.join(source, name), destination);
}
console.log(`Installed isolated IPC Stage ${stage.toUpperCase()} probe at ${target}`);

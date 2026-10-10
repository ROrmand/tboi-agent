import { mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.join(import.meta.dirname, 'mod');
const asset = path.join(source, 'resources', 'gfx', 'nebius_native_stage1', 'white.png');
await mkdir(path.dirname(asset), { recursive: true });
await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffffff' } }).png().toFile(asset);

const index = process.argv.indexOf('--install');
if (index !== -1) {
  const modsDirectory = process.argv[index + 1];
  if (!modsDirectory || modsDirectory.startsWith('--')) throw Error('--install requires the Isaac mods directory');
  const target = path.join(path.resolve(modsDirectory), 'nebius_native_stage1');
  await access(modsDirectory);
  await mkdir(target, { recursive: true });
  const files = ['main.lua', 'nebius_native_runtime.lua', 'metadata.xml', 'resources/gfx/nebius_native_stage1/white.png'];
  for (const relative of files) {
    const destination = path.join(target, relative);
    try {
      await access(destination);
      throw Error(`Refusing to overwrite ${destination}; deploy updates manually after review`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const relative of files) {
    const destination = path.join(target, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(source, relative), destination);
  }
  console.log(`Installed isolated probe at ${target}. Existing mods and DLLs are unchanged.`);
} else {
  console.log(`Prepared static 1x1 seed at ${asset}; runtime artwork is created by REPENTOGON.`);
}

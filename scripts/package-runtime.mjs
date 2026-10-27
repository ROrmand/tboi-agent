import path from 'node:path';
import { parseArgs } from 'node:util';
import { readdir, readFile, mkdir, copyFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { exec, root, safeRuntimePath, sha256, SetupError } from './setup/common.mjs';

try {
  const { values } = parseArgs({ options: Object.fromEntries(['build-directory', 'isaac-executable', 'isaac-sha256', 'version', 'url', 'source-url', 'upstream-commit'].map(name => [name, { type: 'string' }])) });
  for (const name of ['build-directory', 'version', 'url', 'source-url', 'upstream-commit']) if (!values[name]) throw new SetupError(`Missing --${name}.`);
  if (Boolean(values['isaac-executable']) === Boolean(values['isaac-sha256'])) throw new SetupError('Supply exactly one of --isaac-executable or --isaac-sha256.');
  if (values['isaac-sha256'] && !/^[a-f0-9]{64}$/.test(values['isaac-sha256'])) throw new SetupError('Invalid tested Isaac executable hash.');
  const stage = await mkdtemp(path.join(tmpdir(), 'tboi-native-package-'));
  const files = {};
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new SetupError('Native build contains links.');
      if (entry.isDirectory()) { if (['resources', 'resources-repentogon'].includes(name) || prefix) await walk(path.join(directory, entry.name), name + '/'); }
      else if (safeRuntimePath(name)) {
        const bytes = await readFile(path.join(directory, entry.name));
        files[name] = sha256(bytes);
        await mkdir(path.dirname(path.join(stage, name)), { recursive: true });
        await copyFile(path.join(directory, entry.name), path.join(stage, name));
      }
    }
  }
  await walk(path.resolve(values['build-directory']));
  for (const name of ['zhlREPENTOGON.dll', 'libzhl.dll', 'zhlLoader.dll', 'Lua5.3.3r.dll', 'freetype.dll']) if (!files[name]) throw new SetupError(`Build lacks ${name}.`);
  const binding = await readFile(path.join(stage, 'zhlREPENTOGON.dll'));
  if (!binding.includes(Buffer.from('NebiusBridge'))) throw new SetupError('Build lacks the native binding.');
  if (!/^[\w.-]+$/.test(values.version)) throw new SetupError('Invalid version.');
  const output = path.join(root, 'dist');
  await mkdir(output, { recursive: true });
  const archive = path.join(output, `tboi-agent-repentogon-${values.version}-windows.zip`);
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'scripts/create-archive.ps1'), stage, archive]);
  const runtime = { version: values.version, url: values.url, sourceUrl: values['source-url'], upstreamCommit: values['upstream-commit'], isaacSha256: values['isaac-sha256'] || sha256(await readFile(values['isaac-executable'])), sha256: sha256(await readFile(archive)), files };
  await writeFile(archive + '.sha256', runtime.sha256 + '\n');
  await writeFile(path.join(output, 'runtime-manifest.json'), JSON.stringify(runtime, null, 2) + '\n');
  console.log('Native ZIP and runtime-manifest.json created. Publish corresponding source and license notices alongside the binary; then pin this runtime object in release-manifest.json.');
} catch (error) { console.error(error instanceof SetupError ? error.message : 'Native packaging failed.'); process.exitCode = 1; }

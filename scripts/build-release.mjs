import path from 'node:path';
import { readdir, mkdir, copyFile, readFile, writeFile, mkdtemp, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { MOD_FILES } from '../bridge/sync-mod.mjs';
import { exec, exists, json, loadManifest, root, sha256, SetupError } from './setup/common.mjs';

export async function releaseFiles(directory = root) {
  const files = ['package.json', 'package-lock.json', 'release-manifest.json', '.env.example', 'README.md', 'setup.ps1', 'doctor.ps1', 'start.ps1', 'uninstall.ps1'];
  async function walk(relative, allowed) {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new SetupError('Release sources must not contain links.');
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name, allowed);
      else if (allowed(name)) files.push(name);
    }
  }
  await walk('bridge', name => !name.endsWith('.test.mjs') && /\.(mjs|txt|json)$/.test(name));
  await walk('content-contract', name => /\.(mjs|json)$/.test(name));
  await walk('native/ipc', name => name.split('/').length === 3 && name.endsWith('.mjs') && !name.endsWith('.test.mjs'));
  await walk('scripts/setup', name => /\.(mjs|ps1)$/.test(name));
  await walk('docs', name => name.endsWith('.md'));
  files.push('scripts/generate-condition-metadata.mjs', 'scripts/generate-effect-metadata.mjs');
  files.push(...MOD_FILES.map(name => `demo/live-sprite-swap/${name}`));
  if (await exists(path.join(directory, 'LICENSE'))) files.push('LICENSE');
  files.push('THIRD_PARTY_NOTICES.md', 'AGENTS.md');
  return [...new Set(files)].sort();
}
export async function buildRelease({ preview = false, tag } = {}, directory = root) {
  const manifest = await loadManifest(directory, !preview);
  const pkg = await json(path.join(directory, 'package.json'));
  const example = await readFile(path.join(directory, '.env.example'), 'utf8');
  if (/^NEBIUS_API_KEY=[ \t]*[^ \t\r\n]/m.test(example)) throw new SetupError('Refusing to package a nonempty API key in .env.example.');
  if (pkg.version !== manifest.applicationVersion || (tag && tag !== `v${manifest.applicationVersion}`)) throw new SetupError('Package, manifest, and release tag must agree.');
  if (!preview && !await exists(path.join(directory, 'LICENSE'))) throw new SetupError('Choose a project LICENSE before publishing. Preview artifacts remain available.');
  const stage = await mkdtemp(path.join(tmpdir(), 'tboi-release-'));
  const files = await releaseFiles(directory);
  for (const name of files) {
    const source = path.join(directory, name);
    if ((await lstat(source)).isSymbolicLink()) throw new SetupError('Release file must not be a link.');
    const target = path.join(stage, name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  const keepScripts = ['bridge', 'setup', 'setup:inspect', 'setup:plan', 'doctor', 'play', 'uninstall', 'rollback', 'art:prepare', 'ipc:generate', 'validate'];
  pkg.scripts = Object.fromEntries(Object.entries(pkg.scripts).filter(([name]) => keepScripts.includes(name)));
  delete pkg.devDependencies;
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const lock = await json(path.join(stage, 'package-lock.json'));
  delete lock.packages[''].devDependencies;
  await writeFile(path.join(stage, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  const checksums = {};
  for (const name of files) checksums[name] = sha256(await readFile(path.join(stage, name)));
  await writeFile(path.join(stage, 'FILES.sha256.json'), JSON.stringify(checksums, null, 2) + '\n');
  await writeFile(path.join(stage, 'README.txt'), 'Start with README.md or docs/SETUP.md.\nRun setup.ps1, add your API key privately to .env, then start.ps1.\n' + (preview ? 'PREVIEW: not a public release. Native runtime publication may still be pending.\n' : ''));
  const output = path.join(directory, 'dist');
  await mkdir(output, { recursive: true });
  const archive = path.join(output, `tboi-agent-v${manifest.applicationVersion}-windows${preview ? '-preview' : ''}.zip`);
  if (await exists(archive)) throw new SetupError('Archive already exists. Move the previous artifact before rebuilding.');
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(directory, 'scripts/create-archive.ps1'), stage, archive]);
  await writeFile(archive + '.sha256', `${sha256(await readFile(archive))}  ${path.basename(archive)}\n`);
  return { archive, stage, files: files.length, preview };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { preview: { type: 'boolean' }, tag: { type: 'string' } } });
    console.log(JSON.stringify(await buildRelease(values), null, 2));
  } catch (error) { console.error(error instanceof SetupError ? error.message : 'Release packaging failed.'); process.exitCode = 1; }
}

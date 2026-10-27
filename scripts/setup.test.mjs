import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, readFile, mkdir, readdir, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { argumentsFor } from './setup/cli.mjs';
import { atLeast, atomicJson, exists, inside, loadManifest, noLinks, noLinksInTree, safeRuntimePath, sha256, root } from './setup/common.mjs';
import { steamLibraries } from './setup/detect.mjs';
import { configure, stateDirectory, validateTargets } from './setup/install.mjs';
import { verifyRuntime } from './setup/runtime.mjs';
import { doctor } from './setup/doctor.mjs';
import { prepareArtSlots, artSlotName, familiarAnimationFile, ART_SLOT_COUNT } from '../native/ipc/art-slots.mjs';

async function fixture() { return mkdtemp(path.join(os.tmpdir(), 'tboi-setup-test-')); }
function context(game) { return { game, mod: path.join(game, 'mods/live_sprite_swap_demo'), repentogon: path.join(game, 'Repentogon'), log: path.join(game, 'log.txt'), backend: 'placeholder', env: {} }; }
const manifest = { schemaVersion: 1, applicationVersion: '0.1.0', minimumNodeVersion: '22.12.0', platform: 'win32', runtime: null };

test('arguments reject unknown flags and never accept API keys', () => {
  assert.equal(argumentsFor(['doctor', '--json']).options.json, true);
  assert.throws(() => argumentsFor(['install', '--api-key', 'private']));
  assert.throws(() => argumentsFor(['doctor', 'install']));
  assert.equal(atLeast('22.12.0', '22.12.0'), true);
  assert.equal(atLeast('22.11.9', '22.12.0'), false);
  assert.equal(atLeast('24.0.0', '22.12.0'), true);
});
test('Steam VDF handles multiple libraries and escaped paths', () => {
  const slash = String.fromCharCode(92);
  const first = 'C:' + slash + 'Steam', second = 'D:' + slash + 'Steam Library';
  assert.deepEqual(steamLibraries('"path" ' + JSON.stringify(first) + ' "path" ' + JSON.stringify(second)), [first, second]);
});
test('targets cannot escape selected game or replace mod root', () => {
  const selected = context(path.join(os.tmpdir(), 'Game'));
  assert.doesNotThrow(() => validateTargets(selected));
  assert.throws(() => validateTargets({ ...selected, mod: path.join(selected.game, 'mods') }));
  assert.throws(() => validateTargets({ ...selected, mod: path.join(selected.game, 'mods/../../outside') }));
  assert.throws(() => validateTargets({ ...selected, repentogon: selected.game }));
  assert.equal(inside(selected.game, selected.mod), true);
  assert.equal(inside(selected.game, selected.game), false);
  assert.equal(path.basename(stateDirectory(selected)).length, 24);
});
test('configuration fills blank paths but preserves secrets and configured values', async () => {
  const directory = await fixture(), selected = context(path.join(directory, 'Game'));
  const privateValue = 'never-print-this-test-key';
  await writeFile(path.join(directory, '.env.example'), 'NEBIUS_API_KEY=\nIMAGE_BACKEND=placeholder\nISAAC_MOD_DIRECTORY=\n'.replaceAll('\\n', '\n'));
  await configure(selected, { directory, dryRun: true });
  assert.equal(await exists(path.join(directory, '.env')), false);
  await configure(selected, { directory });
  let text = await readFile(path.join(directory, '.env'), 'utf8');
  assert.ok(text.includes('ISAAC_MOD_DIRECTORY=' + selected.mod));
  await writeFile(path.join(directory, '.env'), text.replace('NEBIUS_API_KEY=', 'NEBIUS_API_KEY=' + privateValue));
  assert.equal(await configure(selected, { directory }), 'preserved');
  assert.ok((await readFile(path.join(directory, '.env'), 'utf8')).includes(privateValue));
  await assert.rejects(configure({ ...selected, backend: 'comfyui' }, { directory }), /Existing IMAGE_BACKEND differs/);
  await writeFile(path.join(directory, '.env'), 'NEBIUS_API_KEY=' + privateValue + '\nISAAC_MOD_DIRECTORY=\n'.replaceAll('\\n', '\n'));
  assert.equal(await configure(selected, { directory }), 'filled_blank_paths');
  text = await readFile(path.join(directory, '.env'), 'utf8');
  assert.ok(text.includes(privateValue));
  assert.ok(text.includes(selected.mod));
  await writeFile(path.join(directory, '.env'), 'IMAGE_BACKEND = comfyui');
  await assert.rejects(configure(selected, { directory }), /Existing IMAGE_BACKEND differs/);
  await writeFile(path.join(directory, '.env'), 'IMAGE_BACKEND=placeholder\nIMAGE_BACKEND=comfyui');
  await assert.rejects(configure(selected, { directory }), /Duplicate IMAGE_BACKEND/);
});
test('manifest refuses missing public runtime and unsafe native inventory', async () => {
  const directory = await fixture();
  await atomicJson(path.join(directory, 'release-manifest.json'), manifest);
  await assert.rejects(loadManifest(directory, true), /No native runtime/);
  const files = Object.fromEntries(['zhlREPENTOGON.dll', 'libzhl.dll', 'zhlLoader.dll', 'Lua5.3.3r.dll', 'freetype.dll'].map(name => [name, 'a'.repeat(64)]));
  const runtime = { version: '0.1.0', url: 'https://github.com/example/native/releases/download/v0.1.0/runtime.zip', sourceUrl: 'https://github.com/example/native/tree/' + 'b'.repeat(40), upstreamCommit: 'c'.repeat(40), isaacSha256: 'd'.repeat(64), sha256: 'e'.repeat(64), files };
  await atomicJson(path.join(directory, 'release-manifest.json'), { ...manifest, runtime });
  await loadManifest(directory, true);
  for (const name of ['../escape.dll', 'resources/../../save1.dat', 'resources/packed/graphics.a', 'resources/CON.txt', 'resources/a.', 'C:/Windows/x.dll', 'resources\\evil.lua']) assert.equal(safeRuntimePath(name), false, name);
  assert.equal(safeRuntimePath('resources/scripts/main_ex.lua'), true);
  runtime.files['resources/../save.dat'] = 'a'.repeat(64);
  await atomicJson(path.join(directory, 'release-manifest.json'), { ...manifest, runtime });
  await assert.rejects(loadManifest(directory), /Invalid native runtime file inventory/);
});
test('runtime verification hashes every file, not just DLL markers', async () => {
  const directory = await fixture();
  await writeFile(path.join(directory, 'zhlREPENTOGON.dll'), 'NebiusBridge');
  const runtime = { files: { 'zhlREPENTOGON.dll': sha256('NebiusBridge') } };
  assert.equal(await verifyRuntime(directory, runtime), true);
  await writeFile(path.join(directory, 'zhlREPENTOGON.dll'), 'changed');
  assert.equal(await verifyRuntime(directory, runtime), false);
});
test('doctor never calls image services in placeholder mode or exposes key', async () => {
  const selected = context(await fixture());
  selected.env.NEBIUS_API_KEY = 'private-test-value';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Network should not be called.'); };
  try {
    const result = await doctor(selected, manifest);
    assert.equal(JSON.stringify(result).includes(selected.env.NEBIUS_API_KEY), false);
    assert.equal(result.checks.find(check => check.id === 'nebius.api_key').status, 'pass');
    assert.equal(result.checks.find(check => check.id === 'runtime.compatibility').status, 'needs_user_action');
  } finally { globalThis.fetch = originalFetch; }
});
test('art preparation preserves existing artwork and animations', async () => {
  const directory = await fixture(), collectibles = path.join(directory, 'resources/gfx/items/collectibles'), familiars = path.join(directory, 'resources/gfx/familiars');
  await mkdir(collectibles, { recursive: true });
  await mkdir(familiars, { recursive: true });
  await writeFile(path.join(collectibles, 'ember_orb.png'), 'seed');
  await writeFile(path.join(collectibles, artSlotName(0)), 'protected-art');
  await writeFile(path.join(familiars, familiarAnimationFile(0)), 'protected-animation');
  await prepareArtSlots(directory, { preserveExisting: true });
  await prepareArtSlots(directory, { preserveExisting: true });
  assert.equal(await readFile(path.join(collectibles, artSlotName(0)), 'utf8'), 'protected-art');
  assert.equal(await readFile(path.join(familiars, familiarAnimationFile(0)), 'utf8'), 'protected-animation');
  assert.equal(await exists(path.join(collectibles, artSlotName(ART_SLOT_COUNT - 1))), true);
});
test('junctions are rejected without touching their destination', async t => {
  const directory = await fixture(), destination = await fixture(), link = path.join(directory, 'redirect');
  try { await symlink(destination, link, process.platform === 'win32' ? 'junction' : 'dir'); } catch { t.skip('Links unavailable.'); return; }
  await assert.rejects(noLinks(path.join(link, 'file')), /redirected/);
  await assert.rejects(noLinksInTree(directory), /redirected/);
  assert.deepEqual(await readdir(destination), []);
});
test('agent dry-run emits one JSON object and performs no writes', async () => {
  const game = await fixture();
  await writeFile(path.join(game, 'isaac-ng.exe'), 'fixture');
  const selected = context(game);
  const result = spawnSync(process.execPath, ['scripts/setup/cli.mjs', 'install', '--dry-run', '--skip-runtime', '--json', '--isaac-directory', game, '--mod-directory', selected.mod, '--repentogon-directory', selected.repentogon], { cwd: root, encoding: 'utf8', env: { ...process.env, NEBIUS_API_KEY: 'secret-not-in-output' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).dryRun, true);
  assert.equal(result.stdout.includes('secret-not-in-output'), false);
  assert.deepEqual(await readdir(game), ['isaac-ng.exe']);
});

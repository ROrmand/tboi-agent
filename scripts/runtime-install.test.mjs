import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { exec, exists, json, root, sha256 } from './setup/common.mjs';
import { installRuntime, restoreRuntime } from './setup/runtime.mjs';

const windows = { skip: process.platform !== 'win32' };
const closed = async () => {};
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tboi-runtime-test-'));
  const game = path.join(directory, 'Game'), target = path.join(game, 'Repentogon'), build = path.join(directory, 'build'), state = path.join(directory, 'state');
  await mkdir(target, { recursive: true });
  await mkdir(build, { recursive: true });
  await writeFile(path.join(game, 'isaac-ng.exe'), 'fake game');
  const files = {};
  for (const name of ['zhlREPENTOGON.dll', 'libzhl.dll', 'zhlLoader.dll', 'Lua5.3.3r.dll', 'freetype.dll']) {
    await writeFile(path.join(target, name), 'previous ' + name);
    const bytes = Buffer.from('updated ' + name);
    await writeFile(path.join(build, name), bytes);
    files[name] = sha256(bytes);
  }
  await mkdir(path.join(target, 'resources/packed'), { recursive: true });
  await writeFile(path.join(target, 'resources/packed/graphics.a'), 'protected game archive');
  await writeFile(path.join(target, 'save1.dat'), 'protected save');
  const archive = path.join(directory, 'runtime.zip');
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'scripts/create-archive.ps1'), build, archive]);
  const bytes = await readFile(archive);
  return { directory, game, target, state, archive, bytes, runtime: { url: 'https://github.com/test/test/releases/download/v1/runtime.zip', sha256: sha256(bytes), files }, fetchRuntime: async () => new Response(bytes) };
}
test('native installation backs up, verifies, and restores only owned files', windows, async () => {
  const setup = await fixture();
  const result = await installRuntime(setup.target, setup.runtime, setup.state, { checkClosed: closed, fetchRuntime: setup.fetchRuntime });
  assert.equal(await readFile(path.join(setup.target, 'zhlREPENTOGON.dll'), 'utf8'), 'updated zhlREPENTOGON.dll');
  assert.equal((await json(path.join(setup.state, 'setup-state.json'))).runtimeBackup, result.backup);
  assert.equal((await installRuntime(setup.target, setup.runtime, setup.state, { checkClosed: closed, fetchRuntime: () => { throw Error('No second download.'); } })).skipped, true);
  await restoreRuntime(result.backup, setup.state, false, { checkClosed: closed });
  assert.equal(await readFile(path.join(setup.target, 'zhlREPENTOGON.dll'), 'utf8'), 'previous zhlREPENTOGON.dll');
  assert.equal(await readFile(path.join(setup.target, 'resources/packed/graphics.a'), 'utf8'), 'protected game archive');
  assert.equal(await readFile(path.join(setup.target, 'save1.dat'), 'utf8'), 'protected save');
});
test('native checksum failure never modifies installed runtime', windows, async () => {
  const setup = await fixture();
  await assert.rejects(installRuntime(setup.target, { ...setup.runtime, sha256: '0'.repeat(64) }, setup.state, { checkClosed: closed, fetchRuntime: setup.fetchRuntime }), /checksum mismatch/);
  assert.equal(await readFile(path.join(setup.target, 'zhlREPENTOGON.dll'), 'utf8'), 'previous zhlREPENTOGON.dll');
  assert.equal(await exists(path.join(setup.state, 'backups')), false);
});
test('partial native install restores the old runtime automatically', windows, async () => {
  const setup = await fixture();
  let writes = 0;
  await assert.rejects(installRuntime(setup.target, setup.runtime, setup.state, { checkClosed: closed, fetchRuntime: setup.fetchRuntime, writeRuntimeFile: async (source, target) => { await copyFile(source, target); if (++writes === 2) throw Error('Simulated failure.'); } }), error => error.code === 6);
  for (const name of Object.keys(setup.runtime.files)) assert.equal(await readFile(path.join(setup.target, name), 'utf8'), 'previous ' + name);
});
test('native rollback refuses another updater changes and corrupt backup', windows, async () => {
  const setup = await fixture();
  const result = await installRuntime(setup.target, setup.runtime, setup.state, { checkClosed: closed, fetchRuntime: setup.fetchRuntime });
  await writeFile(path.join(setup.target, 'zhlREPENTOGON.dll'), 'other updater');
  await assert.rejects(restoreRuntime(result.backup, setup.state, false, { checkClosed: closed }), error => error.code === 5);
  await writeFile(path.join(result.backup, 'files/zhlREPENTOGON.dll'), 'corrupt backup');
  await assert.rejects(restoreRuntime(result.backup, setup.state, true, { checkClosed: closed }), error => error.code === 7);
});
test('ZIP traversal is rejected before creating escaped files', windows, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tboi-zip-test-'));
  const archive = path.join(directory, 'malicious.zip'), destination = path.join(directory, 'extract');
  const quote = String.fromCharCode(39), quoted = quote + archive.replaceAll(quote, quote + quote) + quote;
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::Open(' + quoted + ', [IO.Compression.ZipArchiveMode]::Create); $zip.CreateEntry("../escaped.txt") | Out-Null; $zip.Dispose()']);
  await assert.rejects(exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'scripts/setup/extract-runtime.ps1'), archive, destination]));
  assert.equal(await exists(path.join(directory, 'escaped.txt')), false);
});

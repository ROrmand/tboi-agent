import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdir, mkdtemp, readdir, copyFile, unlink } from 'node:fs/promises';
import { atomicJson, exists, exec, gameClosed, inside, json, noLinks, sha256, SetupError, safeRuntimePath } from './common.mjs';

export async function verifyRuntime(target, runtime) {
  if (!target || !runtime) return false;
  for (const [name, digest] of Object.entries(runtime.files)) {
    const file = path.join(target, name);
    if (!await exists(file) || sha256(await readFile(file)) !== digest) return false;
  }
  return true;
}
export async function installRuntime(target, runtime, stateDirectory, { checkClosed = gameClosed, fetchRuntime = fetch, writeRuntimeFile = copyFile } = {}) {
  await checkClosed();
  await noLinks(target);
  if (!await exists(path.join(target, 'zhlREPENTOGON.dll'))) throw new SetupError('Install official REPENTOGON first; this installer only overlays its runtime.', 2);
  if (await verifyRuntime(target, runtime)) return { skipped: true };
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'tboi-runtime-'));
  const archive = path.join(temporary, 'runtime.zip');
  const response = await fetchRuntime(runtime.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new SetupError('Native runtime download failed.');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 150 * 1024 * 1024) throw new SetupError('Native download exceeds the size limit.');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (sha256(bytes) !== runtime.sha256) throw new SetupError('Native runtime checksum mismatch. Nothing was installed.');
  await writeFile(archive, bytes);
  const extracted = path.join(temporary, 'extracted');
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(import.meta.dirname, 'extract-runtime.ps1'), archive, extracted]);
  const actual = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new SetupError('Links are forbidden in a runtime archive.');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name + '/');
      else actual.push(name);
    }
  }
  await walk(extracted);
  if (actual.length !== Object.keys(runtime.files).length || actual.some(name => !Object.hasOwn(runtime.files, name)) || !await verifyRuntime(extracted, runtime)) {
    throw new SetupError('Runtime archive does not match its pinned file inventory.');
  }
  await checkClosed();
  const backup = path.join(stateDirectory, 'backups', `runtime-${Date.now()}`);
  await mkdir(backup, { recursive: true });
  const entries = [];
  for (const name of actual) {
    const destination = path.join(target, name);
    await noLinks(destination);
    const present = await exists(destination);
    let previousHash = null;
    if (present) {
      const saved = path.join(backup, 'files', name);
      await mkdir(path.dirname(saved), { recursive: true });
      await copyFile(destination, saved);
      previousHash = sha256(await readFile(saved));
    }
    entries.push({ name, existed: present, previousHash, installedHash: runtime.files[name] });
  }
  const receipt = { schemaVersion: 1, target: path.resolve(target), entries, status: 'prepared' };
  await atomicJson(path.join(backup, 'receipt.json'), receipt);
  const setupStateFile = path.join(stateDirectory, 'setup-state.json');
  const setupState = await json(setupStateFile, { schemaVersion: 1 });
  await atomicJson(setupStateFile, { ...setupState, runtimeBackup: backup, phase: 'native_prepared' });
  try {
    for (const entry of entries) {
      const destination = path.join(target, entry.name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeRuntimeFile(path.join(extracted, entry.name), destination);
    }
    if (!await verifyRuntime(target, runtime)) throw new SetupError('Installed runtime verification failed.');
    receipt.status = 'installed';
    await atomicJson(path.join(backup, 'receipt.json'), receipt);
    return { backup, skipped: false };
  } catch {
    try { await restoreRuntime(backup, stateDirectory, true, { checkClosed }); }
    catch { throw new SetupError(`Runtime install and rollback failed. Recover using ${backup}.`, 7); }
    throw new SetupError('Runtime installation failed; previous files restored.', 6);
  }
}
export async function restoreRuntime(backup, stateDirectory, interrupted = false, { checkClosed = gameClosed } = {}) {
  await checkClosed();
  await noLinks(backup);
  if (!inside(path.join(stateDirectory, 'backups'), backup)) throw new SetupError('Backup must belong to this setup installation.');
  const receipt = await json(path.join(backup, 'receipt.json'));
  if (receipt.schemaVersion !== 1 || !path.isAbsolute(receipt.target) || !Array.isArray(receipt.entries)) throw new SetupError('Invalid backup receipt.');
  if (path.basename(receipt.target).toLowerCase() !== 'repentogon' || !await exists(path.join(path.dirname(receipt.target), 'isaac-ng.exe'))) throw new SetupError('Backup does not target a recognized game runtime.');
  for (const entry of receipt.entries) {
    if (!safeRuntimePath(entry.name)) throw new SetupError('Invalid backup path.');
    const target = path.join(receipt.target, entry.name);
    await noLinks(target);
    if (entry.existed) {
      const saved = path.join(backup, 'files', entry.name);
      await noLinks(saved);
      if (sha256(await readFile(saved)) !== entry.previousHash) throw new SetupError('Runtime backup failed integrity verification.', 7);
    }
    if (!interrupted && await exists(target) && sha256(await readFile(target)) !== entry.installedHash) throw new SetupError('Runtime changed since installation; refusing to overwrite it.', 5);
  }
  for (const entry of receipt.entries) {
    const target = path.join(receipt.target, entry.name);
    if (entry.existed) await copyFile(path.join(backup, 'files', entry.name), target);
    else if (await exists(target)) await unlink(target);
  }
  receipt.status = 'restored';
  await atomicJson(path.join(backup, 'receipt.json'), receipt);
  return { backup, target: receipt.target };
}

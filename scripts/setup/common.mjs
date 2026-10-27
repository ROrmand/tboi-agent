import { readFile, mkdir, rename, writeFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const root = path.resolve(import.meta.dirname, '../..');
export const exec = promisify(execFile);
export class SetupError extends Error {
  constructor(message, code = 4) { super(message); this.code = code; }
}
export async function json(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, file);
}
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export async function readEnv(directory = root) {
  let text;
  try { text = await readFile(path.join(directory, '.env'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  return Object.fromEntries(text.split(/\r?\n/).filter(line => !line.trimStart().startsWith('#') && line.indexOf('=') > 0)
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
}
export function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export async function noLinks(target) {
  let current = path.resolve(target);
  while (true) {
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) throw new SetupError('Refusing a redirected installation path.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(target);
}
export async function gameClosed() {
  if (process.platform !== 'win32') throw new SetupError('Setup requires Windows.', 3);
  const { stdout } = await exec('tasklist.exe', ['/FI', 'IMAGENAME eq isaac-ng.exe', '/NH']);
  if (/isaac-ng\.exe/i.test(stdout)) throw new SetupError('Close Isaac before changing installed files.', 5);
}
export async function noLinksInTree(directory) {
  await noLinks(directory);
  if (!await exists(directory)) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new SetupError('Refusing a redirected file inside the installed mod.');
    if (entry.isDirectory()) await noLinksInTree(path.join(directory, entry.name));
  }
}
export async function loadManifest(directory = root, requireRuntime = false) {
  const manifest = await json(path.join(directory, 'release-manifest.json'));
  if (manifest.schemaVersion !== 1 || manifest.platform !== 'win32' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.applicationVersion)
      || !/^\d+\.\d+\.\d+$/.test(manifest.minimumNodeVersion)) throw new SetupError('Invalid release manifest.');
  if (manifest.runtime) {
    const runtime = manifest.runtime;
    let url;
    try { url = new URL(runtime.url); } catch { throw new SetupError('Invalid native runtime URL.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname)
        || url.search || url.hash || url.username || url.password || !/^[a-f0-9]{64}$/.test(runtime.sha256)
        || !/^[a-f0-9]{40}$/.test(runtime.upstreamCommit) || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[a-f0-9]{40}$/.test(runtime.sourceUrl || '') || !/^[a-f0-9]{64}$/.test(runtime.isaacSha256)
        || !runtime.version || !runtime.files || Array.isArray(runtime.files) || !Object.keys(runtime.files).length) throw new SetupError('Native runtime must pin its binary, source, commit, and file hashes.');
    const names = new Set();
    for (const [name, digest] of Object.entries(runtime.files)) {
      if (!safeRuntimePath(name) || !/^[a-f0-9]{64}$/.test(digest)) throw new SetupError('Invalid native runtime file inventory.');
      if (names.has(name.toLowerCase())) throw new SetupError('Runtime inventory contains Windows path aliases.');
      names.add(name.toLowerCase());
    }
    for (const name of ['zhlREPENTOGON.dll', 'libzhl.dll', 'zhlLoader.dll', 'Lua5.3.3r.dll', 'freetype.dll']) {
      if (!runtime.files[name]) throw new SetupError(`Runtime inventory is missing ${name}.`);
    }
  } else if (requireRuntime) throw new SetupError('No native runtime release is pinned. Maintainer must publish and configure it before public distribution.', 2);
  return manifest;
}
export function safeRuntimePath(name) {
  return typeof name === 'string' && !name.includes('\\') && !name.includes(':') && !name.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
    && /^(?:zhlREPENTOGON\.dll|libzhl\.dll|zhlLoader\.dll|Lua5\.3\.3r\.dll|freetype\.dll|antlr4-runtime\.dll|hooks\.json|resources\/(?!packed\/)[\w./-]+|resources-repentogon\/[\w./-]+)$/.test(name)
    && !/\.(?:a|exe|pdb|lib|exp)$/i.test(name);
}
export function atLeast(actual, required) {
  const left = actual.replace(/^v/, '').split('.').map(Number), right = required.split('.').map(Number);
  for (let index = 0; index < 3; index++) { if (left[index] !== right[index]) return left[index] > right[index]; }
  return true;
}
export async function withSetupLock(state, action) {
  await noLinks(state);
  await mkdir(state, { recursive: true });
  const lock = path.join(state, 'setup.lock');
  try { await writeFile(lock, String(process.pid), { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new SetupError('Setup is already locked. See troubleshooting for interrupted setup.', 5); throw error; }
  try { return await action(); } finally { await (await import('node:fs/promises')).unlink(lock); }
}

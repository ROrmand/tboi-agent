import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdir, copyFile, unlink, rename } from 'node:fs/promises';
import { atomicJson, atLeast, exists, exec, gameClosed, inside, json, noLinks, noLinksInTree, root, sha256, SetupError } from './common.mjs';
import { portAvailable } from './doctor.mjs';
import { installRuntime } from './runtime.mjs';

export function stateDirectory(context) {
  return context.game ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'tboi-agent', sha256(path.resolve(context.game).toLowerCase()).slice(0, 24)) : path.join(root, 'runtime/setup');
}
export function validateTargets(context) {
  if (!context.game || !context.mod || !context.repentogon) throw new SetupError('Select a unique Isaac installation using --isaac-directory.', 2);
  if (!inside(path.join(context.game, 'mods'), context.mod)) throw new SetupError('Mod directory must be a child of the selected game mods directory.');
  if (path.resolve(context.repentogon).toLowerCase() !== path.join(context.game, 'Repentogon').toLowerCase()) throw new SetupError('REPENTOGON directory must be the selected game Repentogon directory.');
  if (!['placeholder', 'comfyui', 'nebius'].includes(context.backend)) throw new SetupError('Unsupported image backend.');
}
export async function install(context, manifest, options) {
  validateTargets(context);
  if (!atLeast(process.versions.node, manifest.minimumNodeVersion)) throw new SetupError('Upgrade Node before setup.', 3);
  if (!manifest.runtime && !options['skip-runtime']) throw new SetupError('Runtime publication is pending. Use --skip-runtime only if you already built and installed the custom binding.', 2);
  if (!options['skip-runtime'] && !options['accept-runtime-change']) throw new SetupError('Review plan, then approve the native overlay with --accept-runtime-change.', 2);
  if (!manifest.runtime && !options['confirm-repentance-plus']) throw new SetupError('Confirm Repentance+ in Steam, then pass --confirm-repentance-plus for this development setup.', 2);
  if (manifest.runtime?.isaacSha256) {
    const { sha256 } = await import('./common.mjs');
    if (sha256(await readFile(path.join(context.game, 'isaac-ng.exe'))) !== manifest.runtime.isaacSha256) throw new SetupError('Isaac does not match the runtime tested executable.');
  }
  await gameClosed();
  if (!await portAvailable(Number(context.env.NEBIUS_BRIDGE_PORT || 3000))) throw new SetupError('Stop the bridge before setup.', 5);
  for (const target of [context.mod, context.repentogon]) await noLinks(target);
  await noLinksInTree(context.mod);
  await configure(context, { dryRun: true });
  const state = stateDirectory(context);
  await noLinks(state);
  await mkdir(state, { recursive: true });
  const lock = path.join(state, 'setup.lock');
  try { await writeFile(lock, String(process.pid), { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new SetupError('Setup is already locked. See troubleshooting for interrupted setup.', 5); throw error; }
  try {
    if (!options['skip-dependencies']) {
      const result = await exec('npm.cmd', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, shell: true, maxBuffer: 4 * 1024 * 1024 });
      if (!options.json) process.stdout.write(result.stdout);
    }
    const { MOD_FILES, syncMod } = await import('../../bridge/sync-mod.mjs');
    const { prepareArtSlots } = await import('../../native/ipc/art-slots.mjs');
    const source = path.join(root, 'demo/live-sprite-swap');
    for (const name of MOD_FILES) await noLinks(path.join(context.mod, name));
    if (await exists(path.join(context.mod, 'metadata.xml'))) {
      const metadata = await readFile(path.join(context.mod, 'metadata.xml'), 'utf8');
      if (!metadata.includes('<directory>live_sprite_swap_demo</directory>')) throw new SetupError('Refusing to overwrite a different Isaac mod.');
    } else if (await exists(context.mod)) {
      const { readdir } = await import('node:fs/promises');
      if ((await readdir(context.mod)).length) throw new SetupError('Existing destination is not a recognized mod.');
    }
    const previous = await json(path.join(state, 'setup-state.json'), {});
    const receipt = { schemaVersion: 1, applicationVersion: manifest.applicationVersion, game: context.game, mod: context.mod, runtimeBackup: previous.runtimeBackup || null, completed: [], pending: [], updatedAt: new Date().toISOString() };
    if (!options['skip-runtime']) {
      const result = await installRuntime(context.repentogon, manifest.runtime, state);
      if (result.backup) receipt.runtimeBackup = result.backup;
      receipt.completed.push('runtime');
      await atomicJson(path.join(state, 'setup-state.json'), receipt);
    }
    const modBackup = path.join(state, 'backups', `mod-${Date.now()}`);
    for (const name of MOD_FILES) {
      if (!await exists(path.join(context.mod, name))) continue;
      const destination = path.join(modBackup, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(context.mod, name), destination);
    }
    await gameClosed();
    await syncMod(source, context.mod);
    await prepareArtSlots(context.mod, { preserveExisting: true });
    receipt.completed.push('mod', 'artwork');
    receipt.modBackup = modBackup;
    const configured = await configure(context);
    receipt.completed.push('configuration');
    receipt.pending = context.env.NEBIUS_API_KEY ? [] : ['configure_api_key'];
    await atomicJson(path.join(state, 'setup-state.json'), receipt);
    return { receipt: path.join(state, 'setup-state.json'), runtimeBackup: receipt.runtimeBackup, configuration: configured, completed: receipt.completed };
  } finally { await unlink(lock); }
}
export async function configure(context, { directory = root, dryRun = false } = {}) {
  const file = path.join(directory, '.env');
  const values = { ISAAC_GAME_DIRECTORY: context.game, ISAAC_MOD_DIRECTORY: context.mod, REPENTOGON_DIRECTORY: context.repentogon, ISAAC_LOG_FILE: context.log, IMAGE_BACKEND: context.backend };
  for (const value of Object.values(values)) if (/[\r\n]/.test(value)) throw new SetupError('Configuration values cannot contain newlines.');
  await noLinks(file);
  const present = await exists(file);
  let text = await readFile(present ? file : path.join(directory, '.env.example'), 'utf8');
  const original = text;
  for (const [key, value] of Object.entries(values)) {
    const expression = new RegExp(`^${key}[ \t]*=[^\r\n]*`, 'gm');
    const matches = [...text.matchAll(expression)];
    if (matches.length > 1) throw new SetupError(`Duplicate ${key} settings. Resolve them explicitly before setup.`, 2);
    const current = matches[0]?.[0].slice(matches[0][0].indexOf('=') + 1).trim();
    if (present && current && current !== value) throw new SetupError(`Existing ${key} differs. Edit .env explicitly; setup does not overwrite configured values.`, 2);
    text = expression.test(text) ? text.replace(expression, () => `${key}=${value}`) : text + `\n${key}=${value}\n`;
  }
  if (dryRun || (present && text === original)) return present ? 'preserved' : 'planned';
  const temporary = path.join(directory, `.env.setup-${process.pid}.tmp`);
  await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
  await rename(temporary, file);
  return present ? 'filled_blank_paths' : 'created';
}
export async function uninstall(context) {
  validateTargets(context);
  await gameClosed();
  if (!await portAvailable(Number(context.env.NEBIUS_BRIDGE_PORT || 3000))) throw new SetupError('Stop the bridge before uninstall.', 5);
  await noLinks(context.mod);
  const state = stateDirectory(context);
  const receipt = await json(path.join(state, 'setup-state.json'), {});
  if (receipt.mod !== context.mod) throw new SetupError('No matching setup receipt. Nothing was removed.', 2);
  const metadata = await readFile(path.join(context.mod, 'metadata.xml'), 'utf8');
  if (!metadata.includes('<directory>live_sprite_swap_demo</directory>')) throw new SetupError('Destination mod identity changed.');
  const destination = path.join(context.game, `tboi-agent-disabled-${Date.now()}`);
  await rename(context.mod, destination);
  return { preservedAt: destination, message: 'Mod moved outside mods; files, art, and data are preserved. Runtime is unchanged; use rollback separately.' };
}

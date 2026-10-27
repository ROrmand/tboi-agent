import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { exec, exists, readEnv, root } from './common.mjs';

export function steamLibraries(text) {
  return [...text.matchAll(/"path"\s+"([^"\r\n]+)"/g)].map(match => match[1].replaceAll('\\\\', '\\'));
}
export async function detect(options = {}, directory = root) {
  const env = { ...await readEnv(directory), ...process.env };
  const candidates = [];
  if (options['isaac-directory']) candidates.push(options['isaac-directory']);
  else if (env.ISAAC_GAME_DIRECTORY) candidates.push(env.ISAAC_GAME_DIRECTORY);
  else if (env.REPENTOGON_DIRECTORY) candidates.push(path.dirname(env.REPENTOGON_DIRECTORY));
  else if (env.ISAAC_MOD_DIRECTORY) candidates.push(path.dirname(path.dirname(env.ISAAC_MOD_DIRECTORY)));
  if (!candidates.length && process.platform === 'win32') {
    let steam = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam');
    try {
      const { stdout } = await exec('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
      steam = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1].trim() || steam;
    } catch {}
    const libraries = [steam];
    try { libraries.push(...steamLibraries(await readFile(path.join(steam, 'steamapps/libraryfolders.vdf'), 'utf8'))); } catch {}
    for (const library of new Set(libraries)) candidates.push(path.join(library, 'steamapps/common/The Binding of Isaac Rebirth'));
  }
  const games = [];
  for (const candidate of candidates) if (await exists(path.join(candidate, 'isaac-ng.exe'))) games.push(path.resolve(candidate));
  const game = games.length === 1 ? games[0] : null;
  const mod = options['mod-directory'] || env.ISAAC_MOD_DIRECTORY || (game && path.join(game, 'mods/live_sprite_swap_demo'));
  const repentogon = options['repentogon-directory'] || env.REPENTOGON_DIRECTORY || (game && path.join(game, 'Repentogon'));
  const documents = env.ISAAC_LOG_FILE ? null : await documentsDirectory();
  return {
    game, candidates: games, mod: mod ? path.resolve(directory, mod) : null,
    repentogon: repentogon ? path.resolve(directory, repentogon) : null,
    log: env.ISAAC_LOG_FILE || path.join(documents, 'My Games/Binding of Isaac Repentance+/log.txt'),
    backend: options['image-backend'] || env.IMAGE_BACKEND || 'placeholder', env,
  };
}
async function documentsDirectory() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Environment]::GetFolderPath("MyDocuments")']);
      if (stdout.trim()) return stdout.trim();
    } catch {}
  }
  return path.join(os.homedir(), 'Documents');
}

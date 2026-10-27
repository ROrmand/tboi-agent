import path from 'node:path';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { atLeast, exists, sha256, root } from './common.mjs';
import { verifyRuntime } from './runtime.mjs';

export async function doctor(context, manifest, options = {}) {
  const checks = [];
  const add = (id, status, message) => checks.push({ id, status, message });
  add('platform', process.platform === 'win32' ? 'pass' : 'fail', 'Windows is required for play.');
  add('node', atLeast(process.versions.node, manifest.minimumNodeVersion) ? 'pass' : 'fail', `Node ${process.versions.node}; minimum ${manifest.minimumNodeVersion}, recommended 24 LTS.`);
  add('isaac.installation', context.game ? 'pass' : 'needs_user_action', context.game || 'Set --isaac-directory to your Steam Isaac directory; multiple installations require an explicit choice.');
  if (context.game && manifest.runtime?.isaacSha256) {
    add('isaac.compatibility', sha256(await readFile(path.join(context.game, 'isaac-ng.exe'))) === manifest.runtime.isaacSha256 ? 'pass' : 'fail', 'Isaac executable must match the tested runtime version.');
  } else add('isaac.compatibility', options['confirm-repentance-plus'] ? 'warn' : 'needs_user_action', 'Repentance+ version is not verified. Confirm it in Steam and use --confirm-repentance-plus only for a local development build.');
  let binding = false;
  if (context.repentogon && await exists(path.join(context.repentogon, 'zhlREPENTOGON.dll'))) {
    const bytes = await readFile(path.join(context.repentogon, 'zhlREPENTOGON.dll'));
    binding = bytes.includes(Buffer.from('NebiusBridge')) && bytes.includes(Buffer.from('nebius_isaac_bridge_v1', 'utf16le'));
  }
  if (manifest.runtime) add('runtime.compatibility', await verifyRuntime(context.repentogon, manifest.runtime) ? 'pass' : 'needs_user_action', 'Installed REPENTOGON must match every pinned runtime file.');
  else add('runtime.compatibility', binding && options['allow-unpinned-runtime'] ? 'warn' : 'needs_user_action', 'No public runtime is pinned. --allow-unpinned-runtime permits a local binding build only; DLL strings do not prove compatibility.');
  add('runtime.binding', binding ? 'pass' : 'needs_user_action', binding ? 'NebiusBridge markers found; in-game Poll/Ack still requires live testing.' : 'Install the custom REPENTOGON build, not just stock REPENTOGON.');
  let modValid = Boolean(context.mod);
  const { MOD_FILES } = await import('../../bridge/sync-mod.mjs').catch(() => ({ MOD_FILES: [] }));
  if (!MOD_FILES.length) modValid = false;
  for (const name of MOD_FILES) {
    if (!context.mod || !await exists(path.join(context.mod, name))) modValid = false;
    else if (sha256(await readFile(path.join(context.mod, name))) !== sha256(await readFile(path.join(root, 'demo/live-sprite-swap', name)))) modValid = false;
  }
  add('mod.files', modValid ? 'pass' : 'needs_user_action', 'Installed mod files must match this release. Run setup with Isaac and the bridge closed to update them.');
  let artReady = false;
  try {
    const { ART_SLOT_COUNT, artSlotName, familiarArtSlotName, familiarSheetFile, familiarAnimationFile } = await import('../../native/ipc/art-slots.mjs');
    artReady = Boolean(context.mod);
    if (context.mod) for (let slot = 0; slot < ART_SLOT_COUNT; slot++) {
      for (const name of [artSlotName(slot), familiarArtSlotName(slot)]) if (!await exists(path.join(context.mod, 'resources/gfx/items/collectibles', name))) artReady = false;
      for (const name of [familiarSheetFile(slot), familiarAnimationFile(slot)]) if (!await exists(path.join(context.mod, 'resources/gfx/familiars', name))) artReady = false;
    }
  } catch {}
  add('mod.artwork', artReady ? 'pass' : 'needs_user_action', 'All predeclared artwork slots must exist before launching Isaac.');
  try { await import('sharp'); add('dependencies', 'pass', 'Production dependencies load.'); }
  catch { add('dependencies', 'needs_user_action', 'Run setup or npm ci --omit=dev.'); }
  add('nebius.api_key', context.env.NEBIUS_API_KEY?.trim() ? 'pass' : 'needs_user_action', 'Set NEBIUS_API_KEY privately in .env. No paid API request is made by doctor.');
  add('isaac.log', await exists(context.log) ? 'pass' : 'warn', await exists(context.log) ? 'Isaac log exists.' : 'Launch Repentance+ once or set ISAAC_LOG_FILE.');
  add('image.backend', ['placeholder', 'comfyui', 'nebius'].includes(context.backend) ? 'pass' : 'fail', `Artwork backend: ${['placeholder', 'comfyui', 'nebius'].includes(context.backend) ? context.backend : 'invalid'}.`);
  if (context.backend === 'comfyui') {
    try {
      const response = await fetch(new URL('/object_info/CheckpointLoaderSimple', context.env.COMFYUI_URL || 'http://127.0.0.1:8188'), { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw Error();
      const payload = await response.json();
      const names = payload.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      add('comfyui.checkpoint', names.includes(context.env.COMFYUI_CHECKPOINT) ? 'pass' : 'needs_user_action', 'ComfyUI must advertise the configured checkpoint.');
    } catch { add('comfyui.health', 'needs_user_action', 'Start ComfyUI or select placeholder artwork.'); }
  }
  if (context.backend === 'nebius') add('nebius.image_model', context.env.NEBIUS_IMAGE_MODEL ? 'pass' : 'needs_user_action', 'Hosted art requires a configured, supported image model.');
  const port = Number(context.env.NEBIUS_BRIDGE_PORT || 3000);
  add('bridge.port', await portAvailable(port) ? 'pass' : 'needs_user_action', 'Bridge loopback port must be available; stop an existing bridge before setup/start.');
  return { checks, status: checks.some(check => ['fail', 'needs_user_action'].includes(check.status)) ? 'needs_user_action' : 'ok' };
}
export function portAvailable(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve(false);
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

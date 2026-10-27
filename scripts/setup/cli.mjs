import { parseArgs } from 'node:util';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { detect } from './detect.mjs';
import { doctor, portAvailable } from './doctor.mjs';
import { install, stateDirectory, uninstall, validateTargets } from './install.mjs';
import { restoreRuntime } from './runtime.mjs';
import { json, loadManifest, root, SetupError, withSetupLock } from './common.mjs';

const stringOptions = ['isaac-directory', 'mod-directory', 'repentogon-directory', 'image-backend', 'backup'];
const booleanOptions = ['json', 'dry-run', 'non-interactive', 'accept-runtime-change', 'skip-runtime', 'skip-dependencies', 'allow-unpinned-runtime', 'confirm-repentance-plus', 'yes', 'help'];
export function argumentsFor(args) {
  const parsed = parseArgs({ args, allowPositionals: true, options: Object.fromEntries([...stringOptions.map(name => [name, { type: 'string' }]), ...booleanOptions.map(name => [name, { type: 'boolean' }])]) });
  if (parsed.positionals.length > 1) throw new SetupError('Expected one setup command.');
  return { command: parsed.positionals[0] || 'install', options: parsed.values };
}
function report(command, options, result) {
  const output = { schemaVersion: 1, command, ...result };
  if (options.json) console.log(JSON.stringify(output));
  else {
    console.log(`${command}: ${result.status}`);
    if (result.paths) for (const [name, value] of Object.entries(result.paths)) console.log(`${name}: ${value || 'not detected'}`);
    for (const check of result.checks || []) console.log(`[${check.status.toUpperCase()}] ${check.id}: ${check.message}`);
    for (const action of result.actions || []) console.log(`- ${action}`);
    if (result.message) console.log(result.message);
    if (result.receipt) console.log(`Receipt: ${result.receipt}`);
    if (result.runtimeBackup) console.log(`Runtime backup: ${result.runtimeBackup}`);
    if (result.preservedAt) console.log(`Preserved files: ${result.preservedAt}`);
  }
}
export async function main(args = process.argv.slice(2)) {
  let command = 'unknown', options = { json: args.includes('--json') };
  try {
    ({ command, options } = argumentsFor(args));
    if (options.help) {
      report(command, options, { status: 'ok', message: 'Commands: inspect, plan, install, doctor, start, rollback, uninstall. See docs/AGENT_SETUP.md for flags and exit codes.' });
      return 0;
    }
    if (!['inspect', 'plan', 'install', 'doctor', 'start', 'rollback', 'uninstall'].includes(command)) throw new SetupError('Unsupported setup command.');
    const manifest = await loadManifest();
    const context = await detect(options);
    const paths = { game: context.game, mod: context.mod, repentogon: context.repentogon, log: context.log, state: stateDirectory(context) };
    if (command === 'plan' || options['dry-run']) {
      validateTargets(context);
      const runtimeReady = manifest.runtime || options['skip-runtime'];
      report(command, options, { status: runtimeReady ? 'ok' : 'needs_user_action', dryRun: true, paths, actions: command === 'uninstall' ? ['Move only the recognized installed mod outside mods; preserve all files.', 'Keep the runtime unchanged.'] : command === 'rollback' ? ['Restore only files recorded in the selected runtime backup, after integrity checks.'] : ['Install production npm dependencies unless skipped.', options['skip-runtime'] ? 'Leave the native runtime unchanged.' : 'Download pinned native ZIP, verify hashes, back up affected files, overlay runtime after approval.', 'Back up and sync allowlisted mod files; preserve artwork and saves.', 'Prepare missing artwork slots; preserve existing animations.', 'Create configuration or fill blank non-secret paths; never replace configured values.', 'Run doctor; user enables mod and selects a disposable save.'], message: runtimeReady ? 'Review these targets before installation.' : 'Native release is not yet published. Public setup remains blocked; developers may explicitly skip runtime installation.' });
      return runtimeReady ? 0 : 2;
    }
    if (command === 'inspect' || command === 'doctor') {
      const result = await doctor(context, manifest, options);
      report(command, options, { ...result, paths });
      return result.status === 'ok' ? 0 : 2;
    }
    if (!options.json && !options['non-interactive'] && process.stdin.isTTY && command !== 'start') {
      console.log(`Game: ${context.game || 'not detected'}\nMod: ${context.mod || 'not detected'}\nREPENTOGON: ${context.repentogon || 'not detected'}`);
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await prompt.question(`${command === 'install' && !options['skip-runtime'] ? 'Install mod and replace native runtime with backups' : command}, proceed? [y/N] `);
        if (answer.toLowerCase() !== 'y') throw new SetupError('Cancelled; no changes made.', 2);
        options.yes = true;
        if (command === 'install') options['accept-runtime-change'] = true;
      } finally { prompt.close(); }
    }
    if (command === 'install') {
      const result = await install(context, manifest, options);
      const verified = await doctor(await detect(options), manifest, options);
      report(command, options, { ...result, ...verified, paths, message: 'Fully restart Isaac after setup. Enable Live Sprite Swap Demo, select Save File 2/3, begin a run, and press 8. Enter your API key privately if doctor requests it.' });
      return verified.status === 'ok' ? 0 : 2;
    }
    if (command === 'uninstall' || command === 'rollback') {
      if (!options.yes) throw new SetupError('Review the dry-run, then pass --yes to confirm this operation.', 2);
      const state = stateDirectory(context);
      const receipt = await json(path.join(state, 'setup-state.json'), {});
      const backup = options.backup || receipt.runtimeBackup;
      if (command === 'rollback' && !backup) throw new SetupError('No runtime backup recorded; supply --backup from the setup receipt.', 2);
      if (!await portAvailable(Number(context.env.NEBIUS_BRIDGE_PORT || 3000))) throw new SetupError('Stop the bridge before uninstall or rollback.', 5);
      const result = await withSetupLock(state, () => command === 'uninstall' ? uninstall(context) : restoreRuntime(path.resolve(backup), state));
      report(command, options, { status: 'ok', ...result });
      return 0;
    }
    if (options.json) throw new SetupError('start streams bridge logs; use a separate terminal without --json.', 2);
    const result = await doctor(context, manifest, options);
    report(command, options, result);
    if (result.status !== 'ok') return 2;
    console.log('Leave this terminal open. Launch Isaac through REPENTOGON, enable Live Sprite Swap Demo, use Save File 2/3, begin a run, then press 8.');
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['bridge/server.mjs'], { cwd: root, stdio: 'inherit', env: { ...context.env, ISAAC_MOD_DIRECTORY: context.mod, ISAAC_LOG_FILE: context.log, IMAGE_BACKEND: context.backend } });
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
  } catch (error) {
    const known = error instanceof SetupError;
    report(command, options, { status: known && error.code === 2 ? 'needs_user_action' : 'error', error: { code: known ? error.code : 4 }, message: known ? error.message : 'Setup failed. Check permissions, dependencies, and the troubleshooting guide. Raw command output is withheld to avoid exposing credentials.' });
    return known ? error.code : 4;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main();

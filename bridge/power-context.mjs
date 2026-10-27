import { validatePowerSnapshot } from '../content-contract/powers.mjs';

export function readRunPowerContext(context) {
  if (!Number.isInteger(context?.count) || context.count < 0 || context.count > 128) throw Error('Invalid run item count for power ledger. Restart Isaac and the bridge.');
  const snapshot = validatePowerSnapshot(context.power_ledger);
  if (snapshot.accepted_count !== context.count) throw Error('Run power ledger does not match accepted items. Restart Isaac and the bridge.');
  return snapshot;
}

export function decodePowerContext(argument) {
  if (typeof argument !== 'string' || argument.length > 16384) throw Error('Missing or oversized generation power context. Generate through the bridge with an updated active run.');
  let snapshot;
  try { snapshot = JSON.parse(argument); }
  catch { throw Error('Generation power context is not JSON.'); }
  const validated = validatePowerSnapshot(snapshot);
  if (validated.accepted_count > 128) throw Error('Generation power context exceeds run capacity.');
  return validated;
}

export function powerContextArguments(context) {
  const argument = JSON.stringify(readRunPowerContext(context));
  decodePowerContext(argument);
  return ['--power-context', argument];
}

export function assertNoPendingPowerDelivery(records, run) {
  for (const record of records) {
    if (record.run === run && record.state === 'queued') throw Error('Wait for the previous generated item to be accepted by Isaac before generating another power.');
  }
}

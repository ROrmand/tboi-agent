import test from 'node:test';
import assert from 'node:assert/strict';
import { readRunPowerContext, decodePowerContext, powerContextArguments, assertNoPendingPowerDelivery } from './power-context.mjs';
import { POWER_CONTRACT_VERSION, POWER_KEYS, powerFingerprint, powerSignature } from '../content-contract/powers.mjs';

const empty = () => ({ version: POWER_CONTRACT_VERSION, accepted_count: 0, power_usage: {}, power_history: [], recent_power_fingerprints: [] });

test('generation transports a validated copy of the authoritative run snapshot', () => {
  const context = { count: 0, power_ledger: empty() };
  const args = powerContextArguments(context);
  assert.equal(args[0], '--power-context');
  assert.deepEqual(decodePowerContext(args[1]), empty());
  const result = readRunPowerContext(context);
  result.accepted_count = 1;
  assert.equal(context.power_ledger.accepted_count, 0);
});

test('missing, inconsistent, malformed, or unsupported run state fails before generation', () => {
  for (const context of [null, { count: 0 }, { count: -1, power_ledger: empty() },
    { count: 129, power_ledger: empty() }, { count: 1, power_ledger: empty() },
    { count: 0, power_ledger: { ...empty(), version: 99 } },
    { count: 0, power_ledger: { ...empty(), version: 2 } },
    { count: 0, power_ledger: { ...empty(), power_usage: [] } },
    { count: 0, power_ledger: { ...empty(), power_usage: { 'power.slow': 1 } } },
  ]) assert.throws(() => powerContextArguments(context));
});

test('CLI cannot accept corrupt, unbounded, or model-declared ledger data', () => {
  for (const argument of [undefined, '', 'bad', 'null', '[]', ' '.repeat(16385),
    JSON.stringify({ ...empty(), reset: true }),
    JSON.stringify({ ...empty(), power_usage: { 'model.unique': 1 } }),
  ]) assert.throws(() => decodePowerContext(argument));
});

test('pending delivery cannot race a second selection against an obsolete accepted ledger', () => {
  assert.throws(() => assertNoPendingPowerDelivery([{ run: 'run', state: 'queued' }], 'run'), /previous generated item/);
  assert.doesNotThrow(() => assertNoPendingPowerDelivery([
    { run: 'other', state: 'queued' }, { run: 'run', state: 'failed' }, { run: 'run', state: 'applied' },
  ], 'run'));
});

test('maximum accepted history fits the bounded CLI transport and rejects the older running ledger contract', () => {
  const snapshot = { version: POWER_CONTRACT_VERSION, accepted_count: 128,
    power_usage: Object.fromEntries(POWER_KEYS.map(power => [power, 128])),
    power_history: Array(128).fill(powerSignature(POWER_KEYS)),
    recent_power_fingerprints: Array(3).fill(powerFingerprint(POWER_KEYS)) };
  const argument = powerContextArguments({ count: 128, power_ledger: snapshot })[1];
  assert.ok(argument.length < 16384);
  assert.deepEqual(decodePowerContext(argument), snapshot);
  assert.throws(() => readRunPowerContext({ count: 0, power_ledger: {
    version: 1, accepted_count: 0, power_usage: {}, recent_power_fingerprints: [],
  } }), /restart Isaac and the bridge/);
});

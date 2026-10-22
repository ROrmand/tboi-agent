import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRuntimeCompatible, RUNTIME_CONTRACT } from './compatibility.mjs';

test('old loaded mods are rejected with restart instructions before generation', () => {
  const oldContext = { session: 'session', run: 'run', used: [0, 7, 8], count: 0 };
  assert.throws(() => assertRuntimeCompatible(oldContext), /outdated.*fully restart Isaac and the bridge/);
  assert.throws(() => assertRuntimeCompatible({ ...oldContext, runtime_contract: RUNTIME_CONTRACT - 1 }), /incompatible/);
  assert.throws(() => assertRuntimeCompatible({ ...oldContext, runtime_contract: RUNTIME_CONTRACT }), /Save-slot identity/);
  assert.doesNotThrow(() => assertRuntimeCompatible({ ...oldContext, runtime_contract: RUNTIME_CONTRACT, save_slot: 1 }));
});

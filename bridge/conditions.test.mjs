import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildConditionSchema, conditionNames, conditionRegistry, conditionSchema, eventContexts, validateCondition } from '../content-contract/conditions.mjs';
import { checkConditionHandlers, checkConditionMetadata, renderConditionMetadata } from '../scripts/generate-condition-metadata.mjs';
import { sanitizeProfile } from './prompt-features.mjs';
import { syncMod } from './sync-mod.mjs';

test('the condition registry covers exactly the explicit Lua handlers', async () => {
  const source = await readFile(new URL('../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
  const handlers = source.match(/local conditionHandlers = \{([\s\S]*?)\n\}/)[1];
  const names = [...handlers.matchAll(/^  (\w+) = function/gm)].map(match => match[1]);
  assert.equal(conditionNames.length, 37);
  assert.deepEqual(names.sort(), [...conditionNames].sort());
  assert.deepEqual(conditionSchema.properties.type.enum, conditionNames);
  assert.equal(Object.keys(eventContexts).length, 16);
  assert.deepEqual(eventContexts.player_hurt.optional_fields, ['target', 'damage']);
  assert.deepEqual(eventContexts.pickup.fields, ['player']);
  checkConditionHandlers(source);
  assert.throws(() => checkConditionHandlers(source.replace('  chance = function', '  unknown_chance = function')), /handlers differ/);
  await checkConditionMetadata();
});

test('condition parameters derive bounds and requiredness from the registry', () => {
  for (const [name, definition] of Object.entries(conditionRegistry)) {
    const condition = { type: name };
    for (const [parameter, specification] of Object.entries(definition.params)) condition[parameter] = specification.enum?.[0] ?? specification.minimum;
    const context = definition.contexts[0];
    assert.doesNotThrow(() => validateCondition(condition, context));
    assert.throws(() => validateCondition({ ...condition, invented: 1 }, context), /unsupported/);
    for (const [parameter, specification] of Object.entries(definition.params)) {
      const missing = { ...condition };
      delete missing[parameter];
      assert.throws(() => validateCondition(missing, context), /invalid/);
      const invalid = specification.enum ? ['__invalid_value__', null, 0] : [specification.minimum - 1, specification.maximum + 1, NaN, Infinity, '1', null, ...(specification.type === 'integer' ? [1.5] : [])];
      for (const value of invalid) assert.throws(() => validateCondition({ ...condition, [parameter]: value }, context), /invalid/);
      if (!specification.enum) assert.doesNotThrow(() => validateCondition({ ...condition, [parameter]: specification.maximum }, context));
    }
  }
  for (const condition of [null, [], {}, { type: 'invented' }, { type: '__proto__' }]) assert.throws(() => validateCondition(condition, 'room_enter'));
});

test('the shared schema widens numeric bounds without widening each condition contract', () => {
  assert.deepEqual(conditionSchema.properties.amount, { type: 'integer', minimum: 0, maximum: 99 });
  assert.deepEqual(conditionSchema.properties.resource.enum, ['coin', 'key', 'bomb']);
  for (const type of ['hearts_at_most', 'hearts_at_least']) {
    assert.equal(conditionRegistry[type].params.amount.minimum, 1);
    assert.equal(conditionRegistry[type].params.amount.maximum, 12);
    for (const amount of [1, 12]) assert.doesNotThrow(() => validateCondition({ type, amount }, 'room_clear'));
    for (const amount of [0, 13, 99]) assert.throws(() => validateCondition({ type, amount }, 'room_clear'), /amount is invalid/);
  }
  const registry = {
    first: { params: { resource: { type: 'string', required: true, enum: ['coin'] } } },
    second: { params: { resource: { type: 'string', required: true, enum: ['key'] } } },
  };
  assert.deepEqual(buildConditionSchema(registry).properties.resource.enum, ['coin', 'key']);
  assert.deepEqual(registry.first.params.resource.enum, ['coin']);
  registry.second.params.resource = { type: 'integer', minimum: 0, maximum: 99 };
  assert.throws(() => buildConditionSchema(registry), /Conflicting condition parameter type/);
});

test('explicit health and charge contracts keep bounded thresholds and slot-specific normalization', () => {
  const health = ['red_hearts_at_most', 'red_hearts_at_least', 'soul_hearts_at_most', 'soul_hearts_at_least', 'empty_red_hearts_at_least'];
  for (const type of [...health, 'active_charge_at_least']) {
    const extra = type === 'active_charge_at_least' ? { slot: 'primary' } : {};
    const maximum = health.includes(type) ? 24 : 99;
    for (const amount of [0, 1, maximum]) assert.doesNotThrow(() => validateCondition({ type, amount, ...extra }, 'room_clear'));
    for (const amount of [-1, maximum + 1, 0.5, '1', null, NaN, Infinity]) assert.throws(() => validateCondition({ type, amount, ...extra }, 'room_clear'));
    const entry = { type, amount: maximum, slot: 'pocket2', resource: 'coin', chance: 1 };
    const profile = { systems: ['rules'], rules: [{ trigger: 'room_clear', conditions: [entry], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] }] };
    sanitizeProfile(profile);
    assert.deepEqual(profile.rules[0].conditions[0], { type, amount: maximum, ...(type === 'active_charge_at_least' ? { slot: 'pocket2' } : {}) });
  }
  assert.deepEqual(conditionSchema.properties.slot.enum, ['primary', 'secondary', 'pocket', 'pocket2']);
  for (const slot of conditionSchema.properties.slot.enum) assert.doesNotThrow(() => validateCondition({ type: 'active_charge_at_least', amount: 0, slot }, 'active_use'));
  for (const slot of [undefined, null, 0, 3, 'any', 'used', 'SLOT_PRIMARY']) assert.throws(() => validateCondition({ type: 'active_charge_at_least', amount: 0, slot }, 'active_use'));
  assert.throws(() => validateCondition({ type: 'red_hearts_at_least', amount: 1, slot: 'primary' }, 'room_clear'), /slot is unsupported/);
});

test('resource normalization keeps required resource fields only on resource predicates', () => {
  const profile = { systems: ['rules'], rules: [{ trigger: 'room_clear', conditions: [{ type: 'resource_at_least', resource: 'key', amount: 5, chance: 1 }], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] }] };
  sanitizeProfile(profile);
  assert.deepEqual(profile.rules[0].conditions, [{ type: 'resource_at_least', resource: 'key', amount: 5 }]);
  profile.rules[0].conditions = [{ type: 'hearts_at_most', amount: 1, resource: 'key' }];
  assert.throws(() => validateCondition(profile.rules[0].conditions[0], 'room_clear'), /resource is unsupported/);
  sanitizeProfile(profile);
  assert.deepEqual(profile.rules[0].conditions, [{ type: 'hearts_at_most', amount: 1 }]);
});

test('normalization preserves an incompatible condition for strict validation', () => {
  const profile = { systems: ['rules'], rules: [{ trigger: 'room_enter', conditions: [{ type: 'once_per_target' }], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] }] };
  sanitizeProfile(profile);
  assert.deepEqual(profile.rules[0].conditions, [{ type: 'once_per_target' }]);
  assert.throws(() => validateCondition(profile.rules[0].conditions[0], 'room_enter', 'rules[0].conditions[0]'), /rules\[0\].*once_per_target.*room_enter/);
});

test('metadata output is deterministic and stale staging fails before copying', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'condition-staging-'));
  try {
    const file = path.join(directory, 'condition_metadata.lua');
    await writeFile(file, renderConditionMetadata());
    await writeFile(path.join(directory, 'main.lua'), 'local conditionHandlers = {}');
    await checkConditionMetadata(file);
    await writeFile(file, renderConditionMetadata().replaceAll('\n', '\r\n'));
    await checkConditionMetadata(file);
    await assert.rejects(syncMod(directory, path.join(directory, 'target')), /handlers differ/);
    assert.equal(renderConditionMetadata(), renderConditionMetadata());
    await writeFile(file, 'return {}\n');
    await assert.rejects(checkConditionMetadata(file), /Stale condition metadata/);
    const target = path.join(directory, 'target');
    await assert.rejects(syncMod(directory, target), /Stale condition metadata/);
    await assert.rejects(readFile(path.join(target, 'main.lua')), { code: 'ENOENT' });
    await assert.rejects(syncMod(directory, directory), /Stale condition metadata/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

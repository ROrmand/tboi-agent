import test from 'node:test';
import assert from 'node:assert/strict';
import { expandedEffects, validateExpandedAction, expandedActionWeight } from './expanded-effects.mjs';
import { validateProfile } from './generate.mjs';
import { explicitPowerKeys, compatibleSkeletons } from './power-planner.mjs';
import { POWER_KEYS } from '../content-contract/powers.mjs';
import { createLuaProfileValidator } from '../scripts/power-diversity.mjs';

test('unproven ordinary-rock removal stays absent from the action and semantic catalogs', () => {
  assert.equal(Object.hasOwn(expandedEffects.actions, 'break_ordinary_rock'), false);
  assert.equal(POWER_KEYS.includes('power.rock_breaking'), false);
  const action = { type: 'break_ordinary_rock', count: 1, radius: 40, cooldown: 90 };
  assert.deepEqual(validateExpandedAction(action, 'room_enter'), ['unknown expanded action']);
  assert.throws(() => expandedActionWeight(action), /Invalid expanded action/);
});

test('production Node and Lua validators reject speculative rock removal across deliveries', async () => {
  const runtime = await createLuaProfileValidator();
  try {
    for (const trigger of ['room_enter', 'room_clear', 'tear_fire', 'active_use', 'enemy_hit', 'player_hurt', 'tear_impact', 'collision']) {
      const system = ['enemy_hit', 'player_hurt'].includes(trigger) ? 'on_hit' : ['tear_impact', 'collision'].includes(trigger) ? trigger : 'rules';
      const proc = { conditions: [], actions: [{ type: 'break_ordinary_rock', count: 1, radius: 40, cooldown: 90 }] };
      const profile = { region: 'passive', systems: [system], affects_stats: false, metadata: { display_name: 'Unproven Rock Removal', description: 'Not an enabled primitive.', quality: 0, theme: 'none', balance_note: '' }, visuals: { pedestal_prompt: 'One small artifact' }, rules: [] };
      if (['rules', 'on_hit'].includes(system)) profile.rules = [{ trigger, ...proc }];
      else profile[system] = proc;
      assert.throws(() => validateProfile(profile), trigger);
      await assert.rejects(runtime.validate(profile), trigger);
    }
  } finally { runtime.close(); }
});

test('Creator and planner cannot admit rock breaking as implemented breadth', () => {
  assert.equal(explicitPowerKeys({ source: 'Creator', prompt: 'break one nearby ordinary rock without damage' }).includes('power.rock_breaking'), false);
  for (let quality = 0; quality <= 4; quality += 1) {
    const { candidates } = compatibleSkeletons({ quality, seed: 'milestone4', request: { source: 'Creator', prompt: 'break one nearby ordinary rock without damage' } });
    for (const candidate of candidates) assert.equal(JSON.stringify(candidate).includes('power.rock_breaking'), false);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { expandedEffects, expandedActionTypes, expandedActionSchema, expandedActionSchemas, validateExpandedAction, expandedActionWeight, summarizeExpandedAction } from './expanded-effects.mjs';
import { validateProfile, repairGeneratedProfile } from './generate.mjs';
import { profileWeight } from './weights.mjs';
import { createLuaProfileValidator } from '../scripts/power-diversity.mjs';
import { checkEffectMetadata } from '../scripts/generate-effect-metadata.mjs';

test('production Node and Lua validators admit every bounded family without legacy amount or silent repair', async () => {
  await checkEffectMetadata();
  const runtime=await createLuaProfileValidator();
  try {
    for (const [type,spec] of Object.entries(expandedEffects.actions)) {
      for (const trigger of spec.triggers) {
        const system=['enemy_hit','player_hurt'].includes(trigger)?'on_hit':['tear_impact','collision'].includes(trigger)?trigger:'rules';
        const proc={conditions:[],actions:[structuredClone(spec.example)]};
        const profile={region:'passive',systems:[system],affects_stats:false,metadata:{display_name:'Bounded Effect',description:'A tested primitive.',quality:4,theme:'none',balance_note:''},visuals:{pedestal_prompt:'One small artifact'},rules:[]};
        if (['rules','on_hit'].includes(system)) profile.rules=[{trigger,...proc}];
        else profile[system]=proc;
        validateProfile(profile);
        assert.equal(profileWeight(profile,(await import('./power-planner.mjs')).plannerCapabilities),expandedActionWeight(spec.example));
        await runtime.validate(profile);
        const repaired=repairGeneratedProfile(structuredClone(profile),'',4);
        assert.deepEqual(system==='rules'||system==='on_hit'?repaired.rules[0].actions[0]:repaired[system].actions[0],spec.example);
        for (const mutation of [{amount:1},{execute:'code'},{cooldown:0}]) {
          const invalid=structuredClone(profile);
          Object.assign(system==='rules'||system==='on_hit'?invalid.rules[0].actions[0]:invalid[system].actions[0],mutation);
          assert.throws(()=>validateProfile(invalid),type);
          await assert.rejects(runtime.validate(invalid));
        }
      }
    }
  } finally {runtime.close();}
});

for (const [type, spec] of Object.entries(expandedEffects.actions)) {
  test(type + ': strict schema, triggers, bounds, weight and summary', () => {
    const schema = expandedActionSchemas[type];
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required.sort(), ['type', ...Object.keys(spec.params)].sort());
    for (const trigger of spec.triggers) assert.deepEqual(validateExpandedAction(spec.example, trigger), []);
    for (const trigger of ['player_death', 'new_floor', 'pickup', 'on_kill', 'bogus', undefined]) {
      assert.ok(validateExpandedAction(spec.example, trigger).length);
    }
    for (const [name, parameter] of Object.entries(spec.params)) {
      const action = { ...spec.example };
      delete action[name];
      assert.ok(validateExpandedAction(action, spec.triggers[0]).length, 'required ' + name);
      const invalid = parameter.enum ? ['', 'bogus', 1, null] : [parameter.min - 0.01, parameter.max + 0.01, NaN, Infinity, -Infinity, '1', true, null, ...(parameter.integer ? [parameter.min + 0.5] : [])];
      for (const value of invalid) assert.ok(validateExpandedAction({ ...spec.example, [name]: value }, spec.triggers[0]).length, name + ' rejects ' + value);
      const valid = parameter.enum || [parameter.min, parameter.max];
      for (const value of valid) assert.deepEqual(validateExpandedAction({ ...spec.example, [name]: value }, spec.triggers[0]), []);
      assert.deepEqual(schema.properties[name], parameter.enum ? { type: 'string', enum: parameter.enum } : { type: parameter.integer ? 'integer' : 'number', minimum: parameter.min, maximum: parameter.max });
    }
    for (const name of ['amount', 'code', 'duration_override', '__proto__']) {
      assert.ok(validateExpandedAction({ ...spec.example, [name]: 1 }, spec.triggers[0]).length);
    }
    const expected = spec.base_weight + Object.entries(spec.params).reduce((total, [name, parameter]) => total + (parameter.weight || 0) * (typeof spec.example[name] === 'number' ? spec.example[name] : 0), 0);
    assert.equal(expandedActionWeight(spec.example), expected);
    assert.match(summarizeExpandedAction(spec.example), /cooldown .* frames after success/);
    const maximum = { ...spec.example };
    for (const [name, parameter] of Object.entries(spec.params)) if (!parameter.enum) maximum[name] = parameter.max;
    assert.ok(expandedActionWeight(maximum) >= expected);
    assert.throws(() => expandedActionWeight({ ...spec.example, cooldown: 0 }));
    assert.throws(() => summarizeExpandedAction({ ...spec.example, code: 'arbitrary' }));
  });
}

test('catalog has eight fixed actions in six distinct families and rejects foreign actions', () => {
  assert.equal(expandedActionTypes.length, 8);
  assert.match(expandedEffects.actions.reflect_projectiles.description, /plain owned tears/);
  assert.match(expandedEffects.actions.reflect_projectiles.description, /lasers are untouched/);
  assert.deepEqual(expandedActionSchema.anyOf, Object.values(expandedActionSchemas));
  assert.equal(new Set(Object.values(expandedEffects.actions).map(spec => spec.family)).size, 6);
  for (const action of [null, [], 1, {}, { type: 'spawn_creep' }, { type: 'constructor' }, { type: '__proto__' }, { type: 'toString' }]) {
    assert.ok(validateExpandedAction(action, 'active_use').length);
    assert.throws(() => expandedActionWeight(action));
  }
});

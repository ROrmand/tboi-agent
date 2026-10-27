import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPowerDesignBrief, validatePowerDesign } from './power-design.mjs';
import { validateProfile } from './generate.mjs';
import { buildPowerLedger, powerSnapshot, derivePowerKeys } from '../content-contract/powers.mjs';

const empty = () => powerSnapshot(buildPowerLedger([]));

test('stat-only Creator wishes do not receive unrelated random powers or supporting tradeoffs', () => {
  for (const prompt of ['Add luck.','one luck stat','Move a bit faster.']) {
    const result=buildPowerDesignBrief(prompt,empty(),{quality:1,seed:'specific',validateProfile});
    assert.equal(result.skeleton.mode,'explicit_stats');
    assert.deepEqual(result.skeleton.profile.systems,['stats']);
    assert.deepEqual(derivePowerKeys(result.skeleton.profile),[]);
    assert.equal(result.skeleton.profile.stats.soul_hearts,0);
    assert.equal(validatePowerDesign(result.skeleton.profile,result.skeleton,validateProfile),true);
    const extra=structuredClone(result.skeleton.profile);extra.stats.damage+=1;
    assert.throws(()=>validatePowerDesign(extra,result.skeleton,validateProfile),/explicit stat wish/);
  }
});

test('named delivery and supporting stats survive local planning without unrelated power padding', () => {
  for (const prompt of ['Tears burn.','Add luck. Tears burn.']) {
    const result=buildPowerDesignBrief(prompt,empty(),{quality:3,seed:'specific',validateProfile});
    assert.deepEqual(result.skeleton.profile.tear_profile.flags,['burn']);
    assert.deepEqual(derivePowerKeys(result.skeleton.profile),['power.burn']);
    if (prompt.startsWith('Add luck')) assert.equal(result.skeleton.profile.stats.luck,1);
  }
  assert.throws(() => buildPowerDesignBrief('a familiar friend and a damage aura',empty(),{quality:3,seed:'specific',validateProfile}), /temporarily vaulted/);
});

test('local selection precedes the naming brief and its power contract survives validation', () => {
  const options = { quality: 1, seed: 'request_1', validateProfile };
  const result = buildPowerDesignBrief('An old glass eye', empty(), options);
  assert.deepEqual(buildPowerDesignBrief('An old glass eye', empty(), options), result);
  assert.match(result.designPrompt, /Trusted local catalog skeleton/);
  assert.match(result.designPrompt, /exact supporting stat\/health/);
  assert.ok(result.skeleton.mechanicIds.every(name => result.ideaBrief.includes(name)));
  assert.equal(validatePowerDesign(result.skeleton.profile, result.skeleton, validateProfile), true);
  const extraPower = structuredClone(result.skeleton.profile);
  extraPower.systems.push('knife'); extraPower.knife = { damage: 0.5 };
  assert.throws(() => validatePowerDesign(extraPower, result.skeleton), /planned semantic powers/);
});

test('exhausted catalog repeats are explicitly reported in the trusted design brief', () => {
  const options = { quality: 0, source: 'Generator', seed: 'milestone4:0:72', validateProfile };
  const first = buildPowerDesignBrief('a damp ribbon', empty(), options);
  const snapshot = powerSnapshot(buildPowerLedger([{ id: 'first', source: 'Generator', profile: first.skeleton.profile }]));
  const repeated = buildPowerDesignBrief('a damp ribbon', snapshot, options);
  assert.equal(JSON.parse(first.ideaBrief).constrained_repeat_fallback, false);
  assert.equal(repeated.skeleton.constrainedRepeat, true);
  assert.equal(JSON.parse(repeated.ideaBrief).constrained_repeat_fallback, true);
  assert.equal(JSON.parse(repeated.ideaBrief).repeated_power_fingerprint, true);
  assert.match(repeated.designPrompt, /"constrained_repeat_fallback":true/);
  assert.equal(validatePowerDesign(repeated.skeleton.profile, repeated.skeleton, validateProfile), true);
});

test('every source uses the supplied accepted ledger and only explicit Creator wishes bypass their own power penalty', () => {
  const first = buildPowerDesignBrief('slowing tears', empty(), { quality: 1, seed: 'first', validateProfile });
  assert.deepEqual(derivePowerKeys(first.skeleton.profile), ['power.slow']);
  const snapshot = powerSnapshot(buildPowerLedger([{ id: 'accepted', source: 'Creator', profile: first.skeleton.profile }]));
  for (const source of ['Creator', 'Generator', 'Singularity']) {
    const result = buildPowerDesignBrief('An old glass eye', snapshot, { quality: 1, source, seed: 'next', validateProfile });
    assert.ok(!derivePowerKeys(result.skeleton.profile).includes('power.slow'));
  }
  const explicit = buildPowerDesignBrief('slowing tears', snapshot, { quality: 1, seed: 'wish', validateProfile });
  assert.deepEqual(derivePowerKeys(explicit.skeleton.profile), ['power.slow']);
  assert.throws(() => buildPowerDesignBrief('theme', undefined, { quality: 1, seed: 'missing' }), /snapshot/);
});

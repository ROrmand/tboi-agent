import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { toLua } from './runtime.mjs';
import { validateProfile } from './generate.mjs';
import { profileWeight } from './weights.mjs';
import { conditionRegistry } from '../content-contract/conditions.mjs';
import { buildPowerLedger, decodePowerSignature, derivePowerKeys, MAX_ACCEPTED_POWER_RECORDS, POWER_CONTRACT_VERSION, POWER_KEYS, powerCatalog, powerDistance, powerFingerprint,
  powerMultipliers, powerSignature, powerSnapshot, validatePowerFingerprint, validatePowerSnapshot } from '../content-contract/powers.mjs';
import { compatibleSkeletons, explicitPowerKeys, MECHANIC_CATALOG, plannerCapabilities, QUALITY_ARCHETYPES,
  sampleSupportingChoices, selectSkeleton, SUPPORT_RATES, validateSkeleton } from './power-planner.mjs';
import { createLuaProfileValidator, renderLuaPowerLedger, runDiversityBatch } from '../scripts/power-diversity.mjs';

const empty = () => powerSnapshot(buildPowerLedger([]));
const copy = value => structuredClone(value);
function design(fragment = {}, quality = 4) {
  const profile = { region: 'passive', systems: [], affects_stats: false,
    metadata: { display_name: 'Ledger Fixture', description: 'A bounded mechanic.', quality, theme: 'none', balance_note: '' },
    visuals: { pedestal_prompt: 'A small artifact.' }, rules: [], ...copy(fragment) };
  profile.affects_stats = profile.systems.includes('stats');
  const familiar = profile.systems.includes('familiar'), aura = profile.systems.includes('aura');
  profile.region = familiar ? aura ? 'familiar_aura' : 'familiar' : aura ? 'aura' : 'passive';
  return profile;
}
const entry = id => MECHANIC_CATALOG.find(mechanic => mechanic.id === id);

test('safe combat procs repeat on bounded luck rolls without a cooldown or room latch', () => {
  const safe = MECHANIC_CATALOG.filter(mechanic => /status[.]|rules[.](creep|summon)[.]/.test(mechanic.id));
  assert.equal(safe.length, plannerCapabilities.combat_effects.apply_status.statuses.length * 3
    + plannerCapabilities.creeps.length + plannerCapabilities.friendlies.length);
  for (const mechanic of safe) {
    const profile = design(mechanic.fragment);
    const proc = profile.rules[0] ?? profile.tear_impact ?? profile.collision ?? profile.on_kill;
    const action = proc.actions[0];
    assert.equal(proc.cooldown, 0, mechanic.id);
    assert.deepEqual(proc.conditions, [{ type: 'luck_chance', chance: action.type === 'spawn_friendly' ? 0.1 : 0.2, luck_scale: 0.02 }]);
    if (action.type === 'spawn_friendly') {
      assert.equal(proc.trigger, 'tear_fire');
      assert.equal(action.amount, 1);
    }
    if (action.type === 'spawn_creep') assert.equal(action.duration, 120);
    if (action.type === 'apply_status') assert.equal(action.duration, 60);
    validateProfile(profile);
    const skeleton = { version: 1, quality: 4, mechanicIds: [mechanic.id], fingerprint: powerFingerprint(profile) };
    validateSkeleton(profile, skeleton);
    proc.conditions.push({ type: 'once_per_room' });
    assert.throws(() => validateSkeleton(profile, skeleton), /dropped skeleton mechanic/);
    proc.conditions.pop(); proc.cooldown = 30;
    assert.throws(() => validateSkeleton(profile, skeleton), /dropped skeleton mechanic/);
  }
  for (const mechanic of MECHANIC_CATALOG.filter(mechanic => mechanic.id.startsWith('effect.'))) {
    const proc = mechanic.fragment.rules?.[0] ?? mechanic.fragment.tear_impact ?? mechanic.fragment.collision;
    assert.equal(proc.cooldown, 30);
    assert.deepEqual(proc.conditions, [{ type: 'luck_chance', chance: 0.2, luck_scale: 0.02 }]);
    assert.ok(proc.actions[0].cooldown >= 15);
  }
});

test('automatic on-kill status candidates never target an already dead enemy', () => {
  assert.ok(!MECHANIC_CATALOG.some(mechanic => mechanic.id.startsWith('on_kill.status.')));
  assert.ok(MECHANIC_CATALOG.some(mechanic => mechanic.id === 'on_kill.damage_burst'));
  for (const status of plannerCapabilities.combat_effects.apply_status.statuses) {
    for (const system of ['tear_impact', 'collision', 'on_hit']) assert.ok(entry(system + '.status.' + status));
  }
});

test('positive support is more frequent, independently sampled, and never spends health', () => {
  for (let quality = 0; quality <= 4; quality += 1) {
    let statUps = 0, healthUps = 0;
    for (let seed = 0; seed < 1000; seed += 1) {
      const support = sampleSupportingChoices({ quality, seed });
      statUps += Number(support.choices.statUp);
      healthUps += Number(support.choices.healthUp);
      assert.equal(support.choices.healthTradeoff, false);
      assert.equal(support.stats.soul_hearts, support.choices.healthUp ? 1 : 0);
      assert.equal(support.stats.damage, support.choices.statUp ? 1 : 0);
    }
    assert.ok(Math.abs(statUps / 1000 - SUPPORT_RATES[quality].statUp) < 0.05);
    assert.ok(Math.abs(healthUps / 1000 - SUPPORT_RATES[quality].healthUp) < 0.05);
    assert.ok(SUPPORT_RATES[quality].statUp >= 0.5);
    assert.ok(SUPPORT_RATES[quality].healthUp >= 0.3);
    const skeleton = selectSkeleton({ quality, seed: 1, powerUsage: empty(), validateProfile });
    assert.ok(profileWeight(skeleton.profile, plannerCapabilities) <= plannerCapabilities.quality_budgets[quality]);
    assert.deepEqual(skeleton.support, sampleSupportingChoices({ quality, seed: 1 }));
  }
  assert.ok(Object.values(sampleSupportingChoices({ quality: 4, seed: 1, itemType: 'active' }).stats).every(value => value === 0));
});

test('automatic knives and lasers require owned context while explicit wishes survive cache reuse', () => {
  for (const quality of [0, 1, 2, 3, 4]) {
    const automatic = compatibleSkeletons({ quality, seed: 1, request: { source: 'Generator' } });
    assert.ok(automatic.candidates.length > 0);
    assert.ok(automatic.candidates.every(candidate => !candidate.profile.knife && !candidate.profile.laser));
  }
  for (const [weapon, prompt] of [['knife', 'stronger knives'], ['laser', 'stronger lasers']]) {
    const options = { quality: 1, seed: 1, powerUsage: empty(), validateProfile };
    const wished = selectSkeleton({ ...options, request: { prompt } });
    assert.deepEqual(wished.powerKeys, ['power.' + weapon + '_damage']);
    const owned = compatibleSkeletons({ ...options, request: { source: 'Generator', ownedWeapons: [weapon] } });
    assert.ok(owned.candidates.some(candidate => candidate.profile[weapon]));
    const automatic = compatibleSkeletons({ ...options, request: { source: 'Generator', prompt } });
    assert.ok(automatic.candidates.every(candidate => !candidate.profile.knife && !candidate.profile.laser));
  }
  assert.throws(() => compatibleSkeletons({ quality: 1, request: { ownedWeapons: ['tears'] } }), /owned weapon/);
});
const accepted = (id, profile, source = 'Creator') => ({ id, profile, source, status: 'accepted' });
function usageSnapshot(usage, recent = ['[]', '[]', '[]']) {
  const history = Array.from({ length: 97 }, () => []).concat(recent.map(fingerprint => JSON.parse(fingerprint)));
  for (const [power, count] of Object.entries(usage)) {
    const remaining = count - history.slice(-3).filter(powers => powers.includes(power)).length;
    for (let index = 0; index < remaining; index += 1) history[index].push(power);
  }
  return validatePowerSnapshot({ version: POWER_CONTRACT_VERSION, accepted_count: 100, power_usage: usage,
    power_history: history.map(powerSignature), recent_power_fingerprints: recent });
}

test('data-only catalog covers current capabilities and every tracked power has a real mechanic', () => {
  const sources = powerCatalog.profile_sources;
  assert.deepEqual(Object.keys(sources.find(source => source.system === 'tears').values), plannerCapabilities.tear_flags);
  assert.deepEqual(sources.find(source => source.system === 'familiar' && source.each).values, sources.find(source => source.system === 'tears').values);
  assert.deepEqual(Object.keys(sources.find(source => source.system === 'tear_update').values), plannerCapabilities.tear_update_behaviors);
  assert.deepEqual(Object.keys(sources.find(source => source.system === 'aura').values), plannerCapabilities.auras);
  assert.deepEqual(Object.keys(sources.find(source => source.system === 'familiar' && !source.each).values).sort(), [...plannerCapabilities.familiars].sort());
  assert.deepEqual(Object.keys(sources.find(source => source.system === 'bomb' && source.each).values), plannerCapabilities.bomb_flags);
  const action = type => powerCatalog.action_sources.find(source => source.type === type);
  assert.deepEqual(Object.keys(action('apply_status').values), plannerCapabilities.combat_effects.apply_status.statuses);
  assert.deepEqual(Object.keys(action('spawn_creep').values).sort(), [...plannerCapabilities.creeps].sort());
  assert.deepEqual(Object.keys(action('spawn_friendly').values), plannerCapabilities.friendlies);
  for (const type of plannerCapabilities.actions) assert.ok(action(type) || powerCatalog.ignored_actions.includes(type), type);
  assert.deepEqual([...new Set(MECHANIC_CATALOG.flatMap(mechanic => mechanic.powers))].sort(), POWER_KEYS);
  assert.equal(new Set(MECHANIC_CATALOG.map(mechanic => mechanic.id)).size, MECHANIC_CATALOG.length);
  assert.equal(MAX_ACCEPTED_POWER_RECORDS, 128);
});

test('slow tears, familiar flags, aura, status, and slowing creep normalize once per accepted item', () => {
  const ids = ['tears.slow', 'tears.slowing_creep', 'aura.slow', 'tear_impact.status.slow', 'collision.status.slow', 'rules.creep.black'];
  const records = ids.map((id, index) => accepted(String(index), design(entry(id).fragment)));
  records.forEach(record => assert.deepEqual(derivePowerKeys(record.profile), ['power.slow']));
  const familiar = design(entry('familiar.normal').fragment);
  familiar.familiar.attack.flags = ['slow', 'slowing_creep'];
  assert.deepEqual(derivePowerKeys(familiar), ['power.familiar_shots', 'power.slow']);
  records.push(accepted('uncollected-familiar', familiar));
  assert.equal(buildPowerLedger(records).power_usage['power.slow'], 7);
  const combined = design({ systems: ['tears', 'aura'], tear_profile: entry('tears.slow').fragment.tear_profile, aura: entry('aura.slow').fragment.aura });
  assert.equal(buildPowerLedger([accepted('both', combined)]).power_usage['power.slow'], 1);
});

test('all systems derive actual powers, including inactive familiar projectiles and active outcomes', () => {
  assert.deepEqual(derivePowerKeys(entry('tear_update.home').fragment), ['power.homing']);
  assert.deepEqual(derivePowerKeys(entry('tear_update.shrink').fragment), ['power.shrink']);
  assert.deepEqual(derivePowerKeys(entry('bomb.poison').fragment), ['power.bomb_damage', 'power.poison']);
  assert.deepEqual(derivePowerKeys(entry('laser.damage').fragment), ['power.laser_damage']);
  assert.deepEqual(derivePowerKeys(entry('knife.damage').fragment), ['power.knife_damage']);
  assert.deepEqual(derivePowerKeys(entry('active.radial_burst').fragment), ['power.damage_burst']);
  assert.deepEqual(derivePowerKeys(entry('on_kill.damage_burst').fragment), ['power.damage_burst']);
  assert.deepEqual(derivePowerKeys(entry('familiar.shield').fragment), ['power.contact_damage', 'power.projectile_blocking', 'power.shielding']);
  assert.deepEqual(derivePowerKeys({ systems: [], tear_profile: entry('tears.slow').fragment.tear_profile }), []);
});

test('bounded effects share semantic powers where equivalent and exclude ordinary paid charge', () => {
  const powers=action=>derivePowerKeys({systems:['rules'],rules:[{trigger:'active_use',actions:[action]}]});
  assert.deepEqual(powers({type:'extra_tears'}),['power.extra_tears']);
  assert.deepEqual(powers({type:'target_impulse',direction:'push'}),['power.knockback']);
  assert.deepEqual(powers({type:'target_impulse',direction:'pull'}),['power.pull']);
  assert.deepEqual(powers({type:'block_projectiles'}),['power.projectile_blocking']);
  assert.deepEqual(powers({type:'reflect_projectiles'}),['power.projectile_reflection']);
  assert.deepEqual(powers({type:'dash'}),['power.dash']);
  assert.deepEqual(powers({type:'temporary_ally'}),['power.summon.pooter']);
  assert.deepEqual(powers({type:'coins_to_charge'}),[]);
});

test('an exhausted low-quality catalog uses a reported least-used fallback without changing supporting choices', () => {
  const seed='milestone4:0:72';
  const snapshot=powerSnapshot(buildPowerLedger([accepted('dip',design(entry('rules.summon.dip').fragment,0))]));
  const before=copy(snapshot);
  const candidates=compatibleSkeletons({quality:0,seed,request:{source:'Generator'}});
  assert.deepEqual([...new Set(candidates.candidates.map(candidate=>candidate.fingerprint))],['["power.summon.dip"]']);
  const options={quality:0,seed,powerUsage:snapshot,request:{source:'Generator'},validateProfile};
  const selected=selectSkeleton(options);
  assert.equal(selected.constrainedRepeat,true);
  assert.equal(selected.fallback,true);
  assert.deepEqual(selected.powerKeys,['power.summon.dip']);
  assert.deepEqual(selected.support,candidates.support);
  assert.deepEqual(selectSkeleton(options),selected);
  assert.equal(validateSkeleton(selected.profile,selected,{validateProfile}),true);
  assert.deepEqual(snapshot,before);
  assert.deepEqual(compatibleSkeletons({quality:0,seed,request:{source:'Generator'}}).support,candidates.support);
});

test('every condition, repeated triggers, ordinary rewards, resources, and stat/health tradeoffs have no power penalty', () => {
  const stats = { damage: 1, tears: -1, shot_speed: -0.1, range: 2, speed: 0.1, luck: -1, soul_hearts: -1 };
  const actions = [
    { type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }, { type: 'grant_stat', stat: 'damage', amount: 1 },
    { type: 'grant_heart_containers', amount: 1 }, { type: 'grant_soul_hearts', amount: 1 },
    { type: 'convert_resource', input_resource: 'coin', output_resource: 'key', cost: 1, amount: 1 }, { type: 'refill_charge', amount: 1 },
  ];
  const records = [];
  for (const [type, definition] of Object.entries(conditionRegistry)) {
    const condition = { type };
    for (const [name, spec] of Object.entries(definition.params)) condition[name] = spec.enum?.[0] ?? spec.minimum;
    for (const trigger of ['room_enter', 'room_clear']) {
      const profile = design({ systems: ['rules', 'stats'], stats,
        rules: [{ trigger, conditions: [condition], actions, cooldown: 30 }] });
      assert.deepEqual(derivePowerKeys(profile), []);
      records.push(accepted(`${type}:${trigger}`, profile));
    }
  }
  const before = powerMultipliers(empty(), POWER_KEYS), ledger = buildPowerLedger(records);
  assert.deepEqual(ledger.power_usage, {});
  assert.deepEqual(powerMultipliers(powerSnapshot(ledger), POWER_KEYS), before);
  const gain = copy(records[0].profile); gain.stats.soul_hearts = 1;
  assert.deepEqual(derivePowerKeys(gain), []);
  assert.equal(profileWeight(gain, plannerCapabilities) - profileWeight(records[0].profile, plannerCapabilities), 4);
});

test('accepted-record identity is idempotent, rejected jobs never count, and restore order is deterministic', () => {
  const records = ['Creator', 'Generator', 'Singularity'].map((source, index) => accepted(`id-${index}`, design(entry('tears.slow').fragment), source));
  const ledger = buildPowerLedger([...records, copy(records[0]), ...['failed', 'rejected', 'repaired', 'cancelled'].map(status => ({ status }))]);
  assert.equal(ledger.accepted_count, 3);
  assert.deepEqual(ledger.power_usage, { 'power.slow': 3 });
  assert.deepEqual(ledger.entries.map(record => record.source), ['Creator', 'Generator', 'Singularity']);
  assert.deepEqual(ledger.entries.map(record => record.order), [1, 2, 3]);
  assert.deepEqual(buildPowerLedger(JSON.parse(JSON.stringify(records))), ledger);
  const raw = records.map(record => ({ ...record.profile, bridge_request_id: record.id }));
  assert.deepEqual(powerSnapshot(buildPowerLedger(raw)), powerSnapshot(ledger));
  assert.throws(() => buildPowerLedger([records[0], { ...copy(records[0]), profile: design(entry('tears.burn').fragment) }]), /Conflicting duplicate/);
  assert.throws(() => buildPowerLedger([{ profile: records[0].profile }]), /stable identity/);
  assert.throws(() => buildPowerLedger([{ ...records[0], profile: { ...records[0].profile, bridge_request_id: 'other' } }]), /Conflicting accepted identity/);
  assert.throws(() => buildPowerLedger(Array.from({ length: 129 }, (_, index) => accepted(String(index), design()))), /capacity/);
});

test('snapshot validation fails closed on malformed, impossible, stale, and model-controlled data', () => {
  const good = powerSnapshot(buildPowerLedger([accepted('one', design(entry('tears.slow').fragment))]));
  assert.deepEqual(validatePowerSnapshot(good), good);
  for (const bad of [undefined, [], { ...good, version: 0 }, { ...good, accepted_count: -1 }, { ...good, accepted_count: 129 },
    { ...good, power_usage: [] }, { ...good, power_usage: { 'power.fake': 1 } }, { ...good, power_usage: { 'power.slow': 0 } },
    { ...good, power_usage: { 'power.slow': 1.5 } }, { ...good, power_usage: { 'power.slow': 2 } },
    { ...good, recent_power_fingerprints: [] }, { ...good, recent_power_fingerprints: ['[ "power.slow" ]'] },
    { ...good, recent_power_fingerprints: ['["power.slow","power.slow"]'] }, { ...good, multiplier: 1 },
    { ...good, power_usage: {} }, { ...good, accepted_count: 4, power_usage: { 'power.slow': 4 }, recent_power_fingerprints: ['[]', '[]', '[]'] }]) {
    assert.throws(() => validatePowerSnapshot(bad));
  }
  const detached = validatePowerSnapshot(good); detached.power_usage['power.slow'] = 0;
  assert.equal(good.power_usage['power.slow'], 1);
});

test('power-only fingerprints ignore all supporting details and distance is semantic Jaccard', () => {
  const first = design(entry('tears.slow').fragment), second = copy(first);
  second.metadata.quality = 0; second.tear_profile.scale = 2;
  second.rules = [{ trigger: 'room_enter', conditions: [{ type: 'chance', chance: 0.1 }], actions: [{ type: 'spawn_pickup', pickup_type: 'heart', amount: 1 }] }];
  assert.equal(powerFingerprint(first), powerFingerprint(second));
  assert.equal(powerDistance(first, second), 0);
  assert.equal(powerDistance(['power.slow'], ['power.burn']), 1);
  assert.equal(powerDistance(['power.slow'], ['power.slow', 'power.burn']), 0.5);
  assert.equal(powerDistance([], []), 0);
  assert.throws(() => validatePowerFingerprint('["power.invented"]'));
});

test('compact history is canonical, lossless above 32 bits, and reconstructs the entire accepted usage', () => {
  for (const powers of [[], POWER_KEYS, [...POWER_KEYS].reverse(), ...POWER_KEYS.map(power => [power])]) {
    assert.deepEqual(decodePowerSignature(powerSignature(powers)), [...new Set(powers)].sort());
  }
  assert.equal(powerSignature(['power.slow', 'power.slow']), powerSignature(['power.slow']));
  assert.throws(() => powerSignature(['power.fake']));
  for (const invalid of [undefined, '', '00', 'A', '0x1', '-1', 1, [], 'f'.repeat(17), (1n << BigInt(POWER_KEYS.length)).toString(16)]) {
    assert.throws(() => decodePowerSignature(invalid));
  }
  const snapshot = powerSnapshot(buildPowerLedger([accepted('one', design(entry('tears.slow').fragment))]));
  for (const history of [undefined, {}, [], ['0'], ['00'], [powerSignature(['power.burn'])], [...snapshot.power_history, '0']]) {
    assert.throws(() => validatePowerSnapshot({ ...snapshot, power_history: history }));
  }
  const older = usageSnapshot({ 'power.slow': 1 });
  assert.throws(() => validatePowerSnapshot({ ...older, power_usage: {} }), /reconstruct usage/);
  assert.throws(() => validatePowerSnapshot({ ...older, recent_power_fingerprints: ['[]', '[]', '["power.slow"]'] }), /last-three/);
  assert.throws(() => validatePowerSnapshot({ version: 1, accepted_count: 0, power_usage: {}, recent_power_fingerprints: [] }), /restart Isaac and the bridge/);
});

test('older accepted combinations remain excluded while an unseen least-used compatible combination exists', () => {
  const request = { source: 'Generator', allowedSystems: ['laser', 'knife', 'bomb'], ownedWeapons: ['laser', 'knife'] };
  const pair = compatibleSkeletons({ quality: 2, seed: 1, request }).candidates.find(candidate =>
    candidate.mechanicIds.includes('laser.damage') && candidate.mechanicIds.includes('knife.damage'));
  assert.ok(pair);
  const records = [accepted('old-pair', pair.profile), accepted('bomb', design(entry('bomb.damage').fragment, 2)),
    ...Array.from({ length: 3 }, (_, index) => accepted(`support-${index}`, design({}, 2)))];
  const snapshot = powerSnapshot(buildPowerLedger(records));
  assert.ok(!snapshot.recent_power_fingerprints.includes(pair.fingerprint));
  const before = copy(snapshot);
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const selected = selectSkeleton({ quality: 2, seed, request, powerUsage: snapshot, validateProfile });
    assert.notEqual(selected.fingerprint, pair.fingerprint);
    assert.equal(selected.repeatedPowerFingerprint, false);
    assert.equal(selected.mechanicIds.length, 2);
    assert.ok(selected.powerKeys.includes('power.bomb_damage'));
    assert.deepEqual(selected.support, compatibleSkeletons({ quality: 2, seed, request }).support);
  }
  assert.deepEqual(snapshot, before);
});

test('combination planning prioritizes constrained families or boosted weapons without changing saturation or support', () => {
  for (const quality of [2, 3, 4]) {
    const request = { source: 'Generator' };
    const { candidates, support } = compatibleSkeletons({ quality, seed: 1, request });
    const pairs = candidates.filter(candidate => candidate.mechanicIds.length > 1);
    const families = [...new Set(pairs.flatMap(candidate => candidate.powerKeys))];
    const degree = power => new Set(pairs.filter(candidate => candidate.powerKeys.includes(power))
      .flatMap(candidate => candidate.powerKeys.filter(other => other !== power))).size;
    const selected = selectSkeleton({ quality, seed: 1, request, powerUsage: empty(), validateProfile });
    assert.ok(['power.bomb_damage','power.laser_damage','power.knife_damage'].includes(selected.primaryPower)
      || degree(selected.primaryPower) === Math.min(...families.map(degree)));
    assert.deepEqual(selected.support, support);
    assert.ok(selected.powerKeys.every(power => selected.multipliers[power] === 1));
  }
});

test('exhausted equal-use combinations admit a novel bounded secondary without resampling support', () => {
  const records=[];
  let fallbacks=0;
  for (let index=0;index<100;index+=1) {
    const seed='milestone4:2:'+index;
    const snapshot=powerSnapshot(buildPowerLedger(records));
    const request={source:'Generator'};
    const selected=selectSkeleton({quality:2,seed,powerUsage:snapshot,request,validateProfile});
    if (selected.balancedSecondaryFallback) {
      fallbacks+=1;
      assert.equal(selected.repeatedPowerFingerprint,false);
      assert.equal(selected.fallback,true);
      const primaryCount=snapshot.power_usage[selected.primaryPower];
      assert.ok(primaryCount>0);
      assert.ok(selected.powerKeys.every(power=>snapshot.power_usage[power]>=primaryCount && snapshot.power_usage[power]<=primaryCount+1));
      assert.ok(selected.powerKeys.every(power=>selected.multipliers[power]===0.1));
      assert.ok(!selected.powerKeys.includes('power.flight'));
      assert.deepEqual(selected.support,sampleSupportingChoices({quality:2,seed}));
      assert.deepEqual(selectSkeleton({quality:2,seed,powerUsage:snapshot,request}),selected);
    }
    records.push(accepted('bounded_'+index,selected.profile));
  }
  assert.ok(fallbacks>0);
});

test('one use removes a family while unused compatible powers exist; flight is a true singleton', () => {
  const snapshot = powerSnapshot(buildPowerLedger([accepted('slow', design(entry('tears.slow').fragment))]));
  assert.deepEqual(powerMultipliers(snapshot, ['power.slow', 'power.burn', 'power.flight']), { 'power.slow': 0, 'power.burn': 1, 'power.flight': 1 });
  const flown = powerSnapshot(buildPowerLedger([accepted('flight', design(entry('ability.flight').fragment))]));
  assert.equal(powerMultipliers(flown, ['power.flight', 'power.burn'])['power.flight'], 0);
  assert.equal(powerMultipliers(usageSnapshot({ 'power.flight': 1, 'power.burn': 2 }), ['power.flight', 'power.burn'])['power.flight'], 0);
  for (const source of ['Creator', 'Generator', 'Singularity']) {
    const skeleton = selectSkeleton({ quality: 1, powerUsage: snapshot, request: { prompt: 'a damp ribbon', source }, seed: 1, validateProfile });
    assert.ok(!skeleton.powerKeys.includes('power.slow'));
  }
});

test('least-used non-singleton fallback is bounded, weighted, deterministic, and preserves support choices', () => {
  const counts = Object.fromEntries(POWER_KEYS.map(power => [power, 5]));
  counts['power.slow'] = 2; counts['power.burn'] = 2; counts['power.flight'] = 1;
  const snapshot = usageSnapshot(counts);
  const multipliers = powerMultipliers(snapshot, POWER_KEYS);
  assert.equal(multipliers['power.flight'], 0);
  assert.deepEqual(Object.keys(multipliers).filter(power => multipliers[power] > 0), ['power.burn', 'power.slow']);
  for (let quality = 0; quality <= 4; quality += 1) {
    const options = { quality, powerUsage: snapshot, seed: 1, validateProfile };
    const selected = selectSkeleton(options);
    assert.equal(selected.fallback, true);
    assert.ok(selected.powerKeys.every(power => ['power.slow', 'power.burn'].includes(power)));
    assert.deepEqual(selectSkeleton(options), selected);
    assert.deepEqual(selected.support, sampleSupportingChoices({ quality, seed: 1 }));
    assert.ok(validateSkeleton(selected.profile, selected, { validateProfile }));
  }
});

test('forced recent repeats still choose only the least-used compatible non-singleton family', () => {
  const snapshot=usageSnapshot({'power.laser_damage':5,'power.knife_damage':2},['["power.knife_damage"]','["power.laser_damage"]','["power.knife_damage"]']);
  const options={quality:0,powerUsage:snapshot,seed:1,request:{source:'Generator',allowedSystems:['laser','knife'],ownedWeapons:['laser','knife']},validateProfile};
  const selected=selectSkeleton(options);
  assert.equal(selected.constrainedRepeat,true);
  assert.deepEqual(selected.powerKeys,['power.knife_damage']);
  assert.deepEqual(selected.support,sampleSupportingChoices({quality:0,seed:1}));
  assert.deepEqual(selectSkeleton(options),selected);
});

test('mechanical wishes bypass only named powers; flavor and automatic prompts do not bypass', () => {
  assert.deepEqual(explicitPowerKeys({ prompt: 'Give me slowing tears.' }), ['power.slow']);
  assert.deepEqual(explicitPowerKeys({ prompt: 'a damp ribbon' }), []);
  assert.deepEqual(explicitPowerKeys({ prompt: 'Reflect enemy projectiles' }), ['power.projectile_reflection']);
  assert.deepEqual(explicitPowerKeys({ prompt: 'a reflective mirror' }), []);
  const reflection = selectSkeleton({ quality: 1, powerUsage: empty(), seed: 0, request: { prompt: 'Reflect enemy projectiles' }, validateProfile });
  assert.deepEqual(reflection.powerKeys, ['power.projectile_reflection']);
  assert.ok(reflection.mechanicIds.every(id => id.startsWith('effect.reflect_projectiles.')));
  for (const source of ['Generator', 'Singularity']) assert.deepEqual(explicitPowerKeys({ prompt: 'slowing tears', source, explicitPowers: ['power.slow'] }), []);
  const snapshot = usageSnapshot({ 'power.slow': 3, 'power.burn': 2 }, ['["power.slow"]', '["power.slow"]', '["power.burn"]']);
  const multipliers = powerMultipliers(snapshot, ['power.slow', 'power.burn', 'power.poison'], ['power.slow']);
  assert.deepEqual(multipliers, { 'power.slow': 1, 'power.burn': 0, 'power.poison': 1 });
  const selected = selectSkeleton({ quality: 1, powerUsage: snapshot, seed: 1, request: { prompt: 'slowing tears', allowedSystems: ['tears'] }, validateProfile });
  assert.deepEqual(selected.powerKeys, ['power.slow']);
  const combination = selectSkeleton({ quality: 3, powerUsage: snapshot, seed: 1, request: { explicitPowers: ['power.slow'] }, validateProfile });
  assert.ok(combination.powerKeys.includes('power.slow'));
  assert.ok(!combination.powerKeys.includes('power.burn'));
});

test('last-three duplicates are locally resampled without changing independent stat/health choices', () => {
  const first = selectSkeleton({ quality: 1, powerUsage: empty(), seed: 1, validateProfile });
  const snapshot = usageSnapshot(Object.fromEntries(POWER_KEYS.filter(power => power !== 'power.flight').map(power => [power, 3])), [first.fingerprint, '[]', '[]']);
  const second = selectSkeleton({ quality: 1, powerUsage: snapshot, seed: 1, validateProfile });
  assert.notEqual(second.fingerprint, first.fingerprint);
  assert.equal(second.constrainedRepeat,false);
  assert.deepEqual(second.support, first.support);
  assert.throws(() => selectSkeleton({ quality: 1, powerUsage: powerSnapshot(buildPowerLedger([accepted('flight', design(entry('ability.flight').fragment))])),
    request: { allowedSystems: ['stats'], explicitPowers: ['power.flight'] }, seed: 1 }), error => error.code === 'POWER_PLAN_EXHAUSTED');
});

test('final validation verifies actual stable mechanics, rejects extra powers, and preserves supporting choices', () => {
  const skeleton = selectSkeleton({ quality: 1, powerUsage: empty(), seed: 1, request: {allowedSystems:['tears'],explicitPowers:['power.slow']}, validateProfile });
  assert.equal(validateSkeleton(skeleton.profile, skeleton, { validateProfile }), true);
  const changed = copy(skeleton.profile); changed.tear_profile.flags = ['burn'];
  assert.throws(() => validateSkeleton(changed, skeleton, { validateProfile }), /dropped skeleton|changed planned/);
  const bonus = copy(skeleton.profile); bonus.systems.push('laser'); bonus.laser = { damage: 0.5 };
  assert.throws(() => validateSkeleton(bonus, skeleton), /changed planned/);
  const altered = copy(skeleton.profile); altered.stats ??= sampleSupportingChoices({ quality: 1, seed: 1 }).stats; altered.stats.damage += 1;
  assert.throws(() => validateSkeleton(altered, skeleton), /supporting choice/);
  assert.throws(() => validateSkeleton(skeleton.profile, { ...skeleton, mechanicIds: ['invented'] }), /dropped skeleton/);
  assert.throws(() => selectSkeleton({ quality: 5, powerUsage: empty() }), /Quality/);
});

test('active Generator exhaustion retains a bounded active instead of failing or silently changing item type', async () => {
  const validator = await createLuaProfileValidator();
  try {
    for (let quality = 0; quality <= 4; quality += 1) {
      const options = { quality, powerUsage: empty(), seed: 1, request: { source: 'Generator', itemType: 'active' }, validateProfile };
      const skeleton = selectSkeleton(options);
      assert.deepEqual(skeleton.profile.systems, ['active']);
      assert.deepEqual(skeleton.powerKeys, ['power.damage_burst']);
      assert.equal(validateSkeleton(skeleton.profile, skeleton, { validateProfile }), true);
      await validator.validate(skeleton.profile);
      const snapshot = powerSnapshot(buildPowerLedger([accepted('active', skeleton.profile)]));
      const repeated=selectSkeleton({...options,powerUsage:snapshot});
      assert.equal(repeated.constrainedRepeat,true);
      assert.equal(repeated.fallback,true);
      assert.deepEqual(repeated.profile.systems,['active']);
      assert.deepEqual(repeated.support,skeleton.support);
      assert.deepEqual(repeated.powerKeys,['power.damage_burst']);
      await validator.validate(repeated.profile);
    }
  } finally { validator.close(); }
});

const encoderPath = process.env.ISAAC_JSON_LUA ?? 'C:/Program Files (x86)/Steam/steamapps/common/The Binding of Isaac Rebirth/Repentogon/resources/scripts/json.lua';
const fallbackEncoder = `local json={EMPTY_OBJECT={},EMPTY_ARRAY={}}
function json.encode(value)
  if type(value)=="string" then return '"'..value:gsub('\\\\','\\\\\\\\'):gsub('"','\\\\"')..'"' end
  if type(value)~="table" then return tostring(value) end
  local parts={}
  if value~=json.EMPTY_OBJECT and (#value>0 or next(value)==nil) then
    for _,entry in ipairs(value) do parts[#parts+1]=json.encode(entry) end
    return '['..table.concat(parts,',')..']'
  end
  for key,entry in pairs(value) do parts[#parts+1]=json.encode(key)..':'..json.encode(entry) end
  table.sort(parts); return '{'..table.concat(parts,',')..'}'
end
return json`;

async function luaLedger() {
  const engine = await new LuaFactory().createEngine();
  let encoder, actual = true;
  try { encoder = await readFile(encoderPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; encoder = fallbackEncoder; actual = false; }
  const module = await readFile(new URL('../demo/live-sprite-swap/power_ledger.lua', import.meta.url), 'utf8');
  engine.global.set('encoderSource', encoder);
  engine.global.set('powerSource', module);
  await engine.doString('powerJson=assert(load(encoderSource))(); package.loaded.json=powerJson; powerLedger=assert(load(powerSource))()');
  return { engine, actual, async evaluate(expression) {
    const value = await engine.doString(`return powerJson.encode(${expression})`);
    engine.global.pop();
    return JSON.parse(value);
  }, close() { engine.global.close(); } };
}

test('generated Lua mirror has no catalog drift and uses the actual JSON4Lua empty-object sentinel', async context => {
  assert.equal((await readFile(new URL('../demo/live-sprite-swap/power_ledger.lua', import.meta.url), 'utf8')).replaceAll('\r\n', '\n'), renderLuaPowerLedger());
  const lua = await luaLedger();
  try {
    context.diagnostic(lua.actual ? `Actual Isaac JSON4Lua: ${encoderPath}` : 'Portable faithful JSON4Lua empty-table fixture');
    assert.deepEqual(await lua.evaluate('{}'), []);
    assert.deepEqual(await lua.evaluate('powerJson.EMPTY_OBJECT'), {});
    const fresh = await lua.evaluate('powerLedger.snapshot({})');
    assert.deepEqual(fresh, empty());
    assert.equal(await lua.evaluate(`powerLedger.compact(${toLua(POWER_KEYS)})`), powerSignature(POWER_KEYS));
    assert.doesNotThrow(() => validatePowerSnapshot(fresh));
    await lua.engine.doString('assert(powerLedger.snapshot({}).power_usage==powerJson.EMPTY_OBJECT)');
  } finally { lua.close(); }
});

test('Wasmoon extraction parity covers every mapping, uncollected actors, actions, active outcomes, and source wrappers', async () => {
  const lua = await luaLedger();
  try {
    for (const mechanic of MECHANIC_CATALOG) {
      const derived = await lua.evaluate(`powerLedger.derive(${toLua(mechanic.fragment)})`);
      assert.deepEqual(derived, derivePowerKeys(mechanic.fragment), mechanic.id);
      assert.equal(await lua.evaluate(`powerLedger.compact(${toLua(derived)})`), powerSignature(derived));
    }
    const familiar = copy(entry('familiar.normal').fragment);
    familiar.familiar.attack.flags = [...plannerCapabilities.tear_flags];
    assert.deepEqual(await lua.evaluate(`powerLedger.derive(${toLua(familiar)})`), derivePowerKeys(familiar));
    const records = MECHANIC_CATALOG.map((mechanic, index) => accepted(`parity_${index}`, design(mechanic.fragment), ['Creator', 'Generator', 'Singularity'][index % 3]));
    records.push(copy(records[0]), { status: 'cancelled' }, { status: 'rejected' });
    const ledger = buildPowerLedger(records);
    const result = await lua.evaluate(`powerLedger.details(${toLua(records)})`);
    assert.deepEqual(result, ledger);
    assert.deepEqual(await lua.evaluate(`powerLedger.snapshot(${toLua(records)})`), powerSnapshot(ledger));
    const raw = records.slice(0, 5).map(record => ({ ...record.profile, bridge_request_id: record.id }));
    assert.deepEqual(await lua.evaluate(`powerLedger.snapshot(${toLua(raw)})`), powerSnapshot(buildPowerLedger(raw)));
    const duplicate = [records[0], { ...copy(records[0]), profile: design(entry('tears.burn').fragment) }];
    await assert.rejects(lua.engine.doString(`powerLedger.snapshot(${toLua(duplicate)})`), /Conflicting duplicate/);
    const tooMany = Array.from({ length: 129 }, (_, index) => accepted(String(index), design()));
    await assert.rejects(lua.engine.doString(`powerLedger.snapshot(${toLua(tooMany)})`), /capacity/);
  } finally { lua.close(); }
});

test('vaulted familiars cannot enter any generation source or explicit Creator wish', () => {
  for (let quality=0;quality<=4;quality+=1) for (const source of ['Creator','Generator','Singularity']) {
    const {candidates}=compatibleSkeletons({quality,seed:1,request:{source}});
    assert.ok(candidates.length>0);
    assert.ok(candidates.every(candidate=>!candidate.profile.familiar && !candidate.profile.systems.includes('familiar')));
  }
  assert.throws(()=>selectSkeleton({quality:3,seed:1,powerUsage:empty(),request:{prompt:'a shield familiar'}}),/temporarily vaulted/);
  assert.throws(()=>selectSkeleton({quality:3,seed:1,powerUsage:empty(),request:{explicitPowers:['power.familiar_shots']}}),/temporarily vaulted/);
  validateProfile(design(entry('familiar.normal').fragment));
});

test('owned weapon modifiers remain available without replacing explicit wishes', () => {
  for (const quality of [1,2,3,4]) {
    let weapons=0;
    const colors=new Set();
    for (let seed=0;seed<80;seed+=1) {
      const skeleton=selectSkeleton({quality,seed:'weapon-rate:'+seed,powerUsage:empty(),request:{source:'Generator',ownedWeapons:['laser','knife']},validateProfile});
      if (skeleton.mechanicIds.some(id=>/^(bomb|laser|knife)\./.test(id))) weapons+=1;
      const shot=skeleton.profile.tear_profile ?? skeleton.profile.knife ?? skeleton.profile.laser;
      if (shot?.color) colors.add(JSON.stringify(shot.color));
      assert.ok(!skeleton.profile.familiar);
    }
    assert.ok(weapons>=20 && weapons<76, 'weapon selections: '+weapons+'/80 at quality '+quality);
    assert.ok(colors.size>=4);
  }
  const skeleton=selectSkeleton({quality:1,seed:1,powerUsage:empty(),request:{prompt:'stronger knives'},validateProfile});
  assert.deepEqual(skeleton.powerKeys,['power.knife_damage']);
  assert.ok(skeleton.profile.knife.color.r!==skeleton.profile.knife.color.g);
});

test('standalone explosion immunity and weapon colors validate identically in Node and Lua', async () => {
  const validator=await createLuaProfileValidator();
  try {
    const immunity=design(entry('ability.explosion_immunity').fragment,1);
    validateProfile(immunity);await validator.validate(immunity);
    assert.equal(profileWeight(immunity,plannerCapabilities),8);
    assert.deepEqual(derivePowerKeys(immunity),['power.explosion_immunity']);
    const explosives=design(entry('tears.explosive').fragment,1);
    validateProfile(explosives);await validator.validate(explosives);
    assert.deepEqual(derivePowerKeys(explosives),['power.explosion_immunity','power.explosive']);
    assert.equal(profileWeight(explosives,plannerCapabilities),6);
    const invalid=copy(immunity);invalid.stats.explosion_immunity='yes';
    assert.throws(()=>validateProfile(invalid));await assert.rejects(validator.validate(invalid));
    for (const weapon of ['laser','knife']) {
      const profile=design(entry(weapon+'.damage').fragment,1);
      validateProfile(profile);await validator.validate(profile);
      for (const color of [{r:2,g:0,b:0,a:1},{r:1,g:0,b:0},{r:1,g:0,b:0,a:1,unknown:true}]) {
        const bad=copy(profile);bad[weapon].color=color;
        assert.throws(()=>validateProfile(bad));await assert.rejects(validator.validate(bad));
      }
    }
    const skeleton=selectSkeleton({quality:1,seed:1,powerUsage:empty(),request:{prompt:'explosion immunity'},validateProfile});
    assert.deepEqual(skeleton.powerKeys,['power.explosion_immunity']);
  } finally {validator.close();}
});

for (let quality = 0; quality <= 4; quality += 1) {
  test(`Q${quality}: deterministic batch verifies validators, tracking and quality-aware release gates`, async context => {
    const validator = await createLuaProfileValidator();
    try {
      const options = { quality, validateRuntime: validator.validate };
      const report = await runDiversityBatch(options);
      assert.equal(report.accepted + report.failures.length, 100);
      assert.equal(report.validGenerationRate, report.accepted / 100);
      assert.equal(report.runtimeValidated, report.accepted);
      assert.equal(report.accepted,100,JSON.stringify(report.failures));
      assert.equal(report.fingerprintRepeatFallbacks.length, report.accepted - Object.keys(report.fingerprints).length);
      assert.deepEqual(report.constrainedRepeatFallbacks, []);
      assert.equal(report.repairRate, 0);
      assert.equal(report.gates.allValidBothValidatorsAndWeights, report.accepted === 100);
      assert.equal(report.gates.slowUnusedFirst, true);
      assert.equal(report.gates.tearFlagAtMost20Percent, true);
      assert.equal(report.gates.supportingChoicesIndependent, true);
      assert.equal(report.gates.familyCoverageAtLeast70Percent, true);
      assert.equal(report.duplicatePolicy.rawExactDuplicatesBelow5Percent, report.exactDuplicateRate < 0.05);
      assert.equal(report.duplicatePolicy.rawExactDuplicatesBelow5Percent, quality >= 2);
      assert.equal(report.duplicatePolicy.mode, quality <= 1 ? 'capacity-adjusted' : 'absolute');
      assert.equal(report.gates.duplicatesWithinQualityPolicy, true);
      assert.equal(report.uniqueFingerprintsRequired, quality <= 1 ? Math.min(100,report.compatibleFingerprintCount)-4 : 96);
      assert.equal(report.optimisticDuplicateRateFloor, Math.max(0,(100-report.compatibleFingerprintCount)/100));
      assert.equal(report.passed, Object.values(report.gates).every(Boolean));
      assert.equal(report.passed, true);
      assert.ok(Object.values(report.supportRateDelta).every(delta => Math.abs(delta) <= 0.05));
      assert.deepEqual(await runDiversityBatch(options), report);
      const first = selectSkeleton({ quality, powerUsage: empty(), seed: 1 });
      assert.equal(first.archetype, QUALITY_ARCHETYPES[quality]);
      assert.equal(validateSkeleton(first.profile, first, { validateProfile }), true);
      context.diagnostic(JSON.stringify({ quality, accepted: report.accepted, exactDuplicateRate: report.exactDuplicateRate,
        compatibleFingerprintCount: report.compatibleFingerprintCount, optimisticDuplicateRateFloor: report.optimisticDuplicateRateFloor,
        familyCoverage: report.familyCoverage, weightUtilization: report.meanWeightUtilization, gates: report.gates }));
    } finally { validator.close(); }
  });
}

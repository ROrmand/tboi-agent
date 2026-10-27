import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LuaFactory } from 'wasmoon';
import { toLua } from '../bridge/runtime.mjs';
import { validateProfile } from '../bridge/generate.mjs';
import { compatibleSkeletons, plannerCapabilities, sampleSupportingChoices, selectSkeleton, validateSkeleton } from '../bridge/power-planner.mjs';
import { buildPowerLedger, derivePowerKeys, MAX_ACCEPTED_POWER_RECORDS, POWER_KEYS, powerCatalog, powerDistance, powerSignature, powerSnapshot, profileActions } from '../content-contract/powers.mjs';
import { profileWeight } from '../bridge/weights.mjs';
import { selectionPriors, selectionPriorMultiplier } from '../bridge/selection-priors.mjs';

export function renderLuaPowerLedger() {
  return `local json = require("json")
local catalog = ${toLua(powerCatalog)}
local M = {version=catalog.version,capacity=${MAX_ACCEPTED_POWER_RECORDS}}
local powerKeys = ${toLua(POWER_KEYS)}
local powerIndexes = {}
for index,power in ipairs(powerKeys) do powerIndexes[power]=index-1 end
local function at(value,path)
  for _,key in ipairs(path) do
    if type(value)~="table" then return nil end
    value=value[key]
  end
  return value
end
local function includes(values,value)
  for _,entry in ipairs(values or {}) do if entry==value then return true end end
  return false
end
local function add(result,values)
  for _,power in ipairs(values or {}) do result[power]=true end
end
function M.derive(profile)
  assert(type(profile)=="table","Power derivation requires a validated profile.")
  local result={}
  for _,source in ipairs(catalog.profile_sources) do
    if includes(profile.systems,source.system) then
      local value=at(profile,source.path)
      if source.present or source.equals~=nil then
        if (source.present and value~=nil) or (source.equals~=nil and source.equals==value) then add(result,source.powers) end
      elseif source.each then
        for _,entry in ipairs(value or {}) do add(result,source.values[entry]) end
      elseif value~=nil then add(result,source.values[value]) end
    end
  end
  for _,container in ipairs(catalog.action_containers) do
    if includes(profile.systems,container.system) then
      local value=at(profile,container.path)
      local entries=container.each and (value or {}) or (value and {value} or {})
      for _,entry in ipairs(entries) do
        if (not container.include_triggers or includes(container.include_triggers,entry.trigger)) and not includes(container.exclude_triggers,entry.trigger) then
          for _,action in ipairs(entry.actions or {}) do
            for _,source in ipairs(catalog.action_sources) do
              if source.type==action.type then
                add(result,source.powers or (action[source.field]~=nil and source.values[action[source.field]] or {}))
              end
            end
          end
        end
      end
    end
  end
  local keys={}
  for power in pairs(result) do keys[#keys+1]=power end
  table.sort(keys)
  return keys
end
function M.fingerprint(keys)
  local parts={}
  for _,power in ipairs(keys) do parts[#parts+1]='"'..power..'"' end
  return "["..table.concat(parts,",").."]"
end
function M.compact(keys)
  local mask=0
  for _,power in ipairs(keys) do
    local index=powerIndexes[power]
    assert(index~=nil,"Unknown semantic power.")
    mask=mask | (1 << index)
  end
  return string.format("%x",mask)
end
local function signature(value)
  if type(value)~="table" then return type(value)..":"..tostring(value) end
  local parts={}
  for key,entry in pairs(value) do parts[#parts+1]=signature(key).."="..signature(entry) end
  table.sort(parts)
  local framed={}
  for _,part in ipairs(parts) do framed[#framed+1]=#part..":"..part end
  return "{"..table.concat(framed).."}"
end
function M.details(records)
  assert(type(records)=="table","Accepted records must be an array.")
  local seen,usage,entries,recent,history={},{},{},{},{}
  for index,record in ipairs(records) do
    assert(type(record)=="table","Malformed accepted record.")
    if (record.status==nil or record.status=="accepted") and record.accepted~=false then
      local profile=record.profile or record
      local identity=record.id or profile.bridge_request_id
      assert(type(identity)=="string" and #identity>0 and #identity<=256,"Accepted record requires a stable identity.")
      assert(not record.id or not profile.bridge_request_id or record.id==profile.bridge_request_id,"Conflicting accepted identity.")
      local quality=profile.metadata and profile.metadata.quality
      assert(type(quality)=="number" and quality%1==0 and quality>=0 and quality<=4,"Accepted quality must be 0-4.")
      local source=record.source or profile.generation_source or "unknown"
      assert(includes({"Creator","Generator","Singularity","unknown"},source),"Unknown generation source.")
      local token=signature(profile)
      assert(not seen[identity] or seen[identity]==token,"Conflicting duplicate accepted identity: "..identity)
      if not seen[identity] then
        assert(#entries<M.capacity,"Accepted power ledger exceeds runtime capacity.")
        seen[identity]=token
        local powers=M.derive(profile)
        local fingerprint=M.fingerprint(powers)
        for _,power in ipairs(powers) do usage[power]=(usage[power] or 0)+1 end
        entries[#entries+1]={identity=identity,order=#entries+1,quality=quality,source=source,power_keys=powers,fingerprint=fingerprint}
        history[#history+1]=M.compact(powers)
        recent[#recent+1]=fingerprint
        if #recent>3 then table.remove(recent,1) end
      end
    end
  end
  if next(usage)==nil then usage=json.EMPTY_OBJECT end
  return {version=M.version,accepted_count=#entries,power_usage=usage,power_history=history,recent_power_fingerprints=recent,entries=entries}
end
function M.snapshot(records)
  local ledger=M.details(records)
  ledger.entries=nil
  return ledger
end
return M
`;
}

export async function createLuaProfileValidator() {
  const main = await readFile(new URL('../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
  const conditions = await readFile(new URL('../demo/live-sprite-swap/condition_metadata.lua', import.meta.url), 'utf8');
  const modules = Object.fromEntries(await Promise.all(['expanded_conditions', 'event_context', 'expanded_effects', 'effect_metadata'].map(async name => [name, await readFile(new URL('../demo/live-sprite-swap/' + name + '.lua', import.meta.url), 'utf8')])));
  const start = main.indexOf('local triggers ='), end = main.indexOf('local flagWords =');
  if (start < 0 || end <= start) throw Error('Runtime validator extraction markers changed.');
  const capacity = main.match(/^local GENERATED_ITEM_CAPACITY, GENERATED_ACTIVE_CAPACITY = \d+, \d+\r?$/m)?.[0];
  if (!capacity) throw Error('Runtime capacity declaration changed.');
  const engine = await new LuaFactory().createEngine();
  try {
    engine.global.set('conditionSource', conditions);
    engine.global.set('moduleSources', modules);
    await engine.doString(`function include(name) if name=="condition_metadata" then return assert(load(conditionSource))() end; return assert(load(assert(moduleSources[name],name)))() end
      local combat={effects={damage_burst={on_kill=true,player_hurt=true,collision=true},apply_status={tear_impact=true,collision=true,on_kill=true,enemy_hit=true},retaliate={collision=true,player_hurt=true}}}
      ${capacity}
      ${main.slice(start, end)}
      function validatePowerCandidate(profile) local valid,reason=validateProfile(profile,profile.bridge_request_id); assert(valid,reason); return true end`);
  } catch (error) { engine.global.close(); throw error; }
  return {
    async validate(profile, identity = 'batch_1') {
      const runtime = { ...structuredClone(profile), version: 1, generated_at: '2026-10-24', bridge_request_id: identity,
        sprite_sheet: 'gfx/items/collectibles/generated_slot_00.png' };
      delete runtime.region;
      if (runtime.familiar) Object.assign(runtime, { familiar_sprite_sheet: 'gfx/items/collectibles/generated_familiar_slot_00.png',
        familiar_animation: 'gfx/familiars/generated_familiar_anim_00.anm2', familiar_animation_sheet: 'gfx/familiars/generated_familiar_sheet_00.png' });
      await engine.doString(`validatePowerCandidate(${toLua(runtime)})`);
      return true;
    },
    close() { engine.global.close(); },
  };
}

function increment(map, key) { map[key] = (map[key] ?? 0) + 1; }
function supportRates(profiles) {
  const counts = { statUp: 0, statDown: 0, healthUp: 0, healthTradeoff: 0 };
  for (const profile of profiles) {
    const stats = profile.stats ?? {};
    const ordinary = Object.entries(stats).filter(([key]) => !['flying', 'soul_hearts'].includes(key));
    if (ordinary.some(([key, value]) => value > (key === 'damage_multiplier' ? 1 : 0))) counts.statUp += 1;
    if (ordinary.some(([key, value]) => value < (key === 'damage_multiplier' ? 1 : 0))) counts.statDown += 1;
    if (stats.soul_hearts > 0) counts.healthUp += 1;
    if (stats.soul_hearts < 0) counts.healthTradeoff += 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, profiles.length ? value / profiles.length : 0]));
}

export function evaluateDuplicateDiversity({ quality, requested, accepted, unique, capacity }) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 4
    || !Number.isInteger(requested) || requested < 1 || requested > MAX_ACCEPTED_POWER_RECORDS
    || !Number.isInteger(accepted) || accepted < 0 || accepted > requested
    || !Number.isInteger(unique) || unique < 0 || unique > accepted
    || !Number.isInteger(capacity) || capacity < unique
    || (accepted > 0 && unique === 0)) throw Error('Invalid duplicate benchmark counts.');
  const duplicates = accepted - unique;
  const capacityAdjusted = quality <= 1;
  const unavoidableDuplicates = capacityAdjusted ? Math.max(0, requested - capacity) : 0;
  const excessDuplicates = Math.max(0, duplicates - unavoidableDuplicates);
  return {
    version: 1, mode: capacityAdjusted ? 'capacity-adjusted' : 'absolute',
    unavoidableDuplicates, excessDuplicates,
    excessDuplicateRate: accepted ? excessDuplicates / accepted : 1,
    uniqueFingerprintsRequired: Math.max(1, requested - unavoidableDuplicates - Math.ceil(requested / 20) + 1),
    rawExactDuplicatesBelow5Percent: accepted > 0 && duplicates * 20 < accepted,
    passed: accepted === requested && excessDuplicates * 20 < requested,
  };
}

export async function runDiversityBatch({ quality, count = 100, seed = 'milestone4', validateRuntime } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ACCEPTED_POWER_RECORDS) throw Error('Batch count must be 1-128.');
  const records = [], profiles = [], baseline = [], failures = [], fingerprints = {}, flags = {}, families = {};
  const distributions = { region: {}, system: {}, trigger: {}, condition: {}, action: {}, primary_power: {} };
  const distances = [], multipliers = [], availableFamilies = new Set();
  const availableFingerprints = new Set();
  const constrainedRepeatFallbacks=[];
  const fingerprintRepeatFallbacks=[];
  const balancedSecondaryFallbacks=[];
  const constrainedArchetypes=[];
  let repairs = 0, slowViolations = 0, supportViolations = 0, runtimeValid = 0, totalWeight = 0;
  for (let index = 0; index < count; index += 1) {
    const itemSeed = `${seed}:${quality}:${index}`;
    const empty = powerSnapshot(buildPowerLedger([]));
    const base = selectSkeleton({ quality, powerUsage: empty, seed: itemSeed, request: { source: 'Generator' } });
    baseline.push(base.profile);
    const { candidates } = compatibleSkeletons({ quality, seed: itemSeed });
    candidates.flatMap(candidate => candidate.powerKeys).forEach(power => availableFamilies.add(power));
    candidates.forEach(candidate => availableFingerprints.add(candidate.fingerprint));
    const snapshot = powerSnapshot(buildPowerLedger(records));
    let skeleton;
    try {
      skeleton = selectSkeleton({ quality, powerUsage: snapshot, seed: itemSeed, request: { source: 'Generator' } });
      validateProfile(skeleton.profile);
      validateSkeleton(skeleton.profile, skeleton);
      if (validateRuntime) { await validateRuntime(skeleton.profile, `batch_${quality}_${index}`); runtimeValid += 1; }
    } catch (error) { failures.push({ index, error: error.message }); continue; }
    if (skeleton.constrainedRepeat) constrainedRepeatFallbacks.push({index,fingerprint:skeleton.fingerprint,powerKeys:skeleton.powerKeys});
    if (skeleton.repeatedPowerFingerprint) fingerprintRepeatFallbacks.push({index,fingerprint:skeleton.fingerprint,powerKeys:skeleton.powerKeys});
    if (skeleton.balancedSecondaryFallback) balancedSecondaryFallbacks.push({index,primaryPower:skeleton.primaryPower,powerCounts:Object.fromEntries(skeleton.powerKeys.map(power=>[power,snapshot.power_usage[power]]))});
    if (skeleton.archetypeConstrained) constrainedArchetypes.push({index,mechanicIds:skeleton.mechanicIds,powerKeys:skeleton.powerKeys});
    if (JSON.stringify(skeleton.support) !== JSON.stringify(sampleSupportingChoices({ quality, seed: itemSeed }))) supportViolations += 1;
    if (snapshot.power_usage['power.slow'] && skeleton.powerKeys.includes('power.slow')
      && Object.entries(skeleton.multipliers).some(([power, multiplier]) => power !== 'power.slow' && multiplier === 1 && !snapshot.power_usage[power])) slowViolations += 1;
    profiles.push(skeleton.profile);
    records.push({ id: `batch_${quality}_${index}`, source: 'Generator', profile: skeleton.profile });
    increment(fingerprints, skeleton.fingerprint);
    if (profiles.length > 1) distances.push(powerDistance(profiles.at(-2), skeleton.profile));
    for (const power of skeleton.powerKeys) increment(families, power);
    const itemFlags = new Set([...(skeleton.profile.tear_profile?.flags ?? []), ...(skeleton.profile.familiar?.attack?.flags ?? []), ...(skeleton.profile.bomb?.flags ?? [])]);
    itemFlags.forEach(flag => increment(flags, flag));
    increment(distributions.region, skeleton.profile.region);
    increment(distributions.primary_power, skeleton.primaryPower);
    skeleton.profile.systems.forEach(system => increment(distributions.system, system));
    for (const container of [...skeleton.profile.rules, ...['on_kill', 'tear_impact', 'collision'].filter(system => skeleton.profile[system]).map(system => ({ trigger: system, ...skeleton.profile[system] }))]) {
      increment(distributions.trigger, container.trigger);
      container.conditions.forEach(condition => increment(distributions.condition, condition.type));
    }
    profileActions(skeleton.profile).forEach(action => increment(distributions.action, action.type));
    multipliers.push(skeleton.multipliers);
    totalWeight += profileWeight(skeleton.profile, plannerCapabilities);
  }
  const accepted = profiles.length;
  const duplicateRate = accepted ? (accepted - Object.keys(fingerprints).length) / accepted : 1;
  const duplicatePolicy = evaluateDuplicateDiversity({ quality, requested: count, accepted,
    unique: Object.keys(fingerprints).length, capacity: availableFingerprints.size });
  const coverage = Object.keys(families).length / POWER_KEYS.length;
  const support = supportRates(profiles), baselineSupport = supportRates(baseline);
  const supportDelta = Object.fromEntries(Object.keys(support).map(key => [key, support[key] - baselineSupport[key]]));
  const gates = {
    tearFlagAtMost20Percent: Object.values(flags).every(value => value / count <= 0.2),
    slowUnusedFirst: slowViolations === 0,
    supportingChoicesIndependent: supportViolations === 0 && Object.values(supportDelta).every(value => Math.abs(value) <= 0.05),
    familyCoverageAtLeast70Percent: coverage >= 0.7,
    duplicatesWithinQualityPolicy: duplicatePolicy.passed,
    allValidBothValidatorsAndWeights: accepted === count && runtimeValid === count,
  };
  return { quality, seed, requested: count, accepted, validGenerationRate: accepted / count, repairRate: repairs / count,
    selectionPrior: { version: selectionPriors.version, evidenceKind: selectionPriors.evidenceKind, source: selectionPriors.source, policy: selectionPriors.policy,
      factors: Object.fromEntries(Object.keys(selectionPriors.families).map(power => [power, selectionPriorMultiplier(power, quality)])) },
    runtimeValidatorChecked: Boolean(validateRuntime), runtimeValidated: runtimeValid, distributions, tearFlags: flags, powerFamilies: families, powerMultipliers: multipliers,
    mostCommonFingerprint: Object.entries(fingerprints).sort(([left, countLeft], [right, countRight]) => countRight - countLeft || left.localeCompare(right))[0] ?? null,
    fingerprints, exactDuplicateRate: duplicateRate, duplicatePolicy, consecutivePowerDistances: distances,
    meanConsecutivePowerDistance: distances.length ? distances.reduce((sum, distance) => sum + distance, 0) / distances.length : 0,
    supportedFamilyCount: POWER_KEYS.length, compatibleFamilyCount: availableFamilies.size, familyCoverage: coverage,
    compatibleFingerprintCount: availableFingerprints.size,
    optimisticDuplicateRateFloor: Math.max(0, (count - availableFingerprints.size) / count),
    uniqueFingerprintsRequired: duplicatePolicy.uniqueFingerprintsRequired,
    compatibleFamilyCoverage: availableFamilies.size ? Object.keys(families).length / availableFamilies.size : 0,
    supportRates: support, baselineSupportRates: baselineSupport, supportRateDelta: supportDelta,
    meanWeightUtilization: accepted ? totalWeight / accepted / plannerCapabilities.quality_budgets[quality] : 0,
    finalSnapshot: powerSnapshot(buildPowerLedger(records)), failures, constrainedRepeatFallbacks, fingerprintRepeatFallbacks, balancedSecondaryFallbacks, constrainedArchetypes,
    gates, passed: Object.values(gates).every(Boolean) };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--generate-lua')) {
    await writeFile(new URL('../demo/live-sprite-swap/power_ledger.lua', import.meta.url), renderLuaPowerLedger());
    console.log('Generated semantic Lua power ledger from the shared catalog.');
    return;
  }
  if (args.includes('--check-lua')) {
    const actual = await readFile(new URL('../demo/live-sprite-swap/power_ledger.lua', import.meta.url), 'utf8');
    if (actual.replaceAll('\r\n', '\n') !== renderLuaPowerLedger()) throw Error('power_ledger.lua differs from the shared catalog renderer.');
    console.log('Semantic Lua power ledger matches catalog.');
    return;
  }
  const seed = args.find(value => value.startsWith('--seed='))?.slice(7) ?? 'milestone4';
  const validator = await createLuaProfileValidator();
  try {
    const reports = [];
    for (let quality = 0; quality <= 4; quality += 1) reports.push(await runDiversityBatch({ quality, seed, validateRuntime: validator.validate }));
    const report = { version: 2, batchKind: 'local-supported-skeletons-not-model-generation', reports, passed: reports.every(entry => entry.passed) };
    const output = args.find(value => value.startsWith('--output='))?.slice(9);
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (args.includes('--enforce-gates') && !report.passed) process.exitCode = 1;
  } finally { validator.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

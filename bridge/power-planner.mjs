import { readFileSync } from 'node:fs';
import { derivePowerKeys, powerCatalog, powerFingerprint, powerMultipliers, powerSignature, validatePowerSnapshot } from '../content-contract/powers.mjs';
import { profileWeight } from './weights.mjs';
import { expandedEffects } from './expanded-effects.mjs';
import { repairProfile } from './prompt-features.mjs';
import { selectionPriors, selectionPriorMultiplier, secondarySelectionPrior } from './selection-priors.mjs';

export const plannerCapabilities = JSON.parse(readFileSync(new URL('../content-contract/capabilities.json', import.meta.url), 'utf8'));
export const QUALITY_ARCHETYPES = Object.freeze([
  'small_primitive_or_tradeoff', 'clear_mechanic', 'primary_plus_secondary',
  'triggered_or_actor_combination', 'build_defining_combination',
]);
export const SUPPORT_RATES = Object.freeze([
  { statUp: 0.5, statDown: 0.45, healthUp: 0.3, healthTradeoff: 0 },
  { statUp: 0.55, statDown: 0.3, healthUp: 0.35, healthTradeoff: 0 },
  { statUp: 0.6, statDown: 0.2, healthUp: 0.4, healthTradeoff: 0 },
  { statUp: 0.65, statDown: 0.15, healthUp: 0.45, healthTradeoff: 0 },
  { statUp: 0.7, statDown: 0.1, healthUp: 0.5, healthTradeoff: 0 },
]);
const color = { r: 0.7, g: 0.8, b: 1, a: 1 };
export const VAULTED_SYSTEMS = Object.freeze(['familiar']);
export const WEAPON_SELECTION_MULTIPLIER = 4;
const weaponPowers = new Set(['power.bomb_damage', 'power.laser_damage', 'power.knife_damage']);
const shotPalette = Object.freeze([
  {r:1,g:0.25,b:0.3,a:1}, {r:1,g:0.7,b:0.2,a:1}, {r:0.3,g:1,b:0.45,a:1},
  {r:0.25,g:1,b:0.85,a:1}, {r:0.3,g:0.5,b:1,a:1}, {r:0.85,g:0.35,b:1,a:1},
]);
const emptyStats = () => ({ damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0 });
const clone = value => structuredClone(value);
function immutable(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
const candidateCache = new Map();

export function seededRandom(seed) {
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed))) throw Error('Seed must be a finite number or string.');
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ state >>> 15, state | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function assertQuality(quality) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 4) throw Error('Quality must be 0-4.');
}

export function sampleSupportingChoices({ quality, seed, itemType }) {
  assertQuality(quality);
  if (itemType === 'active') return { choices: { statUp: false, statDown: false, healthUp: false, healthTradeoff: false }, stats: emptyStats() };
  const random = seededRandom(`support:${quality}:${seed}`), rates = SUPPORT_RATES[quality];
  const health = random();
  const choices = { statUp: random() < rates.statUp, statDown: random() < rates.statDown,
    healthUp: health < rates.healthUp, healthTradeoff: health >= rates.healthUp && health < rates.healthUp + rates.healthTradeoff };
  const stats = emptyStats();
  if (choices.statUp) stats.damage = 1;
  if (choices.statDown) stats.range = -5;
  if (choices.healthUp) stats.soul_hearts = 1;
  return { choices, stats };
}

function procFragment(system, action, trigger) {
  const repeatable = ['apply_status', 'spawn_creep', 'spawn_friendly'].includes(action.type);
  const proc = repeatable
    ? { cooldown: 0, conditions: [{ type: 'luck_chance', chance: action.type === 'spawn_friendly' ? 0.1 : 0.2, luck_scale: 0.02 }], actions: [action] }
    : { cooldown: 30, conditions: [{ type: 'luck_chance', chance: 0.2, luck_scale: 0.02 }], actions: [action] };
  if (system === 'rules' || system === 'on_hit') return { systems: [system], rules: [{ trigger, ...proc }] };
  return { systems: [system], [system]: proc };
}

function mechanic(id, fragment, weight = 1) {
  return { id, fragment, weight, powers: derivePowerKeys(fragment), contextual: fragment.systems.some(system =>
    ['rules', 'on_hit', 'on_kill', 'tear_impact', 'collision', 'familiar', 'aura', 'active'].includes(system)) };
}

function buildCatalog() {
  const entries = [];
  for (const flag of plannerCapabilities.tear_flags) entries.push(mechanic(`tears.${flag}`,
    { systems: ['tears'], tear_profile: { flags: [flag], color, scale: 1 } }));
  for (const behavior of plannerCapabilities.tear_update_behaviors) entries.push(mechanic(`tear_update.${behavior}`,
    { systems: ['tear_update'], tear_update: { behavior, strength: 0.5 } }));
  entries.push(mechanic('ability.flight', { systems: ['stats'], stats: { ...emptyStats(), flying: true } }, 0.5));
  entries.push(mechanic('ability.explosion_immunity', { systems: ['stats'], stats: { ...emptyStats(), explosion_immunity: true } }));
  for (const type of plannerCapabilities.auras) entries.push(mechanic(`aura.${type}`, { systems: ['aura'], aura: {
    type, radius: 50, cooldown: 60, ...(type === 'damage' ? {} : { duration: 30 }),
    ...(['damage', 'burn', 'poison'].includes(type) ? { damage: 0.25 } : {}),
  } }));
  for (const type of plannerCapabilities.familiars) entries.push(mechanic(`familiar.${type}`, { systems: ['familiar'], familiar: {
    type, damage: 0.5, cooldown: 60, range: 120, sprite_prompt: 'A tiny full-body guardian character.',
    ...(['sentry', 'normal'].includes(type) ? { attack: { pattern: 'single', flags: [], color, scale: 1, speed: 6 } } : {}),
  } }));
  for (const flag of plannerCapabilities.bomb_flags) entries.push(mechanic(`bomb.${flag}`,
    { systems: ['bomb'], bomb: { damage: 0.5, radius: 40, flags: [flag] } }));
  entries.push(mechanic('bomb.damage', { systems: ['bomb'], bomb: { damage: 0.5, radius: 40, flags: [] } }));
  for (const weapon of ['laser', 'knife']) entries.push(mechanic(`${weapon}.damage`, { systems: [weapon], [weapon]: {
    damage: 0.5, color: weapon === 'knife' ? { r: 0.85, g: 0.35, b: 1, a: 1 } : { r: 0.25, g: 1, b: 0.65, a: 1 },
  } }));
  for (const status of plannerCapabilities.combat_effects.apply_status.statuses) {
    for (const system of ['tear_impact', 'collision', 'on_hit']) entries.push(mechanic(`${system}.status.${status}`,
      procFragment(system, { type: 'apply_status', status, amount: 1, duration: 60 }, 'enemy_hit')));
  }
  for (const creep of plannerCapabilities.creeps) entries.push(mechanic(`rules.creep.${creep}`,
    procFragment('rules', { type: 'spawn_creep', creep, amount: 1, radius: 20, duration: 120 }, 'tear_fire')));
  for (const friendly of plannerCapabilities.friendlies) entries.push(mechanic(`rules.summon.${friendly}`,
    procFragment('rules', { type: 'spawn_friendly', friendly_type: friendly, amount: 1 }, 'tear_fire')));
  entries.push(mechanic('on_kill.damage_burst', procFragment('on_kill', { type: 'damage_burst', amount: 1, radius: 40 })));
  entries.push(mechanic('collision.retaliate', procFragment('collision', { type: 'retaliate', amount: 1 })));
  entries.push(mechanic('on_hit.retaliate', procFragment('on_hit', { type: 'retaliate', amount: 1 }, 'player_hurt')));
  for (const [type, spec] of Object.entries(expandedEffects.actions)) {
    if (type === 'coins_to_charge') continue;
    const minimal = Object.fromEntries(Object.entries(spec.params).map(([name, param]) => [name, param.enum?.[0] ?? param.min]));
    for (const trigger of spec.triggers) {
      const system = ['enemy_hit', 'player_hurt'].includes(trigger) ? 'on_hit' : ['tear_impact', 'collision'].includes(trigger) ? trigger : 'rules';
      for (const direction of type === 'target_impulse' ? ['push', 'pull'] : [null]) {
        const action = { type, ...minimal, ...(direction ? { direction } : {}) };
        entries.push(mechanic(`effect.${type}.${trigger}${direction ? '.' + direction : ''}`, procFragment(system, action, trigger)));
      }
    }
  }
  entries.push(mechanic('active.radial_burst', { systems: ['active'], active: {
    effect: 'radial_burst', charges: 6, targeting: 'self', damage: 1, radius: 40,
  } }));
  return entries;
}

export const MECHANIC_CATALOG = immutable(buildCatalog());
const mechanicsById = new Map(MECHANIC_CATALOG.map(entry => [entry.id, entry]));

export function explicitPowerKeys(request = {}) {
  if (typeof request === 'string') request = { prompt: request };
  const source = request.source ?? 'Creator';
  if (!['Creator', 'Generator', 'Singularity'].includes(source)) throw Error('Unknown request source.');
  if (source !== 'Creator') return [];
  if (request.explicitPowers !== undefined) {
    if (!Array.isArray(request.explicitPowers)) throw Error('explicitPowers must be a trusted caller-supplied array.');
    powerFingerprint(request.explicitPowers);
    return [...new Set(request.explicitPowers)].sort();
  }
  const prompt = String(request.prompt ?? '').toLowerCase();
  const powers = [];
  if (/\b(?:knife|knives)\b/.test(prompt) && /\b(?:stronger|damage|boost)\b/.test(prompt)) powers.push('power.knife_damage');
  if (/\blasers?\b/.test(prompt) && /\b(?:stronger|damage|boost)\b/.test(prompt)) powers.push('power.laser_damage');
  if (/\b(?:explosion|explosive|blast) (?:immunity|protection)\b|\bimmune to explosions\b/.test(prompt)) powers.push('power.explosion_immunity');
  const wished=baseProfile(0);
  repairProfile(wished,prompt);
  powers.push(...derivePowerKeys(wished));
  for (const flag of plannerCapabilities.tear_flags) {
    const word = flag === 'slow' ? '(?:slow|slowing)' : flag.replaceAll('_', '[ _]');
    if (new RegExp(`\\b${word}\\s+(?:tears|shots|aura|bombs)\\b`).test(prompt)) {
      powers.push(...powerCatalog.profile_sources.find(entry => entry.system === 'tears').values[flag]);
    }
  }
  if (/\b(?:grant|give|gain)\b.{0,20}\bflight\b|\blet me fly\b/.test(prompt)) powers.push('power.flight');
  if (/\bfamiliar(?: friend| that shoots)?\b|\bshooting companion\b/.test(prompt)) powers.push('power.familiar_shots');
  if (/\bdamage aura\b/.test(prompt)) powers.push('power.damage_aura');
  if (/\bdash\b/.test(prompt)) powers.push('power.dash');
  if (/\bexecut(?:e|es|ing|ion)\b/.test(prompt)) powers.push('power.execution');
  if (/\breflect(?:s|ed|ing)?\s+(?:enemy\s+)?(?:shots?|projectiles?|bullets?)\b/.test(prompt)) powers.push('power.projectile_reflection');
  if (/\b(?:pull|pulls|pulling)\b.{0,20}\benem/.test(prompt)) powers.push('power.pull');
  if (/\b(?:block|blocks|blocking)\b.{0,20}\bprojectiles?\b/.test(prompt)) powers.push('power.projectile_blocking');
  if (/\bextra tears\b/.test(prompt)) powers.push('power.extra_tears');
  return [...new Set(powers)].sort();
}

function namedDeliveryMatches(profile, request) {
  if ((request.source ?? 'Creator') !== 'Creator') return true;
  const prompt = String(request.prompt ?? '').toLowerCase();
  const wished=baseProfile(profile.metadata.quality);
  repairProfile(wished,prompt);
  if (wished.systems.length && !containsMechanic(profile,{id:'wish',fragment:wished})) return false;
  for (const flag of plannerCapabilities.tear_flags) {
    const word = flag === 'slow' ? '(?:slow|slowing)' : flag.replaceAll('_', '[ _]');
    if (new RegExp(`\\b${word}\\s+tears\\b`).test(prompt) && !profile.tear_profile?.flags.includes(flag)) return false;
    if (new RegExp(`\\b${word}\\s+aura\\b`).test(prompt) && profile.aura?.type !== flag) return false;
  }
  if (/\bfamiliar(?: friend| that shoots)?\b|\bshooting companion\b/.test(prompt) && !profile.familiar?.attack) return false;
  if (/\bdamage aura\b/.test(prompt) && profile.aura?.type !== 'damage') return false;
  return true;
}

function statOnlyWish(request, quality) {
  if ((request.source ?? 'Creator') !== 'Creator' || request.itemType === 'active') return null;
  const prompt = String(request.prompt ?? '');
  if (/\b(?:familiar|companion|aura|tears?|shots?|enemies|enemy|when|room|flight|fly|dash|charge|coin|bomb|key|immunity|protection|immune)\b/i.test(prompt.replace(/shot speed|(?:add|raise|lower|increase|decrease) tears|tears (?:up|down)/gi, ''))) return null;
  const profile = baseProfile(quality);
  repairProfile(profile, prompt.replace(/\bone luck stat\b/i, 'Add luck'));
  if (!profile.stats || profile.systems.some(system => system !== 'stats')) return null;
  profile.affects_stats=true;
  return profile;
}

function baseProfile(quality) {
  return { region: 'passive', systems: [], affects_stats: false,
    metadata: { display_name: 'Catalog Candidate', description: 'A bounded catalog combination.', quality, theme: 'none', balance_note: '' },
    visuals: { pedestal_prompt: 'One small strange artifact.', sound: 'none', animation: 'none' }, rules: [] };
}

function mergeFragment(profile, fragment) {
  for (const system of fragment.systems) if (!profile.systems.includes(system)) profile.systems.push(system);
  for (const [field, value] of Object.entries(fragment)) {
    if (field === 'systems') continue;
    if (field === 'rules') { profile.rules.push(...clone(value)); continue; }
    if (field === 'tear_profile' && profile.tear_profile) {
      profile.tear_profile.flags = [...new Set([...profile.tear_profile.flags, ...value.flags])];
    } else if (field === 'stats') {
      profile.stats = { ...profile.stats, ...clone(value) };
    } else if (profile[field] !== undefined) return false;
    else profile[field] = clone(value);
  }
  return true;
}

function strengthen(profile) {
  if (profile.tear_update) profile.tear_update.strength = 2;
  for (const weapon of ['bomb', 'laser', 'knife']) if (profile[weapon]) profile[weapon].damage = 3;
  if (profile.bomb) profile.bomb.radius = 120;
  if (profile.familiar) { profile.familiar.damage = 3; profile.familiar.cooldown = 30; profile.familiar.range = 240; }
  if (profile.aura) {
    profile.aura.radius = 120; profile.aura.cooldown = 30;
    if (profile.aura.duration) profile.aura.duration = 120;
    if (profile.aura.damage) profile.aura.damage = 2;
  }
  if (profile.active) { profile.active.damage = 6; profile.active.radius = 120; }
  for (const container of [...profile.rules, ...['on_kill', 'tear_impact', 'collision'].map(system => profile[system]).filter(Boolean)]) {
    for (const action of container.actions) {
      if (action.type === 'apply_status') { action.duration = 120; action.amount = 2; }
      if (action.type === 'spawn_creep') { action.duration = 180; action.radius = 80; }
      if (['damage_burst', 'retaliate'].includes(action.type)) action.amount = 3;
    }
  }
}

function assemble(quality, entries, support) {
  const profile = baseProfile(quality);
  for (const entry of entries) if (!mergeFragment(profile, entry.fragment)) return null;
  const hasSupport = Object.values(support.stats).some(value => value !== 0);
  if (profile.active) {
    if (entries.length > 1 || hasSupport) return null;
  } else if (hasSupport || profile.stats) {
    profile.stats = { ...support.stats, ...(profile.stats?.flying ? { flying: true } : {}),
      ...(profile.stats?.explosion_immunity ? { explosion_immunity: true } : {}) };
    if (!profile.systems.includes('stats')) profile.systems.push('stats');
  }
  profile.affects_stats = profile.systems.includes('stats');
  const familiar = profile.systems.includes('familiar'), aura = profile.systems.includes('aura');
  profile.region = familiar ? aura ? 'familiar_aura' : 'familiar' : aura ? 'aura' : 'passive';
  if (quality === 4) strengthen(profile);
  if (!profileFits(profile, quality)) return null;
  return profile;
}

function profileFits(profile, quality) {
  const flagCount = (profile.tear_profile?.flags.length ?? 0) + (profile.familiar?.attack?.flags.length ?? 0) + (profile.bomb?.flags?.length ?? 0);
  return profile.systems.length <= plannerCapabilities.item_limits.max_systems
    && (profile.stats?.soul_hearts ?? 0) >= 0
    && flagCount <= plannerCapabilities.item_limits.max_total_flags && profile.rules.length <= 2
    && profileWeight(profile, plannerCapabilities) <= plannerCapabilities.quality_budgets[quality];
}

export function compatibleSkeletons({ quality, seed = 0, request = {} } = {}) {
  assertQuality(quality);
  if (typeof request === 'string') request = { prompt: request };
  const support = sampleSupportingChoices({ quality, seed, itemType: request.itemType });
  if ((request.source ?? 'Creator') === 'Creator' && request.itemType !== 'active') {
    const wished=baseProfile(quality);
    repairProfile(wished,String(request.prompt ?? ''));
    if (wished.stats) support.stats=clone(wished.stats);
  }
  if (request.itemType !== undefined && !['active', 'passive'].includes(request.itemType)) throw Error('Unknown item type.');
  if (request.allowedSystems !== undefined && (!Array.isArray(request.allowedSystems)
    || request.allowedSystems.some(system => !plannerCapabilities.systems.includes(system)))) throw Error('Unknown allowed system.');
  if (request.ownedWeapons !== undefined && (!Array.isArray(request.ownedWeapons)
    || request.ownedWeapons.some(weapon => !['laser', 'knife'].includes(weapon)))) throw Error('Unknown owned weapon.');
  const explicit = explicitPowerKeys(request);
  const usableWeapons = ['laser', 'knife'].filter(weapon => request.ownedWeapons?.includes(weapon) || explicit.includes(`power.${weapon}_damage`));
  const cacheKey = JSON.stringify([quality, support.stats, request.itemType ?? 'passive', request.allowedSystems ? [...request.allowedSystems].sort() : null, usableWeapons]);
  if (candidateCache.has(cacheKey)) return { support, candidates: candidateCache.get(cacheKey) };
  const catalog = MECHANIC_CATALOG.filter(entry => !entry.fragment.systems.some(system => VAULTED_SYSTEMS.includes(system))
    && entry.fragment.systems.every(system => !['laser', 'knife'].includes(system) || usableWeapons.includes(system))
    && (!request.allowedSystems || entry.fragment.systems.every(system => request.allowedSystems.includes(system)))
    && (request.itemType === 'active' ? entry.fragment.active : !entry.fragment.active));
  const candidates = [];
  const add = entries => {
    const profile = assemble(quality, entries, support);
    if (!profile) return;
    const powers = derivePowerKeys(profile);
    candidates.push({ mechanicIds: entries.map(entry => entry.id), profile, powerKeys: powers,
      fingerprint: powerFingerprint(powers), weight: entries.reduce((weight, entry) => weight * entry.weight, 1) });
  };
  if (quality <= 1 || request.itemType === 'active') catalog.forEach(entry => add([entry]));
  else {
    for (let first = 0; first < catalog.length; first += 1) {
      for (let second = first + 1; second < catalog.length; second += 1) {
        const pair = [catalog[first], catalog[second]];
        if (quality >= 3 && !pair.some(entry => entry.contextual)) continue;
        if (pair[0].powers.every(power => pair[1].powers.includes(power)) || pair[1].powers.every(power => pair[0].powers.includes(power))) continue;
        add(pair);
      }
    }
    catalog.forEach(entry => add([entry]));
  }
  candidateCache.set(cacheKey, immutable(candidates));
  return { support, candidates: candidateCache.get(cacheKey) };
}

function weightedPick(values, random, weight) {
  let remaining = random() * values.reduce((sum, value) => sum + weight(value), 0);
  for (const value of values) { remaining -= weight(value); if (remaining < 0) return value; }
  return values.at(-1);
}

function eligiblePowerPool(candidates, snapshot, explicit) {
  const unused=candidates.filter(candidate=>candidate.powerKeys.every(power=>!snapshot.power_usage[power]||explicit.includes(power)));
  const balanced=candidates.filter(candidate=>{
    const counts=candidate.powerKeys.filter(power=>!explicit.includes(power)).map(power=>snapshot.power_usage[power]??0);
    return !counts.length||Math.min(...counts)===Math.max(...counts);
  });
  const viable=unused.length?candidates:balanced;
  const powers=[...new Set(viable.flatMap(candidate=>candidate.powerKeys))].sort();
  const multipliers=powerMultipliers(snapshot,powers,explicit);
  return {multipliers,eligible:viable.filter(candidate=>candidate.powerKeys.every(power=>multipliers[power]>0))};
}

export function selectSkeleton({ quality, powerUsage, request = {}, seed = 0, validateProfile } = {}) {
  if (typeof request==='string') request={prompt:request};
  const snapshot = validatePowerSnapshot(powerUsage);
  assertQuality(quality);
  const explicit = explicitPowerKeys(request);
  if (explicit.includes('power.familiar_shots') || (request.source ?? 'Creator') === 'Creator' && /\b(?:familiar|companion)\b/i.test(String(request.prompt ?? ''))
    || request.allowedSystems?.length === 1 && VAULTED_SYSTEMS.includes(request.allowedSystems[0])) {
    throw Error('Familiars are temporarily vaulted while their runtime is repaired. Choose a non-familiar effect.');
  }
  if (request.itemType!==undefined && !['active','passive'].includes(request.itemType)) throw Error('Unknown item type.');
  if (request.allowedSystems!==undefined && (!Array.isArray(request.allowedSystems) || request.allowedSystems.some(system=>!plannerCapabilities.systems.includes(system)))) throw Error('Unknown allowed system.');
  const wishedStats = statOnlyWish(request, quality);
  if (wishedStats) {
    if (request.allowedSystems && !request.allowedSystems.includes('stats')) throw Error('Explicit stat wish conflicts with allowed systems.');
    if (!profileFits(wishedStats, quality)) throw Error('Explicit stat wish exceeds the requested quality budget.');
    validateProfile?.(wishedStats);
    const fragment=clone(wishedStats);
    delete fragment.metadata;delete fragment.visuals;
    return {version:1,mode:'explicit_stats',quality,archetype:'explicit_stat_wish',mechanicIds:Object.entries(wishedStats.stats).filter(([,value])=>value!==0).map(([stat])=>'stats.'+stat),
      primaryPower:null,powerKeys:[],fingerprint:powerFingerprint([]),fragment,profile:clone(wishedStats),support:{stats:clone(wishedStats.stats)},multipliers:{},fallback:false,explicitPowers:[]};
  }
  const { candidates, support } = compatibleSkeletons({ quality, seed, request });
  const recent = new Set(snapshot.recent_power_fingerprints);
  let matching = candidates.filter(candidate => explicit.every(power => candidate.powerKeys.includes(power)) && namedDeliveryMatches(candidate.profile,request)
    && candidate.powerKeys.every(power=>!powerCatalog.singletons.includes(power)||!snapshot.power_usage[power]));
  if (explicit.length && request.prompt && !request.explicitPowers) {
    const exact=matching.filter(candidate => candidate.powerKeys.length===explicit.length);
    if (exact.length) matching=exact;
  }
  const nonrecent=matching.filter(candidate=>!recent.has(candidate.fingerprint)||candidate.powerKeys.every(power=>explicit.includes(power)));
  let {eligible,multipliers}=eligiblePowerPool(nonrecent,snapshot,explicit);
  let constrainedRepeat=false;
  if (!eligible.length && !nonrecent.length && matching.length) {
    const exhausted=matching.filter(candidate=>candidate.powerKeys.every(power=>snapshot.power_usage[power]>0||explicit.includes(power)));
    ({eligible,multipliers}=eligiblePowerPool(exhausted,snapshot,explicit));
    constrainedRepeat=eligible.length>0;
  }
  if (!eligible.length) {
    const error = Error('No nonduplicate compatible power skeleton; explicit wish, recent history, or singleton saturation blocks this catalog.');
    error.code = 'POWER_PLAN_EXHAUSTED';
    throw error;
  }
  const usedFingerprints = new Set(snapshot.power_history);
  const unseen = eligible.filter(candidate => !usedFingerprints.has(powerSignature(candidate.powerKeys)));
  if (unseen.length) eligible = unseen;
  let balancedSecondaryFallback = false;
  if (!unseen.length && quality >= 2 && !explicit.length) {
    const availablePowers = [...new Set(nonrecent.flatMap(candidate => candidate.powerKeys))];
    const minimum = Math.min(...eligible.flatMap(candidate => candidate.powerKeys).map(power => snapshot.power_usage[power] ?? 0));
    if (minimum > 0 && availablePowers.every(power => snapshot.power_usage[power] > 0)) {
      const novel = nonrecent.filter(candidate => !usedFingerprints.has(powerSignature(candidate.powerKeys))
        && candidate.powerKeys.some(power => snapshot.power_usage[power] === minimum)
        && candidate.powerKeys.every(power => snapshot.power_usage[power] >= minimum && snapshot.power_usage[power] <= minimum + 1));
      if (novel.length) {
        eligible = novel;
        multipliers = Object.fromEntries(availablePowers.map(power => [power, novel.some(candidate => candidate.powerKeys.includes(power)) ? 0.1 : 0]));
        balancedSecondaryFallback = true;
      }
    }
  }
  if (quality >= 2 && eligible.some(candidate => candidate.mechanicIds.length > 1)) eligible = eligible.filter(candidate => candidate.mechanicIds.length > 1);
  const random = seededRandom(`power:${quality}:${seed}`);
  let families = [...new Set(eligible.flatMap(candidate => candidate.powerKeys))].sort();
  if (balancedSecondaryFallback) {
    const minimum = Math.min(...families.map(power => snapshot.power_usage[power]));
    families = families.filter(power => snapshot.power_usage[power] === minimum);
  }
  if (quality >= 2 && !explicit.length) {
    const degrees = new Map(families.map(power => [power, new Set(eligible.filter(candidate => candidate.powerKeys.includes(power))
      .flatMap(candidate => candidate.powerKeys.filter(other => other !== power))).size]));
    const minimum = Math.min(...degrees.values());
    families = families.filter(power => degrees.get(power) === minimum || weaponPowers.has(power));
  }
  const primaryPower = weightedPick(families, random, power => multipliers[power]
    * (weaponPowers.has(power) ? WEAPON_SELECTION_MULTIPLIER : 1)
    * selectionPriorMultiplier(power, quality)
    * Math.max(...eligible.filter(candidate => candidate.powerKeys.includes(power)).map(candidate => candidate.weight)));
  const candidate = weightedPick(eligible.filter(entry => entry.powerKeys.includes(primaryPower)), random,
    entry => entry.weight * secondarySelectionPrior(entry.powerKeys, primaryPower, quality));
  const profile=clone(candidate.profile);
  const tint=shotPalette[Math.floor(seededRandom('shot-color:'+seed)()*shotPalette.length)];
  for (const field of ['tear_profile','laser','knife']) if (profile[field]) profile[field].color=clone(tint);
  validateProfile?.(profile);
  const fragment = clone(profile);
  for (const field of ['metadata', 'visuals']) delete fragment[field];
  return { version: 1, quality, archetype: QUALITY_ARCHETYPES[quality], mechanicIds: candidate.mechanicIds,
    archetypeConstrained: quality >= 2 && !candidate.profile.active && candidate.mechanicIds.length === 1,
    primaryPower, powerKeys: candidate.powerKeys, fingerprint: candidate.fingerprint,
    fragment, profile, support, multipliers,
    selectionPrior: { version: selectionPriors.version, sourceExportSha256: selectionPriors.source.exportSha256,
      primaryMultiplier: selectionPriorMultiplier(primaryPower, quality), secondaryMultiplier: secondarySelectionPrior(candidate.powerKeys, primaryPower, quality) },
    fallback: candidate.powerKeys.some(power => multipliers[power] === 0.1), constrainedRepeat, balancedSecondaryFallback,
    repeatedPowerFingerprint: usedFingerprints.has(powerSignature(candidate.powerKeys)), explicitPowers: explicit };
}

function containsMechanic(profile, entry) {
  const expected = entry.fragment;
  if (!expected.systems.every(system => profile.systems.includes(system))) return false;
  for (const [field, value] of Object.entries(expected)) {
    if (['systems','stats','metadata','visuals','region','affects_stats'].includes(field)) continue;
    if (field === 'rules' || ['on_kill', 'tear_impact', 'collision'].includes(field)) {
      const containers = field === 'rules' ? profile.rules : [profile[field]];
      const requirements = field === 'rules' ? value : [value];
      if (!requirements.every(requirement => containers.some(container => container
        && (requirement.trigger === undefined || requirement.trigger === container.trigger)
        && (requirement.cooldown !== 0 || container.cooldown === 0)
        && (requirement.cooldown !== 0 || container.conditions.length === requirement.conditions.length)
        && requirement.conditions.every(condition => container.conditions.some(actual => JSON.stringify(actual) === JSON.stringify(condition)))
        && requirement.actions.every(action => container.actions.some(actual => ['type', 'status', 'creep', 'friendly_type', 'target_mode']
          .every(key => action[key] === undefined || action[key] === actual[key])))))) return false;
    } else if (field === 'tear_profile') {
      if (!value.flags.every(flag => profile.tear_profile?.flags.includes(flag))) return false;
    } else if (!profile[field] || ['type', 'behavior', 'effect'].some(key => value[key] !== undefined && profile[field][key] !== value[key])) return false;
  }
  if (entry.id === 'ability.explosion_immunity') return profile.stats?.explosion_immunity === true;
  return entry.id !== 'ability.flight' || profile.stats?.flying === true;
}

export function validateSkeleton(profile, skeleton, { validateProfile } = {}) {
  validateProfile?.(profile);
  if (!skeleton || skeleton.version !== 1 || !Array.isArray(skeleton.mechanicIds) || !skeleton.mechanicIds.length
    || new Set(skeleton.mechanicIds).size !== skeleton.mechanicIds.length) throw Error('Malformed mechanic skeleton.');
  if (profile.metadata.quality !== skeleton.quality) throw Error('Skeleton quality changed.');
  if (skeleton.mode === 'explicit_stats') {
    if (profile.systems.length!==1 || profile.systems[0]!=='stats' || powerFingerprint(profile)!==powerFingerprint([])
      || Object.keys(profile.stats ?? {}).length!==Object.keys(skeleton.support.stats).length
      || Object.entries(skeleton.support.stats).some(([stat,value])=>profile.stats?.[stat]!==value)) throw Error('Final profile changed the explicit stat wish.');
    if (!profileFits(profile,skeleton.quality)) throw Error('Explicit stat wish exceeds quality budget.');
    return true;
  }
  for (const id of skeleton.mechanicIds) {
    const entry = mechanicsById.get(id);
    if (!entry || !containsMechanic(profile, entry)) throw Error(`Final profile dropped skeleton mechanic: ${id}`);
  }
  if (powerFingerprint(profile) !== skeleton.fingerprint) throw Error('Final profile changed planned semantic powers.');
  for (const [stat, amount] of Object.entries(skeleton.support?.stats ?? {})) {
    if ((profile.stats?.[stat] ?? 0) !== amount) throw Error(`Final profile changed independent supporting choice: ${stat}`);
  }
  if (skeleton.quality === 4) {
    for (const system of ['tear_update', 'bomb', 'laser', 'knife', 'familiar', 'aura', 'active']) {
      const expected = skeleton.profile?.[system];
      if (!expected) continue;
      for (const field of ['strength', 'damage', 'radius', 'duration', 'range']) {
        if (expected[field] !== undefined && profile[system]?.[field] < expected[field]) throw Error('Final profile weakened build-defining parameters.');
      }
      if (expected.cooldown !== undefined && profile[system]?.cooldown > expected.cooldown) throw Error('Final profile weakened build-defining cooldown.');
    }
  }
  if (!profileFits(profile, skeleton.quality)) throw Error('Skeleton exceeds quality budget or contract limits.');
  return true;
}

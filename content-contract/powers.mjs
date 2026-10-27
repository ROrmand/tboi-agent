import { readFileSync } from 'node:fs';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const powerCatalog = freeze(JSON.parse(readFileSync(new URL('./power-catalog.json', import.meta.url), 'utf8')));
export const POWER_CONTRACT_VERSION = powerCatalog.version;
export const MAX_ACCEPTED_POWER_RECORDS = 128;
export const POWER_KEYS = Object.freeze([...new Set([
  ...powerCatalog.profile_sources, ...powerCatalog.action_sources,
].flatMap(source => source.powers ?? Object.values(source.values).flat()))].sort());
const knownPowers = new Set(POWER_KEYS);
const powerIndexes = new Map(POWER_KEYS.map((power, index) => [power, index]));
if (POWER_KEYS.length > 63) throw Error('Compact power history requires a new encoding version above 63 families.');
const sources = new Set(['Creator', 'Generator', 'Singularity', 'unknown']);
const readPath = (value, path) => path.reduce((current, field) => current?.[field], value);

export function profileActions(profile) {
  const systems = new Set(profile.systems ?? []);
  return powerCatalog.action_containers.flatMap(container => {
    if (!systems.has(container.system)) return [];
    const value = readPath(profile, container.path);
    return (container.each ? value ?? [] : value ? [value] : []).filter(entry =>
      (!container.include_triggers || container.include_triggers.includes(entry.trigger))
      && !container.exclude_triggers?.includes(entry.trigger)).flatMap(entry => entry.actions ?? []);
  });
}

export function derivePowerKeys(profile) {
  if (!profile || typeof profile !== 'object') throw Error('Power derivation requires a validated profile.');
  const powers = new Set();
  const systems = new Set(profile.systems ?? []);
  for (const source of powerCatalog.profile_sources) {
    if (!systems.has(source.system)) continue;
    const value = readPath(profile, source.path);
    if (source.present || Object.hasOwn(source, 'equals')) {
      if (source.present ? value != null : value === source.equals) source.powers.forEach(power => powers.add(power));
    } else {
      for (const entry of source.each ? value ?? [] : [value]) {
        (source.values[entry] ?? []).forEach(power => powers.add(power));
      }
    }
  }
  for (const action of profileActions(profile)) {
    for (const source of powerCatalog.action_sources) {
      if (source.type !== action.type) continue;
      (source.powers ?? source.values[action[source.field]] ?? []).forEach(power => powers.add(power));
    }
  }
  return [...powers].sort();
}

export function powerFingerprint(profileOrKeys) {
  const keys = Array.isArray(profileOrKeys) ? profileOrKeys : derivePowerKeys(profileOrKeys);
  if (keys.some(key => !knownPowers.has(key))) throw Error('Unknown semantic power.');
  return JSON.stringify([...new Set(keys)].sort());
}

export function validatePowerFingerprint(value) {
  let keys;
  try { keys = JSON.parse(value); } catch { throw Error('Invalid power fingerprint.'); }
  if (typeof value !== 'string' || !Array.isArray(keys) || powerFingerprint(keys) !== value) throw Error('Noncanonical power fingerprint.');
  return keys;
}

export function powerSignature(profileOrKeys) {
  const keys = Array.isArray(profileOrKeys) ? profileOrKeys : derivePowerKeys(profileOrKeys);
  let mask = 0n;
  for (const power of keys) {
    if (!knownPowers.has(power)) throw Error('Unknown semantic power.');
    mask |= 1n << BigInt(powerIndexes.get(power));
  }
  return mask.toString(16);
}

export function decodePowerSignature(value) {
  if (typeof value !== 'string' || value.length > 16 || !/^(0|[1-9a-f][0-9a-f]*)$/.test(value)) throw Error('Invalid compact power history signature.');
  const mask = BigInt('0x' + value);
  if (mask >> BigInt(POWER_KEYS.length)) throw Error('Unknown power in compact history.');
  return POWER_KEYS.filter((power, index) => (mask & (1n << BigInt(index))) !== 0n);
}

export function powerDistance(left, right) {
  const keys = value => new Set(typeof value === 'string' ? validatePowerFingerprint(value)
    : Array.isArray(value) ? validatePowerFingerprint(powerFingerprint(value)) : derivePowerKeys(value));
  const first = keys(left), second = keys(right);
  const union = new Set([...first, ...second]);
  return union.size ? 1 - [...first].filter(key => second.has(key)).length / union.size : 0;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function buildPowerLedger(records, { validateProfile } = {}) {
  if (!Array.isArray(records)) throw Error('Accepted records must be an array.');
  const identities = new Map(), usage = {}, entries = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') throw Error('Malformed accepted record.');
    if ((record.status !== undefined && record.status !== 'accepted') || record.accepted === false) continue;
    const profile = record.profile ?? record;
    const identity = record.id ?? profile.bridge_request_id;
    if (typeof identity !== 'string' || !identity.length || identity.length > 256) throw Error('Accepted record requires a stable identity.');
    if (record.id && profile.bridge_request_id && record.id !== profile.bridge_request_id) throw Error('Conflicting accepted identity.');
    const quality = profile.metadata?.quality;
    if (!Number.isInteger(quality) || quality < 0 || quality > 4) throw Error('Accepted quality must be 0-4.');
    const source = record.source ?? profile.generation_source ?? 'unknown';
    if (!sources.has(source)) throw Error('Unknown generation source.');
    const signature = JSON.stringify(canonical(profile));
    if (identities.has(identity)) {
      if (identities.get(identity) !== signature) throw Error(`Conflicting duplicate accepted identity: ${identity}`);
      continue;
    }
    validateProfile?.(profile);
    identities.set(identity, signature);
    if (identities.size > MAX_ACCEPTED_POWER_RECORDS) throw Error('Accepted power ledger exceeds runtime capacity.');
    const powers = derivePowerKeys(profile);
    powers.forEach(power => { usage[power] = (usage[power] ?? 0) + 1; });
    entries.push({ identity, order: entries.length + 1, quality, source, power_keys: powers, fingerprint: powerFingerprint(powers) });
  }
  const snapshot = {
    version: POWER_CONTRACT_VERSION,
    accepted_count: entries.length,
    power_usage: Object.fromEntries(Object.entries(usage).sort(([left], [right]) => left.localeCompare(right))),
    power_history: entries.map(entry => powerSignature(entry.power_keys)),
    recent_power_fingerprints: entries.slice(-3).map(entry => entry.fingerprint),
  };
  return { ...snapshot, entries };
}

export function powerSnapshot(ledger) {
  return validatePowerSnapshot({ version: ledger.version, accepted_count: ledger.accepted_count,
    power_usage: ledger.power_usage, power_history: ledger.power_history, recent_power_fingerprints: ledger.recent_power_fingerprints });
}

export function validatePowerSnapshot(snapshot) {
  const fields = ['version', 'accepted_count', 'power_usage', 'power_history', 'recent_power_fingerprints'];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw Error('Malformed power snapshot.');
  if (snapshot.version !== POWER_CONTRACT_VERSION) throw Error('Unsupported power snapshot version; restart Isaac and the bridge.');
  if (Object.keys(snapshot).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(snapshot, key))) throw Error('Malformed power snapshot.');
  if (!Number.isSafeInteger(snapshot.accepted_count) || snapshot.accepted_count < 0 || snapshot.accepted_count > MAX_ACCEPTED_POWER_RECORDS) throw Error('Invalid accepted count.');
  const usage = snapshot.power_usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) throw Error('Invalid power usage map.');
  for (const [key, count] of Object.entries(usage)) {
    if (!knownPowers.has(key) || !Number.isSafeInteger(count) || count < 1 || count > snapshot.accepted_count) throw Error(`Invalid power usage: ${key}`);
  }
  const recent = snapshot.recent_power_fingerprints;
  if (!Array.isArray(recent) || recent.length !== Math.min(3, snapshot.accepted_count)) throw Error('Invalid last-three power history.');
  if (!Array.isArray(snapshot.power_history) || snapshot.power_history.length !== snapshot.accepted_count) throw Error('Invalid accepted power history.');
  const history = snapshot.power_history.map(decodePowerSignature);
  const reconstructed = {};
  for (const powers of history) for (const power of powers) reconstructed[power] = (reconstructed[power] ?? 0) + 1;
  if (JSON.stringify(canonical(usage)) !== JSON.stringify(canonical(reconstructed))) throw Error('Power history does not reconstruct usage.');
  if (JSON.stringify(recent) !== JSON.stringify(history.slice(-3).map(powerFingerprint))) throw Error('Power history contradicts last-three fingerprints.');
  return structuredClone(snapshot);
}

export function powerMultipliers(powerUsage, compatiblePowers, explicitPowers = []) {
  const snapshot = validatePowerSnapshot(powerUsage);
  const compatible = [...new Set(compatiblePowers)];
  if (compatible.some(power => !knownPowers.has(power)) || explicitPowers.some(power => !knownPowers.has(power))) throw Error('Unknown compatible or explicit power.');
  const explicit = new Set(explicitPowers);
  const available = compatible.filter(power => !powerCatalog.singletons.includes(power) || !snapshot.power_usage[power]);
  const ordinary = available.filter(power => !explicit.has(power));
  const unused = ordinary.some(power => !snapshot.power_usage[power]);
  const minimum = Math.min(...ordinary.map(power => snapshot.power_usage[power] ?? 0));
  return Object.fromEntries(compatible.map(power => [power, !available.includes(power) ? 0 : explicit.has(power) ? 1
    : unused ? snapshot.power_usage[power] ? 0 : 1 : snapshot.power_usage[power] === minimum ? 0.1 : 0]));
}

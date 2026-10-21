// Every catalog effect spends or refunds weight. A new effect is unusable until
// its weight is declared here and mirrored in the Lua validator.

export function statSteps(value, step) {
  if (!value) return 0;
  const steps = Math.round(Math.abs(value) / step - 1e-9) || 1;
  return value < 0 ? -steps : steps;
}

// A loss multiplier is priced by the equivalent inverse gain. This keeps the
// endpoints symmetric: 2.0x costs 11 and 0.5x refunds 11, while 0.9x still
// refunds 2 as requested.
function multiplierWeight(value, spec) {
  const base = spec.base ?? 1;
  if (value === base) return 0;
  if (value > base) {
    const steps = statSteps(value - base, spec.step);
    return steps * spec.weight + (spec.activation_weight ?? 0);
  }
  const inverseGain = (base / value - 1);
  const steps = Math.round(inverseGain / spec.step);
  return -(Math.max(1, steps) * spec.weight + (spec.activation_weight ?? 0));
}

export function assertCatalogWeights(capabilities) {
  const weights = capabilities.weights;
  if (!weights) throw Error("The capability catalog has no weights.");
  for (const flag of capabilities.tear_flags) requireWeight(weights.tear_flags?.[flag], `tear flag ${flag}`);
  for (const pickup of capabilities.pickup_types) requireWeight(weights.pickups?.[pickup], `pickup ${pickup}`);
  for (const friendly of capabilities.friendlies) requireWeight(weights.friendlies?.[friendly], `friendly ${friendly}`);
  for (const action of Object.keys(capabilities.heart_rewards)) requireWeight(weights.heart_rewards?.[action], `heart reward ${action}`);
  requireWeight(weights.heart_rewards?.grant_soul_hearts, "heart reward grant_soul_hearts");
  for (const stat of Object.keys(capabilities.stat_bounds)) {
    if (stat === "soul_hearts") requireWeight(weights.stats?.soul_hearts?.weight, "stat soul_hearts");
    else if (stat !== "flying") requireWeight(weights.stats?.[stat]?.weight, `stat ${stat}`);
  }
  requireWeight(weights.flying, "flying");
  requireWeight(weights.grant_stat, "grant_stat");
  for (const system of Object.keys(weights.systems)) requireWeight(weights.systems[system], `system ${system}`);
  if (!Array.isArray(capabilities.quality_budgets) || capabilities.quality_budgets.length !== 5) {
    throw Error("quality budgets must declare weights for qualities 0 through 4.");
  }
}

function requireWeight(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw Error(`${name} has no weight.`);
}

export function raiseQualityToFit(profile, capabilities) {
  if (!profile?.metadata || !Number.isInteger(profile.metadata.quality)) return profile;
  const spent = profileWeight(profile, capabilities);
  const quality = capabilities.quality_budgets.findIndex((budget) => spent <= budget);
  if (quality > profile.metadata.quality) profile.metadata.quality = quality;
  return profile;
}

const HIT_TRIGGERS = new Set(["player_hurt", "enemy_hit"]);
const POSITIVE_STATS = ["damage", "damage_multiplier", "tears", "shot_speed", "range", "speed", "luck", "soul_hearts"];

function overBudget(profile, capabilities) {
  const ceiling = capabilities.quality_budgets[capabilities.quality_budgets.length - 1];
  return profileWeight(profile, capabilities) > ceiling;
}

function zeroPositiveStat(profile, name, capabilities) {
  const value = profile.stats?.[name];
  const baseline = name === "damage_multiplier" ? 1 : 0;
  if (!(value > baseline)) return false;
  const max = capabilities.stat_bounds?.[name]?.[1];
  if (typeof max === "number" && value > max) return false;
  profile.stats[name] = baseline;
  if (POSITIVE_STATS.every((stat) => stat === "damage_multiplier" ? (profile.stats[stat] ?? 1) === 1 : !profile.stats[stat]) && profile.stats.flying !== true) dropSystem(profile, "stats");
  return true;
}

function dropSystem(profile, system) {
  const blocks = {
    stats: "stats", tears: "tear_profile", familiar: "familiar", aura: "aura",
    on_kill: "on_kill", tear_impact: "tear_impact", collision: "collision",
    tear_update: "tear_update", bomb: "bomb", laser: "laser", knife: "knife",
  };
  const present = Array.isArray(profile.systems) && profile.systems.includes(system);
  if (!present && profile[blocks[system]] == null) return false;
  if (Array.isArray(profile.systems)) profile.systems = profile.systems.filter((entry) => entry !== system);
  delete profile[blocks[system]];
  if (system === "stats") profile.affects_stats = false;
  if (system === "rules" && Array.isArray(profile.rules)) {
    profile.rules = profile.rules.filter((rule) => HIT_TRIGGERS.has(rule?.trigger));
  }
  if (system === "on_hit" && Array.isArray(profile.rules)) {
    profile.rules = profile.rules.filter((rule) => !HIT_TRIGGERS.has(rule?.trigger));
  }
  return true;
}

function popFlag(block, keep) {
  if (!Array.isArray(block?.flags) || block.flags.length <= keep) return false;
  block.flags.pop();
  return true;
}

function actionOwners(profile) {
  const owners = [];
  for (const rule of profile.rules ?? []) owners.push({ owner: rule });
  for (const system of ["collision", "tear_impact", "on_kill"]) {
    if (profile[system]) owners.push({ owner: profile[system], system });
  }
  return owners;
}

function forgetOwner(profile, place) {
  if (place.system) {
    dropSystem(profile, place.system);
    return;
  }
  profile.rules = (profile.rules ?? []).filter((rule) => rule !== place.owner);
  const rules = profile.rules.filter((rule) => !HIT_TRIGGERS.has(rule?.trigger));
  const hits = profile.rules.filter((rule) => HIT_TRIGGERS.has(rule?.trigger));
  if (!rules.length && Array.isArray(profile.systems)) profile.systems = profile.systems.filter((system) => system !== "rules");
  if (!hits.length && Array.isArray(profile.systems)) profile.systems = profile.systems.filter((system) => system !== "on_hit");
}

function changeAction(profile, predicate, change) {
  const places = actionOwners(profile);
  for (let place = places.length - 1; place >= 0; place -= 1) {
    const actions = places[place].owner.actions;
    if (!Array.isArray(actions)) continue;
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      if (!predicate(actions[index])) continue;
      if (!change(actions, index)) continue;
      if (!actions.length) forgetOwner(profile, places[place]);
      return true;
    }
  }
  return false;
}

function dropOneExpense(profile, capabilities) {
  if (zeroPositiveStat(profile, "speed", capabilities)) return true;
  if (zeroPositiveStat(profile, "shot_speed", capabilities)) return true;
  if (changeAction(profile, (action) => action?.type === "grant_soul_hearts" && action.amount > 1, (actions, index) => {
    actions[index].amount -= 1;
    return true;
  })) return true;
  if (popFlag(profile.tear_profile, 1)) return true;
  if (popFlag(profile.familiar?.attack, 1)) return true;
  if (popFlag(profile.bomb, 1)) return true;
  if (dropSystem(profile, "collision")) return true;
  if (dropSystem(profile, "tear_impact")) return true;
  if (Array.isArray(profile.rules) && profile.rules.length > 1) {
    profile.rules.pop();
    const roomRules = profile.rules.filter((rule) => !HIT_TRIGGERS.has(rule?.trigger));
    const hitRules = profile.rules.filter((rule) => HIT_TRIGGERS.has(rule?.trigger));
    if (!roomRules.length) profile.systems = profile.systems?.filter((system) => system !== "rules");
    if (!hitRules.length) profile.systems = profile.systems?.filter((system) => system !== "on_hit");
    return true;
  }
  if (changeAction(profile, (action) => action?.amount > 1, (actions, index) => {
    actions[index].amount -= 1;
    return true;
  })) return true;
  if (changeAction(profile, (action) => action?.type === "grant_soul_hearts", (actions, index) => {
    actions.splice(index, 1);
    return true;
  })) return true;
  if (dropSystem(profile, "on_kill")) return true;
  if (changeAction(profile, () => true, (actions, index) => {
    actions.splice(index, 1);
    return true;
  })) return true;
  for (const stat of ["luck", "tears", "range", "damage", "damage_multiplier", "soul_hearts"]) {
    if (zeroPositiveStat(profile, stat, capabilities)) return true;
  }
  if (profile.stats?.flying === true) {
    profile.stats.flying = false;
    return true;
  }
  for (const system of ["aura", "familiar", "bomb", "laser", "knife", "tear_update"]) {
    if (dropSystem(profile, system)) return true;
  }
  if (popFlag(profile.tear_profile, 0)) return true;
  if (popFlag(profile.familiar?.attack, 0)) return true;
  if (Array.isArray(profile.rules) && profile.rules.length) {
    profile.rules.pop();
    return true;
  }
  return false;
}

function noteTrim(profile) {
  const note = typeof profile.metadata.balance_note === "string" ? profile.metadata.balance_note : "";
  if (note.includes("cut to fit the weight budget")) return;
  const next = `${note} Effects were cut to fit the weight budget.`.trim();
  if (Buffer.byteLength(next, "utf8") <= 256) profile.metadata.balance_note = next;
}

function syncRegion(profile) {
  if (!Array.isArray(profile.systems)) return;
  const familiar = profile.systems.includes("familiar");
  const aura = profile.systems.includes("aura");
  if (familiar && aura) profile.region = "familiar_aura";
  else if (familiar) profile.region = "familiar";
  else if (aura) profile.region = "aura";
  else if (profile.region && profile.region !== "passive") profile.region = "passive";
}

// Quality 4 is the ceiling. Raise quality when the effects fit a higher tier.
// When they do not fit any tier, drop incidental extras until they do.
export function fitWeightBudget(profile, capabilities) {
  if (!profile?.metadata || !Number.isInteger(profile.metadata.quality)) return profile;
  let trimmed = false;
  for (let guard = 0; guard < 48 && overBudget(profile, capabilities); guard += 1) {
    if (!dropOneExpense(profile, capabilities)) break;
    trimmed = true;
  }
  if (trimmed) noteTrim(profile);
  syncRegion(profile);
  return raiseQualityToFit(profile, capabilities);
}

export function profileWeight(profile, capabilities) {
  const weights = capabilities.weights;
  let total = 0;
  const flags = [
    ...(profile.tear_profile?.flags ?? []),
    ...(profile.familiar?.attack?.flags ?? []),
    ...(profile.bomb?.flags ?? []),
  ];
  for (const flag of flags) {
    const weight = weights.tear_flags[flag];
    if (typeof weight !== "number") throw Error(`Tear flag ${flag} has no weight.`);
    total += weight;
  }
  if (profile.stats) {
    for (const [name, spec] of Object.entries(weights.stats)) {
      const value = profile.stats[name] ?? spec.base ?? 0;
      if (name === "damage_multiplier") total += multiplierWeight(value, spec);
      else {
        const steps = statSteps(value - (spec.base ?? 0), spec.step);
        total += steps * spec.weight + (steps === 0 ? 0 : Math.sign(steps) * (spec.activation_weight ?? 0));
      }
    }
    if (profile.stats.flying) total += weights.flying;
  }
  for (const [system, weight] of Object.entries(weights.systems)) {
    if (Array.isArray(profile.systems) && profile.systems.includes(system)) total += weight;
  }
  const roomStats = {};
  for (const action of profileActions(profile)) {
    if (action.type === "spawn_pickup") total += required(weights.pickups[action.pickup_type], action.pickup_type) * action.amount;
    else if (action.type === "spawn_friendly") total += required(weights.friendlies[action.friendly_type], action.friendly_type) * action.amount;
    else if (typeof weights.heart_rewards[action.type] === "number") total += weights.heart_rewards[action.type] * action.amount;
    else if (action.type === "grant_stat") roomStats[action.stat] = Math.max(roomStats[action.stat] || 0, action.amount);
  }
  for (const amount of Object.values(roomStats)) total += amount * weights.grant_stat;
  return total;
}

function required(weight, name) {
  if (typeof weight !== "number") throw Error(`${name} has no weight.`);
  return weight;
}

function profileActions(profile) {
  const actions = [];
  for (const rule of profile.rules ?? []) actions.push(...(rule.actions ?? []));
  for (const name of ["on_kill", "tear_impact", "collision"]) actions.push(...(profile[name]?.actions ?? []));
  return actions;
}

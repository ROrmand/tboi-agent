// The model chooses the region and the systems. These helpers only make the
// optional blocks match that choice, so a passive item cannot keep a familiar
// the schema happened to fill, and an unmarked system cannot keep its block.

const BLOCK_BY_SYSTEM = {
  active: "active",
  stats: "stats",
  tears: "tear_profile",
  familiar: "familiar",
  aura: "aura",
  on_kill: "on_kill",
  tear_impact: "tear_impact",
  collision: "collision",
  tear_update: "tear_update",
  bomb: "bomb",
  laser: "laser",
  knife: "knife",
};

const HIT_TRIGGERS = new Set(["player_hurt", "enemy_hit"]);

export function applyRegion(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const wantsFamiliar = profile.region === "familiar" || profile.region === "familiar_aura";
  const wantsAura = profile.region === "aura" || profile.region === "familiar_aura";
  if (!wantsFamiliar) delete profile.familiar;
  if (!wantsAura) delete profile.aura;
  if (Array.isArray(profile.systems)) {
    profile.systems = profile.systems.filter((system) => {
      if (system === "familiar") return wantsFamiliar;
      if (system === "aura") return wantsAura;
      return true;
    });
  }
  return profile;
}

export function applySystems(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const selected = new Set(Array.isArray(profile.systems) ? profile.systems : []);
  for (const [system, key] of Object.entries(BLOCK_BY_SYSTEM)) {
    if (!selected.has(system)) delete profile[key];
  }
  if (Array.isArray(profile.rules)) {
    profile.rules = profile.rules.filter((rule) => {
      if (HIT_TRIGGERS.has(rule?.trigger)) return selected.has("on_hit");
      return selected.has("rules");
    });
  } else if (!selected.has("rules") && !selected.has("on_hit")) {
    profile.rules = [];
  }
  profile.affects_stats = selected.has("stats");
  return profile;
}

const STAT_PHRASES = [
  [/lower damage and raise tears/i, { damage: -1, tears: 0.6 }],
  [/take a speed hit for more damage/i, { speed: -0.1, damage: 0.8 }],
  [/a little range, and no extra damage/i, { range: 3, damage: 0 }],
  [/slightly raises isaac's damage/i, { damage: 1 }],
  [/slightly raises isaac's tears/i, { tears: 1 }],
  [/slightly raises isaac's luck/i, { luck: 1 }],
  [/slightly changes damage/i, { damage: 1 }],
  [/add damage/i, { damage: 0.6 }],
  [/fire a little faster/i, { tears: 0.4 }],
  [/raise shot speed/i, { shot_speed: 0.15 }],
  [/add range/i, { range: 4 }],
  [/move a bit faster/i, { speed: 0.1 }],
  [/add luck/i, { luck: 1 }],
];

const TEAR_PHRASES = [
  [/tears home in/i, "homing"],
  [/pass through rocks/i, "spectral"],
  [/tears poison/i, "poison"],
  [/tears burn/i, "burn"],
  [/tears slow/i, "slow"],
  [/tears scare/i, "fear"],
  [/tears charm/i, "charm"],
  [/tears bounce/i, "bounce"],
  [/tears split/i, "split"],
  [/tears glow/i, "glow"],
  [/tears (?:can )?pierce/i, "piercing"],
  [/tears orbit/i, "orbit"],
];

const REWARD_SENTENCES = [
  { pattern: /when i clear a room, i sometimes find a (coin|key|bomb|heart)/i, trigger: "room_clear", kind: "rules" },
  { pattern: /when i clear a room, grant me a soul heart/i, trigger: "room_clear", kind: "rules", soul: true },
  { pattern: /when i reach a new floor, i sometimes find a (coin|key|bomb|heart)/i, trigger: "new_floor", kind: "rules" },
  { pattern: /when i pick this up, i sometimes find a (coin|key|bomb|heart)/i, trigger: "pickup", kind: "rules" },
  { pattern: /when i enter a room, i sometimes find a (coin|key|bomb|heart)/i, trigger: "room_enter", kind: "rules" },
  { pattern: /when i get hit, i sometimes find a (coin|key|bomb|heart)/i, trigger: "player_hurt", kind: "on_hit" },
  { pattern: /when i get hit, grant me a soul heart/i, trigger: "player_hurt", kind: "on_hit", soul: true },
  { pattern: /when i hit an enemy, i sometimes find a (coin|key|bomb|heart)/i, trigger: "enemy_hit", kind: "on_hit" },
  { pattern: /when an enemy dies, i sometimes find a (coin|key|bomb|heart)/i, kind: "on_kill" },
  { pattern: /when an enemy dies, grant me a soul heart/i, kind: "on_kill", soul: true },
  { pattern: /when a tear hits an enemy, i sometimes find a (coin|key|bomb|heart)/i, kind: "tear_impact" },
  { pattern: /when a tear hits an enemy, grant me a soul heart/i, kind: "tear_impact", soul: true },
  { pattern: /when i touch an enemy, i sometimes find a (coin|key|bomb|heart)/i, kind: "collision" },
  { pattern: /when i touch an enemy, grant me a soul heart/i, kind: "collision", soul: true },
];

const COMBAT_SENTENCES = [
  { pattern: /when an enemy dies, deals? a (?:small )?(?:damage )?burst/i, kind: "on_kill",
    proc: () => ({ conditions: [], cooldown: 30, actions: [{ type: "damage_burst", amount: 1, radius: 80 }] }) },
  { pattern: /when a tear hits(?: an enemy)?, applies a status/i, kind: "tear_impact",
    proc: () => ({ conditions: [], cooldown: 30, actions: [{ type: "apply_status", amount: 1, status: "slow", duration: 30 }] }) },
  { pattern: /when isaac is hit, retaliates against the attacker/i, kind: "on_hit", trigger: "player_hurt",
    proc: () => ({ conditions: [], cooldown: 30, actions: [{ type: "retaliate", amount: 1 }] }) },
  { pattern: /when isaac touches an enemy, retaliates/i, kind: "collision",
    proc: () => ({ conditions: [], cooldown: 30, actions: [{ type: "retaliate", amount: 1 }] }) },
];

const BLAND_ACTION_TYPES = new Set([
  "spawn_pickup", "grant_soul_hearts", "grant_half_red_hearts", "grant_full_red_hearts",
  "grant_black_hearts", "grant_eternal_hearts", "grant_bone_hearts",
]);

const STAT_KEYS = ["damage", "tears", "shot_speed", "range", "speed", "luck", "soul_hearts"];

function selected(profile, name) {
  return Array.isArray(profile.systems) && profile.systems.includes(name);
}

function ensureSystem(profile, name) {
  if (!Array.isArray(profile.systems)) profile.systems = [];
  if (!profile.systems.includes(name)) profile.systems.push(name);
}

function dropSystem(profile, name) {
  if (!Array.isArray(profile.systems)) return;
  profile.systems = profile.systems.filter((system) => system !== name);
}

function clampBytes(value, maximum) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") <= maximum) return value;
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maximum) end -= 1;
  const clipped = value.slice(0, end);
  const atWord = clipped.replace(/\s+\S*$/, "").trim();
  return atWord || clipped.trim();
}

function rewardParts(sentence, match) {
  const action = sentence.soul
    ? { type: "grant_soul_hearts", amount: 1 }
    : { type: "spawn_pickup", pickup_type: match[1].toLowerCase(), amount: 1 };
  const conditions = sentence.soul
    ? [{ type: "once_per_room" }]
    : [{ type: "chance", chance: 0.35 }];
  return { conditions, actions: [action] };
}

function procMissing(proc) {
  return !proc || typeof proc !== "object" || !Array.isArray(proc.actions) || !proc.actions.length;
}

function addRule(profile, rule) {
  if (!Array.isArray(profile.rules)) profile.rules = [];
  const hit = HIT_TRIGGERS.has(rule.trigger);
  const exists = profile.rules.some((entry) => hit
    ? HIT_TRIGGERS.has(entry?.trigger)
    : entry && !HIT_TRIGGERS.has(entry.trigger));
  if (exists) return;
  if (profile.rules.length >= 2) profile.rules.pop();
  profile.rules.push(rule);
}

function isBlandAction(action) {
  return BLAND_ACTION_TYPES.has(action?.type);
}

function promptWantsUnique(prompt) {
  return COMBAT_SENTENCES.some((sentence) => sentence.pattern.test(prompt))
    || /slightly raises isaac's (?:damage|tears)|grants? temporary (?:damage|tears|luck)/i.test(prompt);
}

function promptAsksForLoot(prompt) {
  return /find a (coin|key|bomb|heart)|grant me a soul heart/i.test(prompt);
}

function dropBlandPadding(profile, prompt) {
  if (!promptWantsUnique(prompt) || promptAsksForLoot(prompt)) return;
  if (Array.isArray(profile.rules)) {
    profile.rules = profile.rules
      .map((rule) => ({ ...rule, actions: (rule.actions || []).filter((action) => !isBlandAction(action)) }))
      .filter((rule) => rule.actions.length);
  }
  for (const name of ["on_kill", "tear_impact", "collision"]) {
    if (!Array.isArray(profile[name]?.actions)) continue;
    profile[name].actions = profile[name].actions.filter((action) => !isBlandAction(action));
    if (!profile[name].actions.length) delete profile[name];
  }
}

function relocateMisplacedCombat(profile) {
  if (!Array.isArray(profile.rules)) return;
  const kept = [];
  for (const rule of profile.rules) {
    if (!rule || !Array.isArray(rule.actions)) {
      kept.push(rule);
      continue;
    }
    const rest = [];
    for (const action of rule.actions) {
      const cooldown = Math.max(30, Number.isInteger(rule.cooldown) ? rule.cooldown : 30);
      if (action?.type === "damage_burst") {
        ensureSystem(profile, "on_kill");
        if (procMissing(profile.on_kill)) profile.on_kill = { conditions: rule.conditions || [], cooldown, actions: [action] };
      } else if (action?.type === "apply_status") {
        ensureSystem(profile, "tear_impact");
        if (procMissing(profile.tear_impact)) profile.tear_impact = { conditions: rule.conditions || [], cooldown, actions: [action] };
      } else if (action?.type === "retaliate" && !HIT_TRIGGERS.has(rule.trigger)) {
        ensureSystem(profile, "collision");
        if (procMissing(profile.collision)) profile.collision = { conditions: rule.conditions || [], cooldown, actions: [action] };
      } else {
        rest.push(action);
      }
    }
    if (rest.length) kept.push({ ...rule, actions: rest });
  }
  profile.rules = kept;
}

function ensureCombatFields(entry) {
  if (!entry || !Array.isArray(entry.actions)) return;
  const combat = entry.actions.filter((action) => ["damage_burst", "apply_status", "retaliate"].includes(action?.type));
  if (!combat.length) return;
  if (!Number.isInteger(entry.cooldown) || entry.cooldown < 30) entry.cooldown = 30;
  for (const action of combat) {
    if (action.type === "damage_burst" && !(action.radius >= 40 && action.radius <= 120)) action.radius = 80;
    if (action.type === "apply_status") {
      if (!["slow", "burn", "fear"].includes(action.status)) action.status = "slow";
      if (!Number.isInteger(action.duration) || action.duration < 15 || action.duration > 120) action.duration = 30;
    }
  }
}

function completeStats(existing, patch) {
  const stats = { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0 };
  if (existing && typeof existing === "object") {
    for (const key of STAT_KEYS) if (existing[key] != null) stats[key] = existing[key];
    if (existing.damage_multiplier != null) stats.damage_multiplier = existing.damage_multiplier;
    if (typeof existing.flying === "boolean") stats.flying = existing.flying;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (stats[key] == null || stats[key] === 0) stats[key] = value;
  }
  return stats;
}

// When a prompt uses a known effect phrase and the model marks a system but
// leaves out its object, fill that object from the sentence. Drop a marked
// system only when the sentence never asked for it and the object is absent.
export function repairProfile(profile, prompt = "") {
  if (!profile || typeof profile !== "object") return profile;
  if (profile.active !== undefined || profile.systems?.includes("active")) return profile;
  if (profile.metadata && typeof profile.metadata === "object") {
    profile.metadata.display_name = clampBytes(profile.metadata.display_name, 64);
    profile.metadata.description = clampBytes(profile.metadata.description, 64);
  }
  if (typeof prompt !== "string" || !prompt.trim()) return profile;

  const statPatch = {};
  for (const [pattern, patch] of STAT_PHRASES) {
    if (pattern.test(prompt)) Object.assign(statPatch, patch);
  }
  if (Object.keys(statPatch).length) {
    ensureSystem(profile, "stats");
    profile.stats = completeStats(profile.stats, statPatch);
  } else if (selected(profile, "stats") && !profile.stats) {
    dropSystem(profile, "stats");
  }

  const foundFlags = [];
  for (const [pattern, flag] of TEAR_PHRASES) {
    const match = prompt.match(pattern);
    if (match && !foundFlags.some((entry) => entry.flag === flag)) foundFlags.push({ index: match.index, flag });
  }
  foundFlags.sort((a, b) => a.index - b.index);
  const tearFlags = foundFlags.map((entry) => entry.flag).slice(0, 3);
  if (tearFlags.length) {
    ensureSystem(profile, "tears");
    const current = profile.tear_profile;
    if (!current || typeof current !== "object" || !Array.isArray(current.flags) || !current.flags.length) {
      profile.tear_profile = {
        flags: tearFlags,
        color: current?.color ?? { r: 0.85, g: 0.85, b: 0.9, a: 1 },
        scale: current?.scale ?? 1,
      };
    }
  } else if (selected(profile, "tears") && !profile.tear_profile) {
    dropSystem(profile, "tears");
  }

  dropBlandPadding(profile, prompt);

  const procs = {};
  const rules = [];
  for (const sentence of COMBAT_SENTENCES) {
    if (!sentence.pattern.test(prompt)) continue;
    const parts = sentence.proc();
    if (sentence.kind === "on_hit") rules.push({ ...parts, trigger: sentence.trigger, kind: sentence.kind });
    else procs[sentence.kind] = parts;
  }
  const grantMatch = prompt.match(/on room clear, grants? temporary (damage|tears|luck)/i);
  if (grantMatch) {
    rules.push({
      trigger: "room_clear",
      kind: "rules",
      conditions: [],
      actions: [{ type: "grant_stat", stat: grantMatch[1].toLowerCase(), amount: 1 }],
    });
  }
  for (const sentence of REWARD_SENTENCES) {
    const match = prompt.match(sentence.pattern);
    if (!match) continue;
    const parts = rewardParts(sentence, match);
    if (sentence.kind === "rules" || sentence.kind === "on_hit") rules.push({ ...parts, trigger: sentence.trigger, kind: sentence.kind });
    else if (!procs[sentence.kind]) procs[sentence.kind] = parts;
  }
  for (const [name, proc] of Object.entries(procs)) {
    ensureSystem(profile, name);
    if (procMissing(profile[name])) profile[name] = proc;
  }
  relocateMisplacedCombat(profile);
  for (const name of ["on_kill", "tear_impact", "collision"]) {
    ensureCombatFields(profile[name]);
    if (selected(profile, name) && procMissing(profile[name]) && !procs[name]) dropSystem(profile, name);
  }
  for (const rule of rules) {
    ensureSystem(profile, rule.kind);
    addRule(profile, { trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions, cooldown: rule.cooldown });
  }
  for (const rule of profile.rules || []) ensureCombatFields(rule);
  if (selected(profile, "on_hit") && !profile.rules?.some((rule) => HIT_TRIGGERS.has(rule?.trigger)) && !rules.some((rule) => rule.kind === "on_hit")) {
    dropSystem(profile, "on_hit");
  }
  if (selected(profile, "rules") && !profile.rules?.some((rule) => rule && !HIT_TRIGGERS.has(rule.trigger)) && !rules.some((rule) => rule.kind === "rules")) {
    dropSystem(profile, "rules");
  }
  return profile;
}

export function repairNote(message) {
  const base = `The previous attempt failed validation: ${message}. Produce a fresh valid JSON object that fixes that error.`;
  if (message.includes("64-byte") || message.includes("display_name") || message.includes("description")) {
    return `${base} Shorten display_name and description so each is under 60 characters.`;
  }
  if (message.includes("Combat effects") || message.includes("at least 30 frames cooldown")) {
    return `${base} Keep the combat action. damage_burst belongs on on_kill with cooldown 30, amount 1-3, and radius 40-120. apply_status belongs on tear_impact with cooldown 30, status slow|burn|fear, and duration 15-120. retaliate belongs on collision or player_hurt with cooldown 30 and amount 1-3. Do not replace a combat action with spawn_pickup or grant_soul_hearts.`;
  }
  if (message.includes("on_hit")) {
    return `${base} Keep on_hit in systems and add one rules entry. trigger player_hurt means Isaac gets hit. "When I get hit, hurt the attacker" is action retaliate, amount 1, cooldown 30. trigger enemy_hit means Isaac's tear hits an enemy. "I sometimes find a coin" is action spawn_pickup, pickup_type coin, amount 1, with a chance condition. Do not leave rules empty.`;
  }
  if (message.includes("rules system")) {
    return `${base} Keep rules in systems and add one rule whose trigger is room_enter, room_clear, pickup, new_floor, or tear_fire. Prefer grant_stat with stat damage, amount 1 for a next-room damage bonus. "When I clear a room, grant me a soul heart" uses trigger room_clear and action grant_soul_hearts, amount 1 only when the wish asks for healing.`;
  }
  if (message.includes("stats system")) {
    return `${base} Keep stats in systems and include stats with damage, tears, shot_speed, range, speed, luck, and soul_hearts all present. "Move a bit faster" is speed above 0. "Add range" is range above 0. "Raise shot speed" is shot_speed above 0. "Lower damage and raise tears" sets damage below 0 and tears above 0. Every stat the wish does not change is 0.`;
  }
  if (message.includes("tear profile") || message.includes("tears system")) {
    return `${base} If the wish says Tears split, Tears can pierce, Tears pierce, Tears poison, Tears charm, or Tears orbit, keep tears in systems and include tear_profile with those flags, a color, and scale. "Raise shot speed" is stats, not tears. If the wish never describes Isaac's shots, remove tears from systems. A familiar can still have its own attack.`;
  }
  if (message.includes("on_kill")) {
    return `${base} Keep on_kill in systems and set on_kill to {"conditions":[],"cooldown":30,"actions":[{"type":"damage_burst","amount":1,"radius":80}]}. Use spawn_pickup only when the wish finds a pickup. Do not put this proc in rules.`;
  }
  if (message.includes("tear_impact")) {
    return `${base} Keep tear_impact in systems and set tear_impact to {"conditions":[],"cooldown":30,"actions":[{"type":"apply_status","amount":1,"status":"slow","duration":30}]}. Use spawn_pickup only when the wish finds a pickup. Do not put this proc in rules.`;
  }
  if (message.includes("collision")) {
    return `${base} Keep collision in systems and set collision to {"conditions":[],"cooldown":30,"actions":[{"type":"retaliate","amount":1}]}. Use spawn_pickup only when the wish finds a pickup. Do not put this proc in rules.`;
  }
  if (message.includes("must match the region")) {
    return `${base} passive cannot include familiar or aura. A familiar region keeps the familiar system and drops aura. An aura region keeps the aura system and drops familiar. familiar_aura keeps both. Change region or remove the system the region does not allow.`;
  }
  if (message.includes("weight budget") || message.includes("spends")) {
    const match = message.match(/quality (\d+) allows (\d+)/i);
    const budgetLine = match ? `Quality ${match[1]} allows ${match[2]}.` : "Quality 4 allows 24.";
    return `${base} Stay inside the quality weight budget. ${budgetLine} Shrink combat radius, active damage, and amounts before dropping distinctive effects. Remove pickup or soul-heart padding first. Keep damage, combat procs, auras, and tear effects when they fit. Speed cannot go below -0.15. Do not deal damage to Isaac.`;
  }
  if (message.includes("tear_update") || message.includes("bomb") || message.includes("laser") || message.includes("knife")) {
    return `${base} Keep that system and include its object. tear_update needs behavior home, pulse, or shrink and strength from 0.5 to 2. bomb needs damage and radius. laser and knife need damage.`;
  }
  return `${base} Include the parameter block for every system you keep. Omit a system when the wish does not need it.`;
}

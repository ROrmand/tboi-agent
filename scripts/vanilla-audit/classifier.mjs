export const TAXONOMY_VERSION = '1.0.4';
export const CATEGORIES = ['trigger', 'condition', 'action', 'modifier', 'actor', 'field', 'economy', 'lifecycle', 'synergy'];
export const DISPOSITIONS = {
  supported: 'supported now',
  reusable: 'reusable and safe to add',
  'new-system': 'possible but needs a new bounded runtime system',
  excluded: 'excluded',
};

const icons = {
  Damage: 'damage', Tears: 'tears', Range: 'range', Speed: 'speed', Shotspeed: 'shot speed', Luck: 'luck',
  Heart: 'heart', HalfHeart: 'half heart', SoulHeart: 'soul heart', BlackHeart: 'black heart',
  Coin: 'coin', Key: 'key', Bomb: 'bomb', Battery: 'charge', HealingRed: 'healing',
  Poison: 'poison', Fear: 'fear', Slow: 'slow', Burn: 'burn', Charm: 'charm', Confusion: 'confusion',
  Freezing: 'freeze', Homing: 'homing', Piercing: 'piercing', Timer: 'duration', Warning: 'warning',
};
const formatting = new Set(['ColorReset', 'CR', 'ColorRed', 'ColorGreen', 'ColorBlue', 'ColorYellow', 'ColorGray', 'ColorWhite', 'ColorOrange', 'ColorPurple', 'ColorCyan', 'Blink', 'NoLB']);

export function normalizeDescription(sourceText) {
  if (typeof sourceText !== 'string') throw new TypeError('Description must be text');
  const clauses = sourceText.split(/#|\r?\n/).map((source, index) => {
    const markup = [];
    const unknownMarkup = [];
    let text = source.replace(/\{\{([^{}]+)\}\}/g, (raw, token) => {
      markup.push({ raw, token });
      if (formatting.has(token)) return '';
      if (Object.hasOwn(icons, token)) return ` ${icons[token]} `;
      if (/^Collectible\d+$/.test(token)) return ` [collectible:${token.slice(11)}] `;
      unknownMarkup.push(raw);
      return raw;
    });
    if (/\{\{|\}\}/.test(text.replace(/\{\{[^{}]+\}\}/g, ''))) unknownMarkup.push('unbalanced markup');
    text = text.replace(/↑/g, ' up ').replace(/↓/g, ' down ').replace(/\s+/g, ' ').trim();
    return { index, source, text, markup, unknownMarkup };
  });
  return { sourceText, text: clauses.map(clause => clause.text).join('\n'), clauses };
}

const rule = (id, category, pattern, disposition, confidence, evidence, full = false) => ({ id, category, pattern, disposition, confidence, evidence, full });
export const RULES = [
  rule('stat.add', 'modifier', /^(?:up|down)?\s*(?:(?:damage|tears|range|speed|shot speed|luck)\s+)?[+-]\d+(?:\.\d+)?\s+(?:damage|tears|range|speed|shot speed|luck)[.!]?$/i, 'supported', 0.95, 'content-contract/capabilities.json: systems.stats; primitive only, not numeric balance parity', true),
  rule('tear.homing', 'modifier', /^(?:homing\s+)?homing tears[.!]?$/i, 'supported', 0.98, 'content-contract/capabilities.json: tear_flags.homing', true),
  rule('tear.piercing', 'modifier', /^(?:piercing\s+)?piercing tears[.!]?$/i, 'supported', 0.98, 'content-contract/capabilities.json: tear_flags.piercing', true),
  rule('tear.orbit_target', 'modifier', /^Tears orbit the nearest enemy[.!]?$/i, 'reusable', 0.75, 'Candidate bounded tear-update handler; requires implementation, targeting bounds and source-removal tests', true),
  rule('event.hurt', 'trigger', /\b(?:taking damage|when (?:Isaac|you) (?:takes?|take) damage|on taking damage)\b/i, 'supported', 0.9, 'content-contract/capabilities.json: triggers.player_hurt'),
  rule('event.kill', 'trigger', /\b(?:killing|on kill|when .*\bdies)\b/i, 'supported', 0.85, 'content-contract/capabilities.json: systems.on_kill'),
  rule('event.room_clear', 'trigger', /\b(?:clearing (?:a |the )?room|on room clear|when .*room is cleared)\b/i, 'supported', 0.88, 'content-contract/capabilities.json: triggers.room_clear'),
  rule('event.active', 'trigger', /\b(?:on use|using the item|when used)\b/i, 'supported', 0.85, 'content-contract/capabilities.json: triggers.active_use'),
  rule('gate.probability', 'condition', /\b(?:\d+(?:\.\d+)?% chance|chance to|occasionally)\b/i, 'supported', 0.85, 'content-contract/capabilities.json: conditions.chance; inferred threshold, not an executable profile'),
  rule('gate.health', 'condition', /\b(?:if|while|when)\b.*\b(?:hearts?|health)\b/i, 'new-system', 0.8, 'Review resource predicate and threshold semantics against current validator'),
  rule('gate.generic', 'condition', /\b(?:if|unless|while|only when|as long as)\b/i, 'new-system', 0.65, 'Conditional phrase requires manual semantic review'),
  rule('action.damage', 'action', /\b(?:deals?|inflicts?)\b.*\bdamage\b/i, 'supported', 0.82, 'content-contract/capabilities.json: combat_effects.damage_burst; target/bounds require review'),
  rule('action.heal', 'action', /\b(?:heals?|healing)\b/i, 'supported', 0.8, 'content-contract/capabilities.json: health grants; units require review'),
  rule('action.spawn', 'action', /\b(?:spawns?|summons?|creates?)\b/i, 'new-system', 0.75, 'Spawn entity, count, lifetime and ownership must be bounded'),
  rule('action.projectile_reflect', 'action', /\breflect(?:s|ed|ing)?\s+(?:enemy\s+)?(?:shots?|projectiles?|bullets?|tears?)\b|\b(?:shots?|projectiles?|bullets?|tears?)\b[^.!?]{0,80}\b(?:be|are|is)\s+reflected\b/i, 'supported', 0.9, 'content-contract/expanded-effects.json: reflect_projectiles returns only ordinary unflagged hostile bullets as plain owned secondary tears; partial cue, not laser reflection, special-projectile preservation or full vanilla actor behavior'),
  rule('action.projectile_block', 'action', /(?<!not )(?<!never )(?<!n't )\bblock(?:s|ed|ing)?\b[^.!?]{0,45}\b(?:shots?|projectiles?|bullets?|tears?)\b|(?<!not )(?<!never )(?<!n't )\bdestroy(?:s|ed|ing)?\s+(?:enemy\s+)?(?:shots?|projectiles?|bullets?|tears?)\b/i, 'supported', 0.88, 'content-contract/expanded-effects.json: block_projectiles; partial cue only, not continuous orbital shielding, shielded-tear AI or full vanilla behavior'),
  rule('action.extra_tears', 'action', /\b(?:extra|additional)\s+(?:(?:homing|slowing|piercing|spectral|bone|blood)\s+)?tears?\b|\bshoots?\s+(?:[2-9]\d*|1\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:bone|blood|homing|piercing|spectral|slowing)\s+)?tears?\b|\b(?:bursts?|clusters?)\s+of\s+tears?\b|\bshotgun (?:style )?attack\b/i, 'supported', 0.88, 'content-contract/expanded-effects.json: extra_tears; counted volleys, bursts and shotgun attacks are partial cues, not exact counts, charging, actor AI or flag inheritance'),
  rule('action.player_dash', 'action', /\bIsaac\s+(?:is\s+)?dash(?:es|ing)?\b|\b(?:upon use|using the item)\b[^.!?]{0,30}\bdash(?:es|ing)?\b/i, 'supported', 0.85, 'content-contract/expanded-effects.json: dash; no invulnerability, contact attack, carry/slam or input-combo behavior is inferred'),
  rule('action.enemy_mark', 'action', /\bmark(?:s|ed|ing)?\s+enem(?:y|ies)\b|\bmarked enemies\b/i, 'new-system', 0.9, 'Target marking requires explicit mark effect, owner, lifetime and cleanup; kill-order rewards are not equivalent'),
  rule('modifier.stat', 'modifier', /\b(?:damage|tears|range|speed|shot speed|luck)\s+(?:multiplier|up|down)|[+-]\d+(?:\.\d+)?\s+(?:damage|tears|range|speed|luck)\b/i, 'new-system', 0.8, 'Persistent stat semantics; additive versus multiplicative review'),
  rule('modifier.weapon', 'modifier', /\b(?:instead of tears|replaces? .*tears|chargeable tears|weapon)\b/i, 'new-system', 0.85, 'Requires bounded weapon replacement/compatibility system'),
  rule('actor.familiar', 'actor', /\b(?:familiars?|orbitals?)\b/i, 'new-system', 0.86, 'Generic familiar primitives exist; item-specific AI is not presumed supported'),
  rule('actor.wisp', 'actor', /\bwisps?\b/i, 'new-system', 0.95, 'Requires bounded wisp lifecycle/ownership system'),
  rule('actor.fly', 'actor', /\b(?:flies|fly|locusts?)\b/i, 'supported', 0.85, 'content-contract/capabilities.json: friendlies.attack_fly; locust variants need review'),
  rule('actor.spider', 'actor', /\bspiders?\b/i, 'supported', 0.9, 'content-contract/capabilities.json: friendlies.spider'),
  rule('actor.summon', 'actor', /\bsummons?\b/i, 'new-system', 0.7, 'Summon identity and ownership unknown'),
  rule('field.creep', 'field', /\bcreep\b/i, 'new-system', 0.95, 'Requires bounded persistent floor-effect system'),
  rule('field.aura', 'field', /\bauras?\b/i, 'supported', 0.88, 'content-contract/capabilities.json: auras; exact aura behavior requires review'),
  rule('field.beam', 'field', /\b(?:beams?|lasers?)\b/i, 'supported', 0.85, 'content-contract/capabilities.json: systems.laser; geometry requires review'),
  rule('field.trail', 'field', /\btrails?\b/i, 'new-system', 0.85, 'Requires bounded trailing field system'),
  rule('field.explosion', 'field', /\b(?:explosions?|explodes?)\b/i, 'new-system', 0.9, 'Explosion damage/source attribution needs review'),
  rule('economy.pickup', 'economy', /\b(?:coins?|keys?|bombs?|pickups?|pills?|cards?)\b/i, 'new-system', 0.7, 'Pickup spawn/grant/consume are distinct operations; manual review'),
  rule('economy.charge', 'economy', /\b(?:charges?|recharges?|batter(?:y|ies))\b/i, 'new-system', 0.85, 'Charge grant/threshold/slot semantics require review'),
  rule('economy.shop_deal', 'economy', /\b(?:shops?|prices?|(?:devil|angel) (?:rooms?|deals?)|deals? (?:with|from) (?:the )?(?:devil|angel))\b/i, 'new-system', 0.88, 'Requires bounded pricing/deal policy system'),
  rule('economy.reroll', 'economy', /\brerolls?\b/i, 'new-system', 0.95, 'Requires bounded reroll and ownership reconciliation'),
  rule('economy.pool_room', 'economy', /\b(?:item pools?|room drops?|room rewards?)\b/i, 'new-system', 0.88, 'Requires bounded pool/reward policy system'),
  rule('lifecycle.duration', 'lifecycle', /\b(?:\d+(?:\.\d+)? seconds?|duration|temporary|temporarily)\b/i, 'new-system', 0.9, 'Duration and cleanup must be tied to source ownership'),
  rule('lifecycle.room', 'lifecycle', /\b(?:for (?:the|this|current) room|until .*exit .*room|persists? between rooms)\b/i, 'new-system', 0.88, 'Review room lifetime and cleanup semantics'),
  rule('lifecycle.floor', 'lifecycle', /\b(?:for (?:the|this|current) floor|every floor|next floor)\b/i, 'new-system', 0.88, 'Requires floor transition lifetime policy'),
  rule('lifecycle.run', 'lifecycle', /\b(?:rest of the run|permanent|permanently)\b/i, 'new-system', 0.9, 'Requires persisted, source-aware run policy'),
  rule('lifecycle.stacking', 'lifecycle', /\b(?:stacks?|stacking|per copy)\b/i, 'new-system', 0.9, 'Stack cap and removal semantics need explicit design'),
  rule('lifecycle.transformation', 'lifecycle', /\b(?:transforms?|transformation)\b/i, 'new-system', 0.85, 'Requires transformation tracking system'),
  rule('synergy.item', 'synergy', /\[collectible:\d+\]|\b(?:with (?:another|the) item|synerg(?:y|ies))\b/i, 'new-system', 0.85, 'Cross-item dependency; item icon references may only be comparisons'),
  rule('synergy.character', 'synergy', /\b(?:as (?:the lost|the keeper|azazel)|tainted|greed mode|co-op)\b/i, 'new-system', 0.88, 'Character/mode override requires dedicated compatibility review'),
  rule('synergy.weapon_override', 'synergy', /\b(?:instead of tears|replaces? .*weapon|overrides?)\b/i, 'new-system', 0.85, 'Weapon override precedence requires explicit policy'),
  rule('excluded.ui_level', 'economy', /\b(?:custom (?:crafting )?menu|arbitrary (?:code|lua)|executes? (?:code|lua)|changes? (?:the )?level layout|rewrites? (?:the )?floor|bespoke ui)\b/i, 'excluded', 0.95, 'Outside generator primitive boundary: arbitrary code, bespoke UI or level mutation'),
];

export function classifyDescription(sourceText) {
  const normalized = normalizeDescription(sourceText);
  const clauses = normalized.clauses.map(clause => {
    const candidates = RULES.flatMap(candidate => {
      const match = clause.text.match(candidate.pattern);
      return match ? [{ tag: candidate.id, category: candidate.category, disposition: candidate.disposition, confidence: candidate.confidence, evidence: candidate.evidence, matchedText: match[0], full: candidate.full }] : [];
    });
    const exactCategories = new Set(candidates.filter(match => match.full).map(match => match.category));
    const matches = candidates.filter(match => match.full || !exactCategories.has(match.category));
    const complete = clause.unknownMarkup.length === 0 && matches.some(match => match.full);
    return { ...clause, matches, coverage: complete ? 'full' : matches.length ? 'partial' : 'unknown', requiresReview: !complete };
  });
  const mechanics = clauses.flatMap(clause => clause.matches.map(match => ({ ...match, clauseIndex: clause.index })));
  const unknownClauses = clauses.filter(clause => clause.requiresReview);
  let disposition = 'supported';
  let reason = 'All clauses match narrow supported primitives; not an exact item recreation or balance guarantee.';
  if (mechanics.some(mechanic => mechanic.disposition === 'excluded')) {
    disposition = 'excluded'; reason = 'Explicit generator-boundary exclusion; retain source for review.';
  } else if (!sourceText.trim() || unknownClauses.length || mechanics.some(mechanic => mechanic.disposition === 'new-system')) {
    disposition = 'new-system'; reason = 'Missing, partial or unknown semantics remain; manual review/new bounded design required, not a claim of feasibility.';
  } else if (clauses.some(clause => clause.matches.some(match => match.full && match.disposition === 'reusable'))) {
    disposition = 'reusable'; reason = 'Narrow bounded primitive candidate, not implemented or validated live.';
  }
  const conditionalPhrases = clauses.filter(clause => clause.matches.some(match => ['trigger', 'condition'].includes(match.category))).map(clause => ({ index: clause.index, source: clause.source, text: clause.text }));
  return {
    ...normalized, clauses, mechanics, conditionalPhrases, unknownClauses,
    tags: [...new Set(mechanics.map(mechanic => mechanic.tag))].sort(),
    disposition, dispositionLabel: DISPOSITIONS[disposition], reason,
    confidence: unknownClauses.length || !sourceText.trim() ? 0 : Math.min(...mechanics.map(mechanic => mechanic.confidence)),
  };
}

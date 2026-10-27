import { readFileSync } from 'node:fs';

export const expandedEffects = JSON.parse(readFileSync(new URL('../content-contract/expanded-effects.json', import.meta.url), 'utf8'));
export const expandedActionTypes = Object.freeze(Object.keys(expandedEffects.actions));
export const expandedActionSchemas = Object.fromEntries(Object.entries(expandedEffects.actions).map(([type, spec]) => [type, {
  type: 'object', additionalProperties: false,
  required: ['type', ...Object.keys(spec.params)],
  properties: { type: { const: type }, ...Object.fromEntries(Object.entries(spec.params).map(([name, parameter]) => [name,
    parameter.enum ? { type: 'string', enum: parameter.enum } : {
      type: parameter.integer ? 'integer' : 'number', minimum: parameter.min, maximum: parameter.max,
    },
  ])) },
}]));
export const expandedActionSchema = { anyOf: Object.values(expandedActionSchemas) };

export function validateExpandedAction(action, trigger) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return ['action must be an object'];
  const spec = Object.hasOwn(expandedEffects.actions, action.type) && expandedEffects.actions[action.type];
  if (!spec) return ['unknown expanded action'];
  const errors = [];
  if (!spec.triggers.includes(trigger)) errors.push('incompatible trigger: ' + trigger);
  for (const name of Object.keys(action)) {
    if (name !== 'type' && !Object.hasOwn(spec.params, name)) errors.push('unknown parameter: ' + name);
  }
  for (const [name, parameter] of Object.entries(spec.params)) {
    const value = action[name];
    if (parameter.enum ? !parameter.enum.includes(value) :
      typeof value !== 'number' || !Number.isFinite(value) || value < parameter.min || value > parameter.max || (parameter.integer && !Number.isInteger(value))) {
      errors.push('invalid ' + name);
    }
  }
  return errors;
}

export function expandedActionWeight(action) {
  const spec = Object.hasOwn(expandedEffects.actions, action?.type) && expandedEffects.actions[action.type];
  if (!spec || validateExpandedAction(action, spec.triggers[0]).length) throw new Error('Invalid expanded action');
  return spec.base_weight + Object.entries(spec.params).reduce((total, [name, parameter]) => total + (parameter.weight || 0) * (typeof action[name] === 'number' ? action[name] : 0), 0);
}

export function summarizeExpandedAction(action) {
  expandedActionWeight(action);
  const descriptions = {
    extra_tears: () => 'fires ' + action.count + ' plain extra tears in a ' + action.pattern + ' (' + action.damage + ' damage each)',
    execute_enemy: () => 'executes one ordinary vulnerable nonboss hit enemy at or below ' + (action.hp_ratio * 100) + '% observed current/max HP, excluding mortal buffered damage',
    target_impulse: () => (action.direction === 'pull' ? 'pulls' : 'pushes') + ' the hit enemy (strength ' + action.strength + ')',
    block_projectiles: () => 'blocks up to ' + action.count + ' nearby hostile projectiles within ' + action.radius,
    reflect_projectiles: () => 'returns up to ' + action.count + ' ordinary hostile projectiles within ' + action.radius + ' as plain owned tears (' + action.damage + ' damage each, speed ' + action.speed + ')',
    dash: () => 'dashes in the movement direction at speed ' + action.speed + ', without invulnerability',
    coins_to_charge: () => 'spends ' + action.cost + ' coins for up to ' + action.charge + ' primary active charges',
    temporary_ally: () => 'summons one temporary charmed pooter for ' + action.duration + ' frames (owner cap 2)',
  };
  return descriptions[action.type]() + ' (cooldown ' + action.cooldown + ' frames after success)';
}

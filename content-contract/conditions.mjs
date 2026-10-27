import capabilities from './capabilities.json' with { type: 'json' };

export const eventContexts = capabilities.event_contexts;
export const conditionRegistry = Object.fromEntries(Object.entries(capabilities.condition_registry).map(([name, definition]) => [name, {
  ...definition,
  params: Object.fromEntries(Object.entries(definition.params).map(([parameter, specification]) => {
    const { enum_ref: enumReference, ...resolved } = specification;
    if (enumReference) {
      const values = capabilities[enumReference];
      resolved.enum = Array.isArray(values) ? values : values && typeof values === 'object' ? Object.keys(values) : undefined;
    }
    return [parameter, resolved];
  })),
}]));
export const conditionNames = Object.keys(conditionRegistry);
export const conditionParams = Object.fromEntries(conditionNames.map(name => [name, Object.keys(conditionRegistry[name].params)]));

export function assertConditionRegistry() {
  const contexts = [...capabilities.triggers, 'on_kill', 'tear_impact', 'collision'];
  if (JSON.stringify(Object.keys(eventContexts).sort()) !== JSON.stringify(contexts.sort())) throw Error('Condition event contexts drifted from supported triggers/procs.');
  for (const [name, definition] of Object.entries(conditionRegistry)) {
    if (definition.summary !== undefined && typeof definition.summary !== 'string') throw Error('Invalid condition summary: ' + name);
    if (!['pure', 'probability', 'latch'].includes(definition.category) || !['event', 'target', 'room', 'floor', 'run'].includes(definition.scope) || !definition.guidance) throw Error('Invalid condition metadata: ' + name);
    if (!definition.contexts.length || new Set(definition.contexts).size !== definition.contexts.length) throw Error('Invalid condition contexts: ' + name);
    for (const context of definition.contexts) {
      const fields = eventContexts[context];
      if (!fields || definition.requires.some(field => ![...fields.fields, ...fields.optional_fields].includes(field))) throw Error('Unsupported condition context: ' + name + '/' + context);
    }
    for (const specification of Object.values(definition.params)) {
      if (!['number', 'integer', 'string'].includes(specification.type) || typeof specification.required !== 'boolean') throw Error('Invalid condition parameter: ' + name);
      if (specification.type === 'string' ? !Array.isArray(specification.enum) || !specification.enum.length : !Number.isFinite(specification.minimum) || !Number.isFinite(specification.maximum) || specification.minimum > specification.maximum) throw Error('Invalid condition parameter bounds: ' + name);
    }
  }
}
assertConditionRegistry();

export function buildConditionSchema(registry) {
  const result = {
    type: 'object', additionalProperties: false, required: ['type'],
    properties: { type: { type: 'string', enum: Object.keys(registry) } },
  };
  for (const definition of Object.values(registry)) {
    for (const [parameter, specification] of Object.entries(definition.params)) {
      const { required, ...schema } = specification;
      const previous = result.properties[parameter];
      if (!previous) result.properties[parameter] = schema;
      else if (previous.type !== schema.type) throw Error('Conflicting condition parameter type: ' + parameter);
      else if (schema.type === 'string') previous.enum = [...new Set([...previous.enum, ...schema.enum])];
      else {
        previous.minimum = Math.min(previous.minimum, schema.minimum);
        previous.maximum = Math.max(previous.maximum, schema.maximum);
      }
    }
  }
  return result;
}
export const conditionSchema = buildConditionSchema(conditionRegistry);

export function validateCondition(condition, context, location = 'condition') {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) throw Error(location + ' must be an object.');
  const definition = Object.hasOwn(conditionRegistry, condition.type) && conditionRegistry[condition.type];
  if (!definition) throw Error(location + ': unsupported condition ' + String(condition.type));
  if (!definition.contexts.includes(context)) throw Error(location + ': ' + condition.type + ' is incompatible with ' + String(context) + '; requires ' + definition.requires.join(', '));
  for (const parameter of Object.keys(condition)) {
    if (parameter !== 'type' && !Object.hasOwn(definition.params, parameter)) throw Error(location + '.' + parameter + ' is unsupported for ' + condition.type);
  }
  for (const [parameter, specification] of Object.entries(definition.params)) {
    const value = condition[parameter];
    if (value === undefined && !specification.required) continue;
    const valid = specification.type === 'string'
      ? specification.enum.includes(value)
      : typeof value === 'number' && Number.isFinite(value) && value >= specification.minimum && value <= specification.maximum && (specification.type !== 'integer' || Number.isInteger(value));
    if (!valid) throw Error(location + '.' + parameter + ' is invalid for ' + condition.type + ' on ' + context);
  }
}

export const conditionGuidance = 'Condition contract: ' + JSON.stringify(conditionRegistry) + '. Never remove a condition to repair an incompatible event; choose a supported context or reject the design.';
export const luaConditionMetadata = { conditions: conditionRegistry, contexts: eventContexts };

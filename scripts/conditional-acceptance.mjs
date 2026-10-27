import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { conditionNames } from '../content-contract/conditions.mjs';
import { expandedActionTypes } from '../bridge/expanded-effects.mjs';
import { MOD_FILES } from '../bridge/sync-mod.mjs';
import { RUNTIME_CONTRACT } from '../bridge/compatibility.mjs';
import { POWER_CONTRACT_VERSION } from '../content-contract/powers.mjs';
import capabilities from '../content-contract/capabilities.json' with { type: 'json' };

export const acceptanceSourceFiles = Object.freeze([
  ...MOD_FILES.map(file => 'demo/live-sprite-swap/' + file),
  ...['compatibility', 'generate', 'power-planner', 'power-design', 'power-context', 'prompt-features', 'runtime', 'weights', 'expanded-effects', 'selection-priors'].map(file => 'bridge/' + file + '.mjs'),
  ...['capabilities', 'expanded-conditions', 'expanded-effects', 'power-catalog', 'selection-priors'].map(file => 'content-contract/' + file + '.json'),
  'content-contract/conditions.mjs', 'content-contract/powers.mjs',
].sort());

export function readAcceptanceBuild() {
  const manifest = acceptanceSourceFiles.map(file => [file,
    createHash('sha256').update(readFileSync(new URL('../' + file, import.meta.url))).digest('hex')]);
  return {
    runtime_contract: RUNTIME_CONTRACT, capabilities_version: capabilities.version,
    power_contract: POWER_CONTRACT_VERSION,
    product_source_sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  };
}

export const currentAcceptanceBuild = Object.freeze(readAcceptanceBuild());

export const lifecycleCases = [
  'co_op', 'continue', 'source_removal', 'reroll', 'piercing_multihit',
  'simultaneous_kills', 'weapon_tear', 'weapon_bomb', 'weapon_laser',
  'weapon_knife', 'weapon_familiar', 'creator', 'generator_q0',
  'generator_q1', 'generator_q2', 'generator_q3', 'generator_q4', 'singularity',
  'explosion_immunity', 'explosive_tear_safety', 'weapon_tint',
  'repeatable_luck_procs', 'summon_accumulation', 'friendly_creep', 'health_safety',
];

function recordedUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value)) return NaN;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 19) !== value.slice(0, 19)) return NaN;
  return timestamp;
}

export function buildLiveAcceptanceReport(evidence, { conditions = conditionNames, effects = expandedActionTypes, now = new Date() } = {}) {
  const expectedBuild = currentAcceptanceBuild;
  const required = [
    ...conditions.map(name => 'condition.' + name),
    ...effects.map(name => 'effect.' + name),
    ...lifecycleCases.map(name => 'lifecycle.' + name),
  ];
  const scenarioRequirements = Object.fromEntries(required.map(name => [name, name.startsWith('condition.')
    ? (/_at_(?:most|least)$/.test(name) ? ['satisfying', 'failing', 'boundary', 'adjacent'] : ['satisfying', 'failing'])
    : ['behavior']]));
  const observations = evidence?.observations;
  const problems = [];
  const passedScenarios = new Set();
  if (!Array.isArray(observations)) problems.push('No live observations supplied. Automated tests are not live-game evidence.');
  for (const [index, observation] of (Array.isArray(observations) ? observations : []).entries()) {
    const location = 'observations[' + index + ']';
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      problems.push(location + ' must be an observation object.');
      continue;
    }
    const fields = ['case', 'game_version', 'repentogon_version', 'character', 'trigger', 'expected', 'observed', 'recorded_at'];
    const conditionCase = typeof observation.case === 'string' && observation.case.startsWith('condition.');
    if (conditionCase) fields.push('scenario');
    const missing = fields.filter(field => typeof observation[field] !== 'string' || !observation[field].trim());
    const recorded = recordedUtc(observation.recorded_at);
    const buildMatches = observation.build && typeof observation.build === 'object' && !Array.isArray(observation.build)
      && Object.keys(expectedBuild).every(field => observation.build[field] === expectedBuild[field]);
    const safeSlot = observation.save_slot === 2 || observation.save_slot === 3;
    const hasSession = typeof observation.session === 'string' && observation.session.trim().length > 0;
    if (!buildMatches) problems.push(location + ' requires the current runtime, capabilities, power contract and product source hash in build.');
    if (!safeSlot) problems.push(location + ' requires disposable Save File 2 or 3.');
    if (!hasSession) problems.push(location + ' requires the actual running-game session identity.');
    if (missing.length) problems.push(location + ' is missing ' + missing.join(', ') + '.');
    if (!Number.isFinite(recorded) || recorded > now.getTime()) problems.push(location + ' requires a valid non-future UTC recorded_at timestamp.');
    if (!required.includes(observation.case)) problems.push(location + ' names an unknown acceptance case.');
    const scenario = observation.scenario ?? (conditionCase ? undefined : 'behavior');
    const validScenario = Object.hasOwn(scenarioRequirements, observation.case ?? '') && scenarioRequirements[observation.case].includes(scenario);
    if (!validScenario) problems.push(location + ' requires a scenario from its case requirements.');
    if (observation.passed !== true) problems.push(location + ' did not pass.');
    if (!missing.length && buildMatches && safeSlot && hasSession && Number.isFinite(recorded) && recorded <= now.getTime() && observation.passed === true && validScenario) passedScenarios.add(observation.case + ':' + scenario);
  }
  const missingScenarios = Object.fromEntries(required.map(name => [name,
    scenarioRequirements[name].filter(scenario => !passedScenarios.has(name + ':' + scenario)),
  ]).filter(([, scenarios]) => scenarios.length));
  const missing = Object.keys(missingScenarios);
  return {
    version: 3, generated_at: now.toISOString(), status: missing.length || problems.length ? 'blocked' : 'passed',
    expected_build: { ...expectedBuild }, source_files: [...acceptanceSourceFiles],
    required_count: required.length, observed_count: required.length - missing.length, missing, problems,
    scenario_requirements: scenarioRequirements, missing_scenarios: missingScenarios,
    required_scenario_count: Object.values(scenarioRequirements).reduce((total, scenarios) => total + scenarios.length, 0),
    observed_scenario_count: passedScenarios.size,
    note: 'This report validates the completeness of supplied observations, not their authenticity. Never synthesize live observations from mocks.',
  };
}

export function buildLiveAcceptanceTemplate(cases = [], options = {}) {
  const report = buildLiveAcceptanceReport(undefined, options);
  for (const name of cases) if (!Object.hasOwn(report.scenario_requirements, name)) throw Error('Unknown acceptance case: ' + name);
  const selected = new Set(cases.length ? cases : Object.keys(report.scenario_requirements));
  return {
    version: 1, kind: 'unobserved_template', expected_build: report.expected_build,
    instructions: 'This is not evidence. Verify the loaded runtime and installed source after restart, then record actual session, save slot, build and observations. Leave untested rows unpassed; preserve failures.',
    observations: Object.entries(report.scenario_requirements).filter(([name]) => selected.has(name)).flatMap(([name, scenarios]) => scenarios.map(scenario => ({
      case: name, scenario, build: null, save_slot: null, session: '', game_version: '', repentogon_version: '',
      character: '', trigger: '', expected: '', observed: '', recorded_at: '', passed: false,
    }))),
  };
}

export function renderLiveAcceptanceReport(report) {
  return [
    '# Conditional expansion live acceptance', '',
    'Status: **' + report.status + '**. ' + report.observed_count + '/' + report.required_count + ' required cases recorded.', '',
    report.observed_scenario_count + '/' + report.required_scenario_count + ' required scenarios recorded. A condition case requires every listed scenario.', '',
    report.note, '',
    'Runtime contract: ' + report.expected_build.runtime_contract + '; capabilities: ' + report.expected_build.capabilities_version + '; power contract: ' + report.expected_build.power_contract + '.', '',
    'Required product source SHA-256: ' + report.expected_build.product_source_sha256, '',
    '## Missing observations', '',
    ...(report.missing.length ? report.missing.map(name => '- ' + name) : ['None.']), '',
    '## Missing scenarios', '',
    ...(Object.keys(report.missing_scenarios).length ? Object.entries(report.missing_scenarios).map(([name, scenarios]) => '- ' + name + ': ' + scenarios.join(', ')) : ['None.']), '',
    '## Evidence problems', '',
    ...(report.problems.length ? report.problems.map(problem => '- ' + problem) : ['None.']), '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] === '--template') {
    if (!process.argv[3]) throw Error('Supply a new template output filename.');
    const template = buildLiveAcceptanceTemplate(process.argv.slice(4));
    const output = path.resolve(process.argv[3]);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
    console.log('Created unobserved template: ' + template.observations.length + ' unpassed scenarios; ' + output);
  } else {
  const input = path.resolve(process.argv[2] || 'work/conditional-acceptance/live.json');
  const output = path.resolve(process.argv[3] || 'work/conditional-acceptance');
  let evidence;
  try { evidence = JSON.parse(await readFile(input, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const report = buildLiveAcceptanceReport(evidence);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(output, 'report.md'), renderLiveAcceptanceReport(report));
  console.log(report.status + ': ' + report.observed_count + '/' + report.required_count + ' live cases; ' + report.observed_scenario_count + '/' + report.required_scenario_count + ' live scenarios; ' + output);
  if (report.status !== 'passed') process.exitCode = 1;
  }
}

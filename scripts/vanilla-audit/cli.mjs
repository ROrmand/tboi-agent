import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseEid, mergeEidLayers, sha256 } from './eid-parser.mjs';
import { classifyDescription, TAXONOMY_VERSION } from './classifier.mjs';
import { buildReport, renderMarkdown } from './report.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const outputRoot = path.join(repository, 'work/vanilla-audit');
export const EDITION_LAYERS = {
  'ab+': ['ab+'], rep: ['ab+', 'rep'], 'rep+': ['ab+', 'rep', 'rep+'], rgon: ['ab+', 'rep', 'rgon'],
};

export async function readInstalledEid(root, edition) {
  if (!Object.hasOwn(EDITION_LAYERS, edition)) throw new Error('--edition must be ab+, rep, rep+, or rgon (explicitly match the runtime)');
  const layers = [];
  for (const layer of EDITION_LAYERS[edition]) {
    const file = path.resolve(root, 'descriptions', layer, 'en_us.lua');
    layers.push(parseEid(await readFile(file, 'utf8'), { sourceName: file }));
  }
  const mainFile = path.resolve(root, 'main.lua');
  const main = await readFile(mainFile, 'utf8');
  const managerFile = path.resolve(root, 'features/eid_language_manager.lua');
  const manager = await readFile(managerFile, 'utf8');
  return {
    ...mergeEidLayers(layers),
    installation: {
      root: path.resolve(root), edition,
      version: main.match(/EID\.ModVersion\s*=\s*([\d.]+)/)?.[1] ?? 'unknown',
      commit: main.match(/EID\.ModVersionCommit\s*=\s*["']([^"']+)/)?.[1] ?? 'unknown',
      mainSha256: sha256(main), languageManagerSha256: sha256(manager),
      layerPolicy: 'ab+ then rep then exactly one of rep+/rgon; verify against installed language manager',
    },
  };
}

async function outputDirectory(relative) {
  const target = relative ? path.resolve(relative) : outputRoot;
  const fromRoot = path.relative(outputRoot, target);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw new Error('--out must stay under work/vanilla-audit');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(outputRoot, '.gitignore'), '*\n', { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  return target;
}

export async function runCli(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    export: { type: 'string' }, eid: { type: 'string', multiple: true }, 'eid-root': { type: 'string' },
    edition: { type: 'string' }, out: { type: 'string' }, fixture: { type: 'boolean' },
    'parse-only': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node scripts/vanilla-audit/cli.mjs --fixture\nnode scripts/vanilla-audit/cli.mjs --export export.json --eid-root <installed-EID> --edition rgon\nnode scripts/vanilla-audit/cli.mjs --eid base.lua --eid overlay.lua --export export.json\nUse --parse-only instead of --export to inspect EID without inventing runtime metadata. Outputs: work/vanilla-audit (or --out subdirectory).');
    return;
  }
  if (values.fixture && (values.export || values.eid || values['eid-root'] || values.edition || values['parse-only'])) throw new Error('--fixture cannot be mixed with external inputs or --parse-only');
  if (values['eid-root'] && values.eid) throw new Error('Choose --eid-root or explicit --eid layers, not both');
  if (values.edition && !values['eid-root']) throw new Error('--edition requires --eid-root');
  if (values['parse-only'] && values.export) throw new Error('--parse-only cannot be mixed with --export');
  const exportFile = values.fixture ? path.join(directory, 'fixtures/itemconfig.json') : values.export;
  if (!values['parse-only'] && !exportFile) throw new Error('Runtime ItemConfig export required; deliberately wire/capture vanilla_audit.lua first, or use --fixture / --parse-only. See README.md.');
  let eid;
  if (values['eid-root']) eid = await readInstalledEid(values['eid-root'], values.edition);
  else {
    const files = values.fixture ? [path.join(directory, 'fixtures/base.lua'), path.join(directory, 'fixtures/rep.lua')] : values.eid;
    if (!files?.length) throw new Error('English EID input required: --eid-root with --edition, or ordered --eid files');
    const layers = [];
    for (const file of files) layers.push(parseEid(await readFile(file, 'utf8'), { sourceName: path.resolve(file) }));
    eid = mergeEidLayers(layers);
  }
  if (values['parse-only']) {
    const target = await outputDirectory(values.out);
    const inventory = { schemaVersion: 1, taxonomyVersion: TAXONOMY_VERSION, kind: 'eid-only-no-runtime-export', provenance: eid.provenance, installation: eid.installation ?? null, overrides: eid.overrides, records: eid.records.map(record => ({ ...record, classification: classifyDescription(record.description) })) };
    await writeFile(path.join(target, 'eid-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    await writeFile(path.join(target, 'eid-status.md'), `# EID-only inventory\n\nParsed ${eid.records.length} distinct description IDs, with ${eid.overrides.length} explicit layer overrides.\n\n**Blocked:** no runtime ItemConfig export supplied. No live collectible count, quality reconciliation, supported-item coverage or frequency-by-quality result is claimed. EID can contain placeholder/unused IDs. See eid-inventory.json for clauses and rule evidence.\n\nInstallation: ${JSON.stringify(eid.installation ?? null)}\n`);
    return { kind: inventory.kind, parsedIds: eid.records.length, output: target };
  }
  const exportText = await readFile(exportFile, 'utf8');
  const capabilityFile = path.join(repository, 'content-contract/capabilities.json');
  const capabilities = await readFile(capabilityFile, 'utf8');
  const report = buildReport(JSON.parse(exportText.replace(/^\uFEFF/, '')), eid, {
    exportSource: { file: path.resolve(exportFile), sha256: sha256(exportText) },
    capabilitySource: { file: capabilityFile, sha256: sha256(capabilities), version: JSON.parse(capabilities).version, policy: 'Static rule evidence references this snapshot; no automatic support inference or profile generation' },
  });
  report.provenance.eidInstallation = eid.installation ?? null;
  const target = await outputDirectory(values.out ?? (values.fixture ? path.join(outputRoot, 'fixture') : undefined));
  await writeFile(path.join(target, 'inventory.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(target, 'inventory.md'), renderMarkdown(report));
  return { kind: report.provenance.runtime.kind, joinedItems: report.summary.joinedItems, reconciled: report.summary.reconciled, output: target };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then(result => { if (result) console.log(JSON.stringify(result)); }).catch(error => { console.error(`vanilla-audit: ${error.message}`); process.exitCode = 1; });
}

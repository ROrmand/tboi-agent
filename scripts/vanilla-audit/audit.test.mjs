import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseEid, mergeEidLayers, sha256 } from './eid-parser.mjs';
import { classifyDescription, normalizeDescription, CATEGORIES, DISPOSITIONS, RULES } from './classifier.mjs';
import { buildReport, renderMarkdown, validateExport } from './report.mjs';
import { readInstalledEid, runCli, EDITION_LAYERS } from './cli.mjs';

const fixture = name => new URL(`./fixtures/${name}`, import.meta.url);
const exported = JSON.parse(await readFile(fixture('itemconfig.json'), 'utf8'));
const base = parseEid(await readFile(fixture('base.lua'), 'utf8'), { sourceName: 'fixture/base.lua' });
const overlay = parseEid(await readFile(fixture('rep.lua'), 'utf8'), { sourceName: 'fixture/rep.lua' });
const eid = mergeEidLayers([base, overlay]);
const report = buildReport(exported, eid);

test('damage dealing does not imply a shop deal; explicit economy phrases still match', () => {
  for (const text of ['Deals 3.5 damage per tear', 'Isaac deals 24 contact damage per second', 'Inflicts damage']) {
    const result = classifyDescription(text);
    assert.ok(result.tags.includes('action.damage'), text);
    assert.ok(!result.tags.includes('economy.shop_deal'), text);
  }
  for (const text of ['Shop prices are reduced', 'Devil Deals cost coins', 'Angel Rooms appear more often', 'A deal with the devil']) {
    assert.ok(classifyDescription(text).tags.includes('economy.shop_deal'), text);
  }
});

test('distinct combat cues remain partial and do not claim complete vanilla support', () => {
  const examples = {
    'action.projectile_reflect': [
      '20% chance to reflect enemy shots',
      'Reflects enemy projectiles',
      'Enemy bullets have a 25% chance to be reflected as concussive tears',
      'Restricts attacks to a melee that reflects shots',
    ],
    'action.projectile_block': ['Blocks enemy projectiles', 'Blocks and attracts enemy shots', 'Blocks shots'],
    'action.extra_tears': ['50% chance to shoot an extra tear backwards', 'Chance to shoot 1-3 extra tears in random directions'],
    'action.player_dash': [
      "Upon use, dashes in the direction of Isaac's movement",
      'Using the item dashes in the direction of movement',
      'Double-tapping a movement key makes Isaac dash',
      'Isaac dashes in the direction he moves',
    ],
    'action.enemy_mark': ['17% chance to shoot tears that mark enemies', 'Marked enemies are targeted by other enemies'],
  };
  for (const [tag, descriptions] of Object.entries(examples)) {
    for (const text of descriptions) {
      const result = classifyDescription(text);
      assert.ok(result.tags.includes(tag), text);
      assert.equal(result.disposition, 'new-system', text);
      assert.equal(result.confidence, 0);
      assert.equal(result.clauses[0].coverage, 'partial');
      assert.equal(result.unknownClauses[0].source, text);
      assert.equal(result.mechanics.find(match => match.tag === tag).full, false);
    }
  }
});

test('combat cue tags do not conflate reflection, shields, actors or mark rewards', () => {
  const rejected = {
    'action.projectile_reflect': ['Blocks enemy shots', 'Reflects lasers', 'A reflection of Isaac'],
    'action.projectile_block': ['A Holy Mantle shield prevents damage once', 'Enemy shots are reflected'],
    'action.extra_tears': ['+2 Tears', 'A cone of slowing light'],
    'action.player_dash': [
      'Dashes in the direction Isaac is shooting',
      'Isaac shoots while a familiar dashes at enemies',
      'A familiar dashes across the room',
    ],
    'action.enemy_mark': ['Killing enemies in the order dictated by the mark grants a pickup', 'Mark of Cain'],
  };
  for (const [tag, descriptions] of Object.entries(rejected)) {
    for (const text of descriptions) assert.ok(!classifyDescription(text).tags.includes(tag), text);
  }
});

test('volley and burst cues do not mistake additive fire rate, impact splitting or unrelated attacks for extra tears', () => {
  for (const text of [
    'Isaac shoots 2 tears at once', 'Shoots two tears in a V-shaped pattern',
    'Shoots 10 bone tears in all directions', 'Shoots 4 extra slowing tears',
    'Releases a burst of tears', 'Shoots a cluster of tears', 'Charges a shotgun attack',
  ]) {
    const result = classifyDescription(text);
    assert.ok(result.tags.includes('action.extra_tears'), text);
    assert.equal(result.disposition, 'new-system');
    assert.equal(result.clauses[0].coverage, 'partial');
  }
  for (const text of ['+2 Tears', 'Shoots 1 tear', 'Extra damage with tears', 'A shotgun bomb',
    'Tears burst into smaller tears on impact', 'Shoot 2 lasers', 'Isaac shoots bombs instead of tears']) {
    assert.ok(!classifyDescription(text).tags.includes('action.extra_tears'), text);
  }
  assert.ok(classifyDescription('Shielded tears destroy enemy projectiles').tags.includes('action.projectile_block'));
  assert.ok(!classifyDescription('Destroy enemies with tears').tags.includes('action.projectile_block'));
  for (const text of ["Wisps shoot tears, do not block shots", "Doesn't block enemy shots", 'Never destroys enemy projectiles']) {
    assert.ok(!classifyDescription(text).tags.includes('action.projectile_block'), text);
  }
  assert.ok(classifyDescription('Does not block shots, but destroys enemy projectiles').tags.includes('action.projectile_block'));
});

test('EID parser handles installed table shapes, comments, literal concatenation and explicit overrides', () => {
  assert.equal(base.records.length, 8);
  assert.equal(eid.records.length, 8);
  assert.equal(eid.overrides.length, 1);
  assert.equal(eid.records[0].description, '↑ {{Tears}} +0.7 Tears');
  assert.equal(eid.records[0].history.length, 2);
  assert.equal(eid.records[0].source.line, 3);
  assert.match(base.provenance.sha256, /^[a-f0-9]{64}$/);
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('quoted and long strings retain punctuation, unicode, escapes, newlines and braces', () => {
  const parsed = parseEid(String.raw`local collectibles = {
    [12] = {"12", 'Isaac\'s "fixture"', "line\n\x41\065\u{2191}\z   end"},
    [13] = {"13", [=[
Long name]=], [==[text { } -- not a comment
second line]==]},
  }`);
  assert.equal(parsed.records[0].name, 'Isaac\'s "fixture"');
  assert.equal(parsed.records[0].description, 'line\nAA↑end');
  assert.equal(parsed.records[1].name, 'Long name');
  assert.equal(parsed.records[1].description, 'text { } -- not a comment\nsecond line');
  assert.equal(parseEid('local collectibles={{"1","x","a\\\nb"}}').records[0].description, 'a\nb');
  assert.equal(parseEid('local collectibles={{"1","{","{"}}').records[0].description, '{');
});

test('parser does not discover tables inside strings or comments and does not evaluate executable Lua', () => {
  assert.throws(() => parseEid('-- collectibles = {}\nlocal decoy="collectibles = {}"'), /no supported/);
  for (const expression of ['os.execute("bad")', 'someVariable', '"a" .. getDescription()', 'function() return "x" end', '1+2']) {
    assert.throws(() => parseEid(`local collectibles={{"1","x",${expression}}}`), /literal|separator|expression/);
  }
  assert.throws(() => parseEid('local collectibles={{"1","x","bad\\q"}}'), /escape/);
  assert.throws(() => parseEid('local collectibles={{"1","x","oops'), /Unterminated/);
  assert.throws(() => parseEid('--[=[ unterminated'), /Unterminated/);
});

test('duplicate table keys, duplicate IDs and key/ID disagreement fail closed', () => {
  assert.throws(() => parseEid('local collectibles={[1]={"1","x","a"},[1]={"1","y","b"}}'), /Duplicate table key/);
  assert.throws(() => parseEid('local collectibles={{"1","x","a"},{"1","y","b"}}'), /duplicate collectible ID/);
  assert.throws(() => parseEid('local collectibles={[2]={"1","x","a"}}'), /mismatch/);
  assert.throws(() => parseEid('local collectibles={{"1","x","a","extra"}}'), /three strings/);
  assert.throws(() => mergeEidLayers([{ records: [...base.records, base.records[0]] }]), /Duplicate collectible ID/);
  assert.throws(() => buildReport(exported, { ...eid, records: [...eid.records, eid.records[0]] }), /duplicate collectible ID/);
});

test('normalization preserves source, clause positions, unknown markup and unbalanced tokens', () => {
  const source = '{{ColorRed}}↑ {{Damage}} +1 Damage{{CR}}#{{Collectible123}} synergy#{{Future|arg}} abc#{{unfinished';
  const normalized = normalizeDescription(source);
  assert.equal(normalized.sourceText, source);
  assert.equal(normalized.clauses.length, 4);
  assert.equal(normalized.clauses[0].text, 'up damage +1 Damage');
  assert.equal(normalized.clauses[1].text, '[collectible:123] synergy');
  assert.deepEqual(normalized.clauses[2].unknownMarkup, ['{{Future|arg}}']);
  assert.deepEqual(normalized.clauses[3].unknownMarkup, ['unbalanced markup']);
  assert.equal(normalized.clauses[2].source, '{{Future|arg}} abc');
});

test('taxonomy separates all nine dimensions and records rule evidence and confidence', () => {
  const classified = classifyDescription('Taking damage spawns a familiar wisp, fly and spider with an aura, creep, beam, trail and explosion for 3 seconds#If at low health, rerolls shop item pools#{{Collectible1}} overrides weapon in Greed mode');
  assert.deepEqual([...new Set(classified.mechanics.map(match => match.category))].sort(), [...CATEGORIES].sort());
  for (const match of classified.mechanics) {
    assert.ok(match.confidence > 0 && match.confidence <= 1);
    assert.ok(match.evidence && match.matchedText);
    assert.ok(Number.isInteger(match.clauseIndex));
  }
  assert.ok(classified.conditionalPhrases.length >= 2);
  assert.equal(classified.disposition, 'new-system');
  assert.equal(new Set(RULES.map(rule => rule.id)).size, RULES.length);
});

test('all four dispositions are emitted conservatively; partial keywords never imply full support', () => {
  const examples = {
    supported: 'Homing tears', reusable: 'Tears orbit the nearest enemy',
    'new-system': 'Rerolls all items', excluded: 'Opens a custom crafting menu',
  };
  for (const [disposition, description] of Object.entries(examples)) {
    const classified = classifyDescription(description);
    assert.equal(classified.disposition, disposition);
    assert.equal(classified.dispositionLabel, DISPOSITIONS[disposition]);
  }
  assert.equal(classifyDescription('↑ {{Tears}} +0.7 Tears').disposition, 'supported');
  assert.ok(classifyDescription('↑ {{Tears}} +0.7 Tears').mechanics.every(match => match.disposition === 'supported'));
  for (const text of ['Homing tears but rewrites reality', '{{Unknown}} Homing tears', '', 'Unknown wobble']) {
    const classified = classifyDescription(text);
    assert.equal(classified.disposition, 'new-system');
    assert.ok(classified.unknownClauses.length);
    assert.equal(classified.confidence, 0);
  }
});

test('join covers exactly exported IDs including hidden/missing/empty descriptions; EID-only rows stay out', () => {
  assert.deepEqual(report.rows.map(row => row.id), exported.collectibles.map(row => row.id));
  assert.equal(report.rows.length, new Set(report.rows.map(row => row.id)).size);
  assert.deepEqual(report.summary.eidOnlyIds, [10]);
  const missing = report.rows.find(row => row.id === 7);
  assert.equal(missing.descriptionMissing, true);
  assert.equal(missing.itemConfigDescription, 'Not an EID substitute');
  assert.equal(missing.hidden, true);
  assert.equal(missing.itemConfigTags, 32);
  assert.equal(missing.sourceText, '');
  assert.equal(missing.disposition, 'new-system');
  assert.equal(report.rows.find(row => row.id === 9).descriptionMissing, true);
  assert.equal(report.summary.missingDescriptions, 2);
  assert.equal(report.rows.find(row => row.id === 5).unknownClauses[0].source, '{{UnfamiliarToken}} Warps the wobble');
});

test('qualities 0-4 reconcile; tag frequencies deduplicate repeated clauses and include missing rows in denominators', () => {
  assert.equal(report.summary.reconciled, true);
  assert.deepEqual(report.summary.qualityReconciliation.map(row => row.exported), [2, 1, 2, 1, 2, 0]);
  assert.ok(report.summary.qualityReconciliation.every(row => row.delta === 0));
  const frequency = report.frequencies.find(row => row.tag === 'tear.homing');
  assert.equal(frequency.itemCount, 2);
  assert.equal(frequency.clauseOccurrences, 3);
  assert.equal(frequency.byQuality[2], 1);
  assert.equal(frequency.fractionByQuality[4], 0.5);
  assert.equal(frequency.fractionByQuality.other, null);
  assert.equal(Object.values(report.summary.dispositions).reduce((sum, count) => sum + count, 0), report.rows.length);
});

test('reflection frequencies count items by quality, not repeated clauses or blocking', () => {
  const descriptions = structuredClone(eid);
  for (const record of descriptions.records) record.description = 'Unclassified fixture';
  descriptions.records.find(record => record.id === 1).description = 'Reflects enemy shots#Enemy shots are reflected';
  descriptions.records.find(record => record.id === 2).description = 'Reflects enemy projectiles';
  descriptions.records.find(record => record.id === 3).description = 'Blocks enemy shots';
  const result = buildReport(exported, descriptions);
  const reflected = result.frequencies.find(frequency => frequency.tag === 'action.projectile_reflect');
  assert.equal(reflected.itemCount, 2);
  assert.equal(reflected.clauseOccurrences, 3);
  assert.deepEqual(reflected.byQuality, { 0: 1, 1: 1, 2: 0, 3: 0, 4: 0, other: 0 });
  assert.equal(reflected.fractionByQuality[0], 0.5);
  assert.equal(result.frequencies.find(frequency => frequency.tag === 'action.projectile_block').itemCount, 1);
  assert.ok(result.rows.slice(0, 3).every(row => row.disposition === 'new-system' && row.unknownClauses.length));
});

test('invalid exports fail rather than silently dropping IDs or pretending quality reconciliation', () => {
  for (const [mutate, expected] of [
    [copy => copy.collectibles.push(copy.collectibles[0]), /duplicate collectible ID/],
    [copy => copy.counts.quality[4]++, /quality 4/],
    [copy => copy.counts.total++, /total count/],
    [copy => delete copy.provenance.gameVersion, /provenance/],
    [copy => copy.scope.absentIds.push(1), /absent ID/],
    [copy => copy.scope.absentIds.pop(), /unaccounted IDs/],
    [copy => copy.collectibles[0].id = 99, /outside declared/],
    [copy => copy.collectibles[0].quality = null, /metadata/],
    [copy => copy.schemaVersion++, /schemaVersion/],
  ]) {
    const copy = structuredClone(exported);
    mutate(copy);
    assert.throws(() => validateExport(copy), expected);
  }
});

test('out-of-range quality remains visible in other bucket without contaminating quality 0-4', () => {
  const copy = structuredClone(exported);
  copy.collectibles[0].quality = 7;
  copy.counts.quality[0]--;
  copy.counts.quality.other++;
  const result = buildReport(copy, eid);
  assert.equal(result.rows[0].quality, 7);
  assert.deepEqual(result.summary.qualityReconciliation.at(-1), { quality: 'other', exported: 1, joined: 1, delta: 0 });
});

test('Markdown retains source clauses and exposes metadata, counts, conditions, unknowns and dispositions', () => {
  const markdown = renderMarkdown(report);
  for (const text of ['fixture', 'Quality reconciliation', 'Mechanic frequency by quality', 'Conditional phrases', 'Unknown / partial', 'UnfamiliarToken', 'Taking damage', 'ItemConfig tags', 'supported now', 'reusable and safe to add', 'new bounded runtime system', 'excluded']) assert.ok(markdown.includes(text), text);
  const copy = structuredClone(report);
  copy.rows[0].name = '<script>bad</script>|`';
  assert.ok(!renderMarkdown(copy).includes('<script>'));
  assert.match(renderMarkdown(copy), /&lt;script&gt;/);
});

test('installed-edition policy uses rgon INSTEAD OF rep+ and is tested entirely with temporary local files', async () => {
  assert.deepEqual(EDITION_LAYERS.rgon, ['ab+', 'rep', 'rgon']);
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanilla-audit-eid-'));
  try {
    for (const layer of ['ab+', 'rep', 'rep+', 'rgon']) {
      const target = path.join(root, 'descriptions', layer);
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'en_us.lua'), `local collectibles={[1]={"1","fixture","${layer}"}}`);
    }
    await mkdir(path.join(root, 'features'));
    await writeFile(path.join(root, 'main.lua'), 'EID.ModVersion = 1.25\nEID.ModVersionCommit = "fixture"');
    await writeFile(path.join(root, 'features/eid_language_manager.lua'), 'synthetic loader provenance');
    const result = await readInstalledEid(root, 'rgon');
    assert.equal(result.records[0].description, 'rgon');
    assert.equal(result.records[0].history.length, 3);
    assert.equal(result.installation.version, '1.25');
    assert.equal(result.installation.commit, 'fixture');
    assert.equal(result.provenance.some(layer => layer.file.includes('rep+')), false);
    await assert.rejects(readInstalledEid(root, undefined), /edition/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI is fail-closed for missing live data and conflicting input modes', async () => {
  await assert.rejects(runCli([]), /Runtime ItemConfig export required/);
  await assert.rejects(runCli(['--fixture', '--export', 'x']), /cannot be mixed/);
  await assert.rejects(runCli(['--parse-only', '--export', 'x']), /cannot be mixed/);
  await assert.rejects(runCli(['--parse-only', '--eid-root', 'x', '--eid', 'x']), /not both/);
  await assert.rejects(runCli(['--fixture', '--out', os.tmpdir()]), /under work\/vanilla-audit/);
});

test('CLI writes deterministic fixture JSON/Markdown under isolated generated output only', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1')), '../../work/vanilla-audit');
  await mkdir(root, { recursive: true });
  const output = await mkdtemp(path.join(root, 'test-'));
  try {
    const first = await runCli(['--fixture', '--out', output]);
    assert.equal(first.kind, 'fixture');
    const json = await readFile(path.join(output, 'inventory.json'), 'utf8');
    const parsed = JSON.parse(json);
    assert.equal(parsed.summary.reconciled, true);
    assert.equal(parsed.provenance.runtime.kind, 'fixture');
    assert.equal(parsed.summary.joinedItems, 8);
    await runCli(['--fixture', '--out', output]);
    assert.equal(await readFile(path.join(output, 'inventory.json'), 'utf8'), json);
    assert.match(await readFile(path.join(output, 'inventory.md'), 'utf8'), /synthetic-fixture/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

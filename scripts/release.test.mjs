import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { releaseFiles, buildRelease } from './build-release.mjs';
import { root, exists } from './setup/common.mjs';

test('release allowlist excludes user data, native builds, and tests', async () => {
  const files = await releaseFiles();
  assert.ok(files.includes('.env.example'));
  assert.ok(files.includes('scripts/setup/cli.mjs'));
  assert.ok(files.includes('demo/live-sprite-swap/main.lua'));
  for (const file of files) {
    assert.ok(!file.endsWith('.test.mjs'), file);
    assert.ok(!/^(?:node_modules|work|runtime|\.git|\.reference-repentogon)\//.test(file), file);
    assert.notEqual(file, '.env');
    assert.ok(!file.endsWith('.pdb'), file);
    assert.ok(!file.includes('generated_slot_'), file);
    assert.equal(await exists(path.join(root, file)), true, file);
  }
});
test('release documentation allowlist excludes archives and source-only developer docs', async () => {
  const files = await releaseFiles();
  assert.deepEqual(files.filter(file => file.startsWith('docs/')), [
    'docs/AGENT_SETUP.md',
    'docs/ARCHITECTURE.md',
    'docs/SETUP.md',
    'docs/TROUBLESHOOTING.md',
  ]);
  for (const file of [
    'IMPLEMENTATION_PLAN.md',
    'CONDITIONAL_EFFECT_EXPANSION_PLAN.md',
    'excalidraw-plan.png',
    'demo/live-sprite-swap/generated-art-preview.png',
    'demo/live-sprite-swap/isaac-label-crop.png',
    'demo/live-sprite-swap/menu-crops.png',
  ]) assert.ok(!files.includes(file), file);
});
test('all packaged relative Markdown links resolve inside the ZIP', async () => {
  const files = await releaseFiles(), included = new Set(files);
  for (const file of files.filter(name => name.endsWith('.md'))) {
    const source = await readFile(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(link)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(link.split(/[?#]/)[0])));
      assert.ok(included.has(target), file + ' links to missing ' + target);
    }
  }
});
test('all packaged relative JavaScript imports resolve inside the ZIP', async () => {
  const files = await releaseFiles(), included = new Set(files);
  for (const file of files.filter(name => name.endsWith('.mjs'))) {
    const source = await readFile(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()(['"])(\.{1,2}\/[^'"\r\n]+)\1/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
      assert.ok(included.has(target), file + ' imports missing ' + target);
    }
  }
});
test('public packaging cannot bypass missing runtime pin', async () => {
  await assert.rejects(buildRelease(), /No native runtime/);
  await assert.rejects(buildRelease({ preview: true, tag: 'v99.0.0' }), /must agree/);
});

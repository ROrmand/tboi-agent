import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const runtime = await readFile(path.join(import.meta.dirname, '..', '..', 'demo', 'live-sprite-swap', 'main.lua'), 'utf8');

test('product runtime consumes native profiles without legacy generated-Lua polling', () => {
  assert.match(runtime, /NebiusBridge\.Poll/);
  assert.match(runtime, /NebiusBridge\.Ack/);
  assert.match(runtime, /validateProfile\(envelope\.profile, envelope\.id\)/);
  assert.match(runtime, /PROFILE ACCEPTED:/);
  assert.match(runtime, /nativePedestalImage:Render/);
  assert.match(runtime, /NATIVE_ART_READY/);
  assert.match(runtime, /NATIVE_ART_FALLBACK/);
  assert.match(runtime, /layer:SetVisible\(false\)/);
  assert.doesNotMatch(runtime, /readBridgeModule/);
  assert.doesNotMatch(runtime, /pollBridgeJob/);
  assert.doesNotMatch(runtime, /ImGui\./);
});

test('product runtime constrains generated artwork to the bridge asset namespace', () => {
  assert.ok(runtime.includes('number(slot,0,GENERATED_ITEM_CAPACITY-1,true)'));
  assert.ok(runtime.includes('profile.sprite_sheet~=string.format("gfx/items/collectibles/generated_slot_%02d.png",slot)'));
  assert.match(runtime, /Renderer\.LoadImage, nativePedestalSheet/);
  assert.match(runtime, /SourceQuad\.NewFromRectangle, Vector\(0, 0\), 32, 32, false/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { validateExport } from './report.mjs';

const source = await readFile(new URL('../../demo/live-sprite-swap/vanilla_audit.lua', import.meta.url), 'utf8');
const mocks = `
  registrations = 0
  saves = 0
  calls = {}
  CollectibleType = { NUM_COLLECTIBLES = 7 }
  REPENTOGON = {}
  items = {}
  for itemId = 1, 8 do
    if itemId ~= 3 then
      items[itemId] = { ID = itemId, Name = 'Fixture ' .. itemId, Description = '#FIXTURE',
        Quality = (itemId - 1) % 5, Type = 1, Tags = itemId * 2, Hidden = itemId == 2,
        MaxCharges = 0, ChargeType = 0, CacheFlags = 0, GfxFileName = 'fixture.png' }
    end
  end
  config = {
    GetCollectibles = function() return { Size = 9 } end,
    GetCollectible = function(self, itemId) calls[#calls + 1] = itemId; return items[itemId] end
  }
  Isaac = { GetItemConfig = function() return config end }
  RegisterMod = function(name, version)
    assert(name == 'Vanilla Mechanic Audit Export' and version == 1)
    registrations = registrations + 1
    return { SaveData = function(self, data) saved = data; saves = saves + 1 end }
  end
  require = function(name)
    assert(name == 'json')
    return { encode = function(value) encodedValue = value; return '{"mockEncoded":true}' end }
  end
  provenance = { gameVersion = 'mock-game', runtimeVersion = 'mock-rgon', capturedAt = '2026-10-24T00:00:00Z' }
`;

async function inLua(body) {
  const engine = await new LuaFactory().createEngine();
  try {
    engine.global.set('exporterSource', source);
    await engine.doString(mocks);
    await engine.doString('Audit = assert(load(exporterSource))()');
    return await engine.doString(body);
  } finally { engine.global.close(); }
}

test('Lua import is inert; capture enumerates every returned vanilla ID read-only with provenance and counts', async () => {
  await inLua(`
    assert(registrations == 0 and saves == 0 and #calls == 0)
    local result = Audit.capture(provenance)
    assert(registrations == 0 and saves == 0)
    assert(#calls == 6 and calls[1] == 1 and calls[6] == 6)
    assert(#result.collectibles == 5 and result.collectibles[3].id == 4)
    assert(result.collectibles[2].hidden == true)
    assert(result.collectibles[2].tags == 4 and items[2].Tags == 4)
    assert(result.scope.lastId == 6 and result.scope.itemConfigListSize == 9)
    assert(#result.scope.absentIds == 1 and result.scope.absentIds[1] == 3)
    assert(result.counts.total == 5 and result.counts.quality['0'] == 2)
    assert(result.counts.quality['1'] == 1 and result.counts.quality['2'] == 0)
    assert(result.counts.quality['3'] == 1 and result.counts.quality['4'] == 1)
    assert(result.schemaVersion == 1 and result.exporterVersion == '1.0.0')
    assert(result.provenance.kind == 'runtime' and result.provenance.repentogonPresent)
    assert(result.provenance.gameVersion == 'mock-game')
    assert(result.provenance.versionSource:match('operator'))
    assert(result.collectibles[5].id == 6 and items[7].ID == 7)
  `);
});

test('explicit write requires a supplied dedicated audit mod and never registers or uses the product save', async () => {
  await inLua(`
    assert(not pcall(Audit.write, provenance))
    assert(not pcall(Audit.write, provenance, {}))
    assert(registrations == 0 and saves == 0)
    local dedicated = { SaveData = function(self, data) saved = data; saves = saves + 1 end }
    local encoded = Audit.write(provenance, dedicated)
    assert(registrations == 0 and saves == 1 and saved == encoded)
    assert(encoded == '{"mockEncoded":true}' and encodedValue.counts.total == 5)
    assert(encodedValue.provenance.capturedAt == provenance.capturedAt)
  `);
});

test('Lua capture contract is accepted by the real Node join validator without Steam', async () => {
  const captured = await inLua('return Audit.capture(provenance)');
  const validated = validateExport(captured);
  assert.equal(validated.items.size, 5);
  assert.equal(validated.quality[0], 2);
  assert.deepEqual(captured.scope.absentIds, [3]);
});

test('exporter rejects missing provenance, mismatched IDs, truncated lists and empty runtime results before writing', async () => {
  await inLua(`
    assert(not pcall(Audit.capture, nil))
    assert(not pcall(Audit.capture, {}))
    items[1].ID = 99
    assert(not pcall(Audit.write, provenance, {}))
    items[1].ID = 1
    config.GetCollectibles = function() return { Size = 3 } end
    assert(not pcall(Audit.write, provenance, {}))
    config.GetCollectibles = function() return { Size = 9 } end
    config.GetCollectible = function() return nil end
    assert(not pcall(Audit.write, provenance, {}))
    assert(registrations == 0 and saves == 0)
  `);
});

test('nonstandard qualities are explicit and REPENTOGON absence is recorded', async () => {
  await inLua(`
    REPENTOGON = nil
    items[1].Quality = 9
    local result = Audit.capture(provenance)
    assert(result.provenance.repentogonPresent == false)
    assert(result.counts.quality.other == 1 and result.counts.quality['0'] == 1)
  `);
  assert.doesNotMatch(source, /AddCallback|ExecuteCommand|AddCollectible|RemoveCollectible|SaveModData|io\.open/);
});

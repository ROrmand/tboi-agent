import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LuaFactory } from 'wasmoon';
import sharp from 'sharp';

const runtimeSource = await readFile(new URL('./mod/nebius_native_runtime.lua', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('./mod/main.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();

const mocks = `
local vectorMeta = {}
function vectorMeta.__add(left, right) return Vector(left.X + right.X, left.Y + right.Y) end
function vectorMeta.__sub(left, right) return Vector(left.X - right.X, left.Y - right.Y) end
Vector = setmetatable({ Zero = setmetatable({ X = 0, Y = 0 }, vectorMeta) }, {
  __call = function(_, horizontal, vertical) return setmetatable({ X = horizontal, Y = vertical }, vectorMeta) end
})
function KColor(red, green, blue, alpha) return { red, green, blue, alpha } end
SourceQuad = { NewFromRectangle = function(position, width, height, uv)
  return { position = position, width = width, height = height, uv = uv }
end }
DestinationQuad = { NewFromRectangle = SourceQuad.NewFromRectangle }
counts = { allocations = 0, updates = 0, clears = 0, renders = 0, spawns = 0 }
Renderer = {
  LoadImage = function(name)
    assert(name == 'gfx/nebius_native_stage1/white.png')
    return { Render = function(_, source, destination, tint)
      assert(source.width == 1 and source.height == 1 and source.uv == false)
      assert(destination.width == 32 and destination.height == 32)
      lastTint = tint
    end }
  end,
  CreateImage = function(width, height, name)
    assert(width == 32 and height == 32)
    assert(name == 'nebius.native.stage1.surface.v1' or name == 'nebius.stage1b.create_image.v1' or name == 'nebius.stage1d.surface.v1' or name == 'nebius.stage1e.surface.v1')
    counts.allocations = counts.allocations + 1
    return { Render = function(_, source, destination)
      assert(source.width == 32 and source.height == 32 and source.uv == false)
      assert(destination.width == 32 and destination.height == 32)
      lastDestination = destination
      counts.renders = counts.renders + 1
    end }
  end,
  RenderToImage = function(surface, render)
    counts.updates = counts.updates + 1
    render({ Clear = function() counts.clears = counts.clears + 1 end })
  end,
}
EntityType = { ENTITY_PICKUP = 5 }
PickupVariant = { PICKUP_COLLECTIBLE = 100 }
ModCallbacks = { MC_EXECUTE_CMD = 1, MC_POST_UPDATE = 2, MC_POST_RENDER = 3,
  MC_PRE_PICKUP_RENDER = 4, MC_POST_PICKUP_RENDER = 5, MC_POST_GAME_STARTED = 6, MC_PRE_GAME_EXIT = 7 }
Keyboard = { KEY_8 = 56, KEY_KP_8 = 328 }
key8 = false
keypad8 = false
Input = { IsButtonTriggered = function(key, player)
  assert(player == 0)
  return (key == Keyboard.KEY_8 and key8) or (key == Keyboard.KEY_KP_8 and keypad8)
end, IsButtonPressed = function(key, player)
  assert(player == 0)
  return (key == Keyboard.KEY_8 and key8) or (key == Keyboard.KEY_KP_8 and keypad8)
end }
callbacks = {}
function RegisterMod(name, version)
  assert(name == 'Nebius Native Stage 1' and version == 1)
  return { AddCallback = function(_, callback, handler, filter)
    callbacks[#callbacks + 1] = { callback, handler, filter }
  end }
end
function include(name) assert(name == 'nebius_native_runtime'); return Runtime end
hostId = 900
now = 0
frame = 0
logs = {}
entities = {}
function makePickup()
  local data = {}
  local layer = { visible = true }
  function layer:IsVisible() return self.visible end
  function layer:SetVisible(visible) self.visible = visible end
  local sprite = { Offset = Vector(0, 0) }
  function sprite:GetLayer(index) assert(index == 1); return layer end
  function sprite:GetLayerFrameData(index)
    assert(index == 1)
    return { GetPos = function() return Vector(0, -24) end }
  end
  local pickup = { Position = Vector(180, 100), PositionOffset = Vector(0, 0), removed = false, layer = layer }
  function pickup:GetData() return data end
  function pickup:GetSprite() return sprite end
  function pickup:ToPickup() return self end
  function pickup:Exists() return not self.removed end
  function pickup:Remove() self.removed = true end
  return pickup
end
Isaac = {
  DebugString = function(message) logs[#logs + 1] = message end,
  GetItemIdByName = function(name) assert(name == 'Live Profile Core'); return hostId end,
  GetPlayer = function() return { Position = Vector(100, 100) } end,
  GetTime = function() return now end,
  WorldToScreen = function(position) return position end,
  Spawn = function(kind, variant, subtype, position)
    assert(kind == 5 and variant == 100 and subtype == hostId)
    counts.spawns = counts.spawns + 1
    local pickup = makePickup()
    pickup.Position = position
    entities[#entities + 1] = pickup
    return pickup
  end,
}
function Game()
  return { GetFrameCount = function() return frame end,
    GetNumPlayers = function() return 1 end,
    GetRoom = function() return { FindFreePickupSpawnPosition = function(_, position) return position end } end }
end
io = nil
os = nil
`;

async function runLua(body) {
  const engine = await factory.createEngine();
  try {
    engine.global.set('runtimeSource', runtimeSource);
    engine.global.set('mainSource', mainSource);
    await engine.doString(mocks);
    await engine.doString('Runtime = assert(load(runtimeSource))(); Probe = assert(load(mainSource))()');
    await engine.doString(body);
  } finally {
    engine.global.close();
  }
}

test('native surface allocates once and updates only on one-second color changes, without Lua I/O', async () => {
  await runLua(`
    local runtime = Runtime.new()
    assert(runtime:update(0)); assert(lastTint[1] == 1)
    assert(runtime:update(999)); assert(counts.updates == 1)
    assert(runtime:update(1000)); assert(lastTint[2] == 1)
    assert(runtime:update(2000)); assert(lastTint[3] == 1)
    assert(runtime:update(3000)); assert(lastTint[1] == 1)
    assert(counts.allocations == 1 and counts.clears == 4)
    assert(runtime:render(Vector(10, 20)))
    assert(counts.renders == 1 and lastDestination.position.X == 10)
  `);
});

test('keyboard 8 creates a blank image and loads one packaged image from the post-render callback only', async () => {
  await runLua(`
    Probe:onGameStarted(false)
    assert(logs[#logs]:find('RUN_STARTED'))
    Probe:onUpdate(); Probe:onRender()
    assert(#logs == 2)
    frame = 17; now = 290
    key8 = true; Probe:onUpdate(); key8 = false
    assert(logs[#logs - 1]:find('INPUT_DETECTED key=KEY_8 frame=17 time_ms=290'))
    assert(logs[#logs]:find('UPDATE_ARMED frame=17 native_calls=compose_surface_then_existing_pedestal_overlay', 1, true))
    Probe:onRender()
    local combined = table.concat(logs, '|')
    assert(combined:find('CREATEIMAGE_CALL_BEGIN frame=17 width=32 height=32 name=nebius.stage1e.surface.v1', 1, true))
    assert(combined:find('LOADIMAGE_CALL_BEGIN frame=17 path=gfx/nebius_native_stage1/white.png', 1, true))
    assert(combined:find('SOURCEQUAD_CALL_BEGIN frame=17', 1, true))
    assert(combined:find('DESTINATIONQUAD_CALL_BEGIN frame=17', 1, true))
    assert(logs[#logs]:find('LOADIMAGE_CALL_OK frame=17 image_retained=true surface_retained=true quads_retained=true surface_cleared=true source_rendered=true item_bound=false spawn=false'))
    frame = 77; Probe:onUpdate(); Probe:onRender()
    assert(logs[#logs]:find('UPDATE_STABLE frame=77 elapsed_frames=60 surface_created=true image_loaded=true quads_created=true surface_cleared=true source_rendered=true awaiting_existing_pedestal=true'))
    assert(counts.spawns == 0 and counts.allocations == 1 and counts.updates == 1 and counts.clears == 1 and counts.renders == 0)
    Probe:onGameExit()
  `);
});

test('keypad 8 works, while repeated input and run reset cannot load a second image', async () => {
  await runLua(`
    Probe:onGameStarted(false)
    frame = 5; keypad8 = true; Probe:onUpdate(); keypad8 = false; Probe:onRender()
    frame = 6; key8 = true; Probe:onUpdate(); key8 = false; Probe:onRender()
    local detected = 0
    for _, message in ipairs(logs) do if message:find('INPUT_DETECTED') then detected = detected + 1 end end
    assert(detected == 1)
    Probe:onGameStarted(true); Probe:onUpdate(); Probe:onRender()
    assert(counts.spawns == 0 and counts.allocations == 1 and counts.updates == 1 and counts.clears == 1 and counts.renders == 0)
  `);
});

test('held number-row 8 is accepted when a keyboard misses the triggered edge', async () => {
  await runLua(`
    Input.IsButtonTriggered = function() return false end
    Probe:onGameStarted(false)
    frame = 9; key8 = true; Probe:onUpdate(); key8 = false; Probe:onRender()
    local combined = table.concat(logs, '|')
    assert(combined:find('CREATEIMAGE_CALL_BEGIN frame=9', 1, true))
    assert(combined:find('LOADIMAGE_CALL_BEGIN frame=9', 1, true))
    assert(logs[#logs]:find('LOADIMAGE_CALL_OK frame=9'))
  `);
});

test('missing renderer operation records a skip and never creates or loads an image', async () => {
  await runLua(`
    Renderer = nil
    Probe:onGameStarted(false)
    frame = 4; key8 = true; Probe:onUpdate(); key8 = false; Probe:onRender()
    assert(logs[#logs]:find('NATIVE_CALLS_SKIPPED frame=4 reason=required_native_binding_unavailable'))
    assert(counts.allocations == 0 and counts.spawns == 0)
  `);
});

test('all mod Lua parses, including the unchanged legacy mod', async () => {
  const legacySource = await readFile(new URL('../../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
  const engine = await factory.createEngine();
  try {
    engine.global.set('legacySource', legacySource);
    await engine.doString('assert(load(legacySource))');
  } finally {
    engine.global.close();
  }
});

test('installer uses its own directory, prepares the seed, and refuses overwrites', async () => {
  const modsDirectory = await mkdtemp(path.join(tmpdir(), 'nebius-native-install-'));
  const existing = path.join(modsDirectory, 'live_sprite_swap_demo');
  await mkdir(existing);
  await writeFile(path.join(existing, 'main.lua'), 'original');
  const script = path.join(import.meta.dirname, 'prepare.mjs');
  const installed = spawnSync(process.execPath, [script, '--install', modsDirectory], { encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(await readFile(path.join(existing, 'main.lua'), 'utf8'), 'original');
  const asset = path.join(modsDirectory, 'nebius_native_stage1/resources/gfx/nebius_native_stage1/white.png');
  const metadata = await sharp(asset).metadata();
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 1);
  const repeated = spawnSync(process.execPath, [script, '--install', modsDirectory], { encoding: 'utf8' });
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /Refusing to overwrite/);
});

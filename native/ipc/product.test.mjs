import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { toLua } from '../../bridge/runtime.mjs';

const mainSource = await readFile(new URL('../../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
const promptSource = await readFile(new URL('../../demo/live-sprite-swap/nebius_prompt.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();
const profile = {
  version: 1, generated_at: '2026-10-11', bridge_request_id: 'ui_123_1', sprite_sheet: 'gfx/items/collectibles/generated_slot_00.png',
  metadata: { display_name: 'Emerald Eye', description: 'Poison and damage', quality: 2, theme: 'cursed', balance_note: '' },
  stats: { damage: 1, tears: 1, shot_speed: 0.1, range: 2, speed: 0.1, luck: 1, soul_hearts: 2 },
  tear_profile: { flags: ['poison'], color: { r: 0.2, g: 1, b: 0.3, a: 1 }, scale: 1.5 },
  visuals: { pedestal_prompt: 'emerald eye' },
  rules: [{ trigger: 'room_clear', conditions: [{ type: 'once_per_room' }], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] }],
};

const mocks = `
frame, now, held, owns, stage, roomIndex = 0, 0, false, false, 1, 1
logs, events, entities, uiCallbacks = {}, {}, {}, {}
function Random() return 123 end
function Color(...) return {...} end
function KColor(...) return {...} end
local vectorMeta = { __add = function(left, right) return Vector(left.X + right.X, left.Y + right.Y) end }
Vector = setmetatable({ Zero = { X = 0, Y = 0 } }, { __call = function(_, horizontal, vertical) return setmetatable({ X = horizontal, Y = vertical }, vectorMeta) end })
TearFlags = setmetatable({}, { __index = function() return 1 end })
CacheFlag = { CACHE_DAMAGE=1, CACHE_FIREDELAY=2, CACHE_RANGE=4, CACHE_LUCK=8, CACHE_SHOTSPEED=16, CACHE_SPEED=32 }
ModCallbacks = setmetatable({}, { __index = function(_, key) return key end })
Keyboard = { KEY_8=8, KEY_KP_8=108, KEY_BACKSLASH=92 }
Input = { IsButtonPressed = function() return held end }
EntityType = { ENTITY_PICKUP=5 }
PickupVariant = { PICKUP_COLLECTIBLE=100, PICKUP_COIN=20, PICKUP_KEY=30, PICKUP_BOMB=40, PICKUP_HEART=10 }
function RegisterMod() return { AddCallback = function() end } end
function Sprite() return { Load=function() end, ReplaceSpritesheet=function() end, LoadGraphics=function() end, Play=function() end, RenderLayer=function() end } end
function SFXManager() return { Play=function() end } end
player = { InitSeed=11, Position=Vector(0,0), Damage=3.5, MaxFireDelay=10, TearRange=100, Luck=0, ShotSpeed=1, MoveSpeed=1, hearts=0,
 HasCollectible=function() return owns end, AddCacheFlags=function() end, EvaluateItems=function() end,
 AddSoulHearts=function(self, amount) self.hearts=self.hearts+amount end }
function Game() return { GetFrameCount=function() return frame end, GetNumPlayers=function() return 1 end,
 GetRoom=function() return { FindFreePickupSpawnPosition=function(_, position) return position end } end,
 GetLevel=function() return { GetCurrentRoomIndex=function() return roomIndex end, GetAbsoluteStage=function() return stage end } end } end
Isaac = { DebugString=function(message) logs[#logs+1]=message end, GetItemIdByName=function() return 733 end,
 GetSoundIdByName=function() return 1 end, GetTime=function() return now+frame*34 end, GetPlayer=function() return player end,
 FindByType=function() return entities end, WorldToScreen=function(position) return position end, RenderText=function() end,
 Spawn=function(_, variant, subtype, position)
  events[#events+1]='spawn:'..tostring(variant)
  if failSpawn then return { ToPickup=function() return nil end } end
  local data = {}
  local pickup = { InitSeed=#entities+1, SubType=subtype, Position=position, PositionOffset=Vector(0,0), GetData=function() return data end, GetSprite=Sprite }
  function pickup:ToPickup() return self end
  entities[#entities+1]=pickup
  return pickup
 end }
package.preload.json = function() return { decode=function(raw) if raw=='bad' then error('bad JSON') end; return envelope end,
 encode=function(value) lastRequest=value; return '{"id":"'..value.id..'","prompt":"test"}' end } end
function include(name) assert(name=='nebius_prompt'); return assert(load(promptSource))() end
NebiusBridge = { Poll=function() local result=nextRaw; nextRaw=nil; return result end,
 Ack=function(id) events[#events+1]='ack:'..id; return true end }
uiVisible, uiShown, windows = false, false, 0
ImGui = { CreateWindow=function() windows=windows+1 end, AddText=function() end,
 AddInputTextMultiline=function(_, id, _, callback) uiCallbacks.input=callback end,
 AddButton=function(_, id, _, callback) if id=='nebius_passive_submit_v2' then uiCallbacks.submit=callback else uiCallbacks.close=callback end end,
 SetSize=function() end, SetVisible=function(_, value) uiVisible=value end,
 GetVisible=function() return uiVisible end, Show=function() uiShown=true end, Hide=function() uiShown=false end, UpdateText=function(_, value) uiStatus=value end }
Renderer = { LoadImage=function() return { Render=function() events[#events+1]='render' end } end }
SourceQuad = { NewFromRectangle=function() return {} end }
DestinationQuad = { NewFromRectangle=function() return {} end }
`;

async function run(body, customProfile = profile) {
  const engine = await factory.createEngine();
  try {
    engine.global.set('promptSource', promptSource);
    engine.global.set('mainSource', mainSource);
    await engine.doString(mocks);
    await engine.doString(`envelope = ${toLua({ version: 1, type: 'profile', id: customProfile.bridge_request_id, profile: customProfile })}`);
    await engine.doString('Demo = assert(load(mainSource .. "\\nreturn Demo"))()');
    await engine.doString(body);
  } finally { engine.global.close(); }
}

test('8 opens one fixed window; hold, typing 8, and double submit do not duplicate requests', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); assert(windows==0)
    Demo:onPostRender(); assert(windows==1 and uiVisible and uiShown)
    frame=1; Demo:onPostUpdate(); Demo:onPostRender(); assert(windows==1)
    held=false; frame=2; Demo:onPostUpdate()
    held=true; frame=3; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiVisible and windows==1)
    uiCallbacks.input('  poison eye  '); uiCallbacks.submit(); uiCallbacks.submit()
    assert(lastRequest.id=='ui_123_1' and lastRequest.prompt=='poison eye')
    assert(not uiVisible and not uiShown)
    local requests=0
    for _, line in ipairs(logs) do if line:find('[NebiusBridge] generate',1,true) then requests=requests+1 end end
    assert(requests==1)
  `);
});

test('accepted native profile spawns before ACK, renders art, and applies passive behavior', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    assert(events[1]=='spawn:100' and events[2]=='ack:ui_123_1')
    Demo:onPostRender(); Demo:onPickupRender(entities[1]); assert(events[3]=='render')
    owns=true
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==4.5)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_FIREDELAY); assert(player.MaxFireDelay==9)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_RANGE); assert(player.TearRange==102)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_LUCK); assert(player.Luck==1)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_SHOTSPEED); assert(player.ShotSpeed==1.1)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_SPEED); assert(player.MoveSpeed==1.1)
    Demo:onPostAddCollectible(733,nil,nil,nil,nil,player); assert(player.hearts==2)
    local tear={SpawnerEntity={ToPlayer=function() return player end}, TearFlags=0, Scale=1, GetData=function() return {} end}
    Demo:onPostFireTear(tear); assert(tear.TearFlags==1 and tear.Scale==1.5 and tear.Color[2]==1)
    Demo:onPreSpawnCleanAward(); Demo:onPreSpawnCleanAward(); assert(#events==4)
    stage=2; Demo:onPreSpawnCleanAward(); assert(#events==5)
  `);
});

test('invalid profile and failed pedestal creation never ACK', async () => {
  await run(`envelope.profile.stats.damage=99; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
  await run(`failSpawn=true; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==1 and events[1]=='spawn:100')`);
  await run(`envelope.profile.rules={extra='unsupported'}; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
});

test('IPC status matches pending ID; error clears submission lock and permits retry', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); uiCallbacks.input('eye'); uiCallbacks.submit()
    envelope={version=1,type='status',id='other',status='error',detail='wrong request'}
    frame=1; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiStatus~='wrong request')
    envelope.id='ui_123_1'; envelope.detail='Image service unavailable'
    frame=2; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiStatus=='Image service unavailable')
    uiCallbacks.submit(); assert(lastRequest.id=='ui_123_2')
  `);
});

test('two same-trigger rules keep independent once-per-room state', async () => {
  const fixture = structuredClone(profile);
  fixture.rules.push(structuredClone(fixture.rules[0]));
  await run(`nextRaw='profile'; Demo:onPostUpdate(); owns=true; Demo:onPreSpawnCleanAward(); Demo:onPreSpawnCleanAward(); assert(#events==4)`, fixture);
});

test('empty/oversized prompts do not submit; timeout unlocks a pending request', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender()
    uiCallbacks.input('   '); uiCallbacks.submit(); assert(lastRequest==nil)
    uiCallbacks.input(string.rep('x',2001)); uiCallbacks.submit(); assert(lastRequest==nil)
    uiCallbacks.input('eye'); uiCallbacks.submit(); assert(lastRequest.id=='ui_123_1')
    now=370001; Demo:onPostRender(); uiCallbacks.submit(); assert(lastRequest.id=='ui_123_2')
  `);
});

test('missing ImGui or a Lua binding error leaves the native product path usable', async () => {
  await run(`ImGui=nil; held=true; Demo:onPostUpdate(); Demo:onPostRender(); frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==2)`);
  await run(`ImGui.CreateWindow=function() error('test UI binding failure') end; held=true; Demo:onPostUpdate(); Demo:onPostRender(); frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==2)`);
});

test('paused render receives progress but defers profile application until update', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); uiCallbacks.input('eye'); uiCallbacks.submit()
    frame=1; envelope={version=1,type='status',id='ui_123_1',status='generating',detail='Preparing artwork'}
    nextRaw='status'; Demo:onPostRender(); assert(uiStatus=='Preparing artwork' and #events==0)
    envelope=${toLua({ version: 1, type: 'profile', id: profile.bridge_request_id, profile })}
    frame=2; nextRaw='profile'; Demo:onPostRender(); assert(#events==0)
    Demo:onPostUpdate(); assert(events[1]=='spawn:100' and events[2]=='ack:ui_123_1')
  `);
});

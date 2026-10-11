import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { toLua } from '../../bridge/runtime.mjs';

const mainSource = await readFile(new URL('../../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
const promptSource = await readFile(new URL('../../demo/live-sprite-swap/nebius_prompt.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();
const profile = {
  version: 1, generated_at: '2026-10-11', bridge_request_id: '123_0_1_123_1', sprite_sheet: 'gfx/items/collectibles/generated_slot_00.png',
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
function RegisterMod() return { AddCallback = function() end,
 SaveData=function(_,value) savedData=value end, HasData=function() return savedData~=nil end,
 LoadData=function() return savedData end } end
function Sprite() return { Load=function() end, ReplaceSpritesheet=function() end, LoadGraphics=function() end, Play=function() end, RenderLayer=function() end } end
function SFXManager() return { Play=function() end } end
player = { InitSeed=11, Position=Vector(0,0), Damage=3.5, MaxFireDelay=10, TearRange=100, Luck=0, ShotSpeed=1, MoveSpeed=1, hearts=0,
 HasCollectible=function() return owns end, AddCacheFlags=function() end, EvaluateItems=function() end,
 AddSoulHearts=function(self, amount) self.hearts=self.hearts+amount end }
function Game() return { GetFrameCount=function() return frame end, GetNumPlayers=function() return 1 end,
 GetRoom=function() return { FindFreePickupSpawnPosition=function(_, position) return position end } end,
 GetLevel=function() return { GetCurrentRoomIndex=function() return roomIndex end, GetAbsoluteStage=function() return stage end } end } end
Isaac = { DebugString=function(message) logs[#logs+1]=message end, GetItemIdByName=function(name) return 733+tonumber(name:match("(%d+)$")) end,
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
encodedValues={}
function deepCopy(value)
 if type(value)~='table' then return value end
 local result={}
 for key,item in pairs(value) do result[key]=deepCopy(item) end
 return result
end
package.preload.json = function() return { decode=function(raw) if raw=='bad' then error('bad JSON') end; return encodedValues[raw] or envelope end,
 encode=function(value)
  if value.prompt then lastRequest=value end
  local key='encoded_'..tostring(#encodedValues+1)
  encodedValues[#encodedValues+1]=deepCopy(value); encodedValues[key]=deepCopy(value)
  return key
 end } end
function include(name) assert(name=='nebius_prompt'); return assert(load(promptSource))() end
NebiusBridge = { Poll=function() local result=nextRaw; nextRaw=nil; return result end,
 Ack=function(id) events[#events+1]='ack:'..id; return true end }
uiVisible, uiShown, windows = false, false, 0
ImGui = { CreateWindow=function() windows=windows+1 end, AddText=function() end,
 AddInputTextMultiline=function(_, id, _, callback) uiCallbacks.input=callback end,
 AddButton=function(_, id, _, callback)
  if id=='nebius_passive_submit_v2' then uiCallbacks.submit=callback
  elseif id=='nebius_passive_randomize_v2' then uiCallbacks.randomize=callback
  else uiCallbacks.close=callback end
 end,
 SetSize=function() end, SetVisible=function(_, value) uiVisible=value end,
 GetVisible=function() return uiVisible end, Show=function() uiShown=true end, Hide=function() uiShown=false end,
 UpdateData=function(_, dataType, value) uiInputDataType=dataType; uiInputValue=value end,
 UpdateText=function(_, value) uiStatus=value end }
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
    await engine.doString("Demo:onGameStarted(false)");
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
    assert(lastRequest.id=='123_0_1_123_1' and lastRequest.prompt=='poison eye')
    assert(not uiVisible and not uiShown)
    local requests=0
    for _, line in ipairs(logs) do if line:find('[NebiusBridge] generate',1,true) then requests=requests+1 end end
    assert(requests==1)
  `);
});

test('Randomize fills the prompt and leaves the user in control of generation', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender()
    assert(uiCallbacks.randomize~=nil)
    uiCallbacks.randomize()
    Demo:onPostRender()
    assert(lastRequest==nil and uiInputDataType==1 and #uiInputValue>20 and uiStatus=='Random passive idea ready. Edit it or generate it.')
    uiCallbacks.submit()
    assert(lastRequest and #lastRequest.prompt>20 and not uiVisible)
  `);
});

test('accepted native profile spawns before ACK, renders art, and applies passive behavior', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    assert(events[1]=='spawn:100' and events[2]=='ack:123_0_1_123_1')
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
  await run(`envelope.profile.metadata.description=string.rep('x',65); nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
  await run(`failSpawn=true; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==1 and events[1]=='spawn:100')`);
  await run(`envelope.profile.rules={extra='unsupported'}; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
});

test('IPC status matches pending ID; error clears submission lock and permits retry', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); uiCallbacks.input('eye'); uiCallbacks.submit()
    envelope={version=1,type='status',id='other',status='error',detail='wrong request'}
    frame=1; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiStatus~='wrong request')
    envelope.id='123_0_1_123_1'; envelope.detail='Image service unavailable'
    frame=2; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiStatus=='Image service unavailable')
    uiCallbacks.submit(); assert(lastRequest.id=='123_0_1_123_2')
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
    uiCallbacks.input('eye'); uiCallbacks.submit(); assert(lastRequest.id=='123_0_1_123_1')
    now=370001; Demo:onPostRender(); uiCallbacks.submit(); assert(lastRequest.id=='123_0_1_123_2')
  `);
});

test('missing ImGui or a Lua binding error leaves the native product path usable', async () => {
  await run(`ImGui=nil; held=true; Demo:onPostUpdate(); Demo:onPostRender(); frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==2)`);
  await run(`ImGui.CreateWindow=function() error('test UI binding failure') end; held=true; Demo:onPostUpdate(); Demo:onPostRender(); frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==2)`);
});

test('paused render receives progress but defers profile application until update', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); uiCallbacks.input('eye'); uiCallbacks.submit()
    frame=1; envelope={version=1,type='status',id='123_0_1_123_1',status='generating',detail='Preparing artwork'}
    nextRaw='status'; Demo:onPostRender(); assert(uiStatus=='Preparing artwork' and #events==0)
    envelope=${toLua({ version: 1, type: 'profile', id: profile.bridge_request_id, profile })}
    frame=2; nextRaw='profile'; Demo:onPostRender(); assert(#events==0)
    Demo:onPostUpdate(); assert(events[1]=='spawn:100' and events[2]=='ack:123_0_1_123_1')
  `);
});

test('two collectibles have independent profiles, art, ownership and persisted rule state', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    envelope=deepCopy(envelope)
    envelope.id='123_0_1_second'; envelope.profile.bridge_request_id=envelope.id
    envelope.profile.sprite_sheet='gfx/items/collectibles/generated_slot_01.png'
    envelope.profile.stats.damage=2
    frame=1; nextRaw='profile'; Demo:onPostUpdate()
    assert(entities[1].SubType==733 and entities[2].SubType==734)
    player.HasCollectible=function(_,id) return id==733 end
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==4.5)
    player.Damage=3.5; player.HasCollectible=function() return true end
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==6.5)
    Demo:onPreSpawnCleanAward(); assert(#events==6)
    Demo:onPreGameExit(true)
    -- Reload all Lua runtime state to simulate closing and reopening Isaac.
    Demo=assert(load(mainSource.."\\nreturn Demo"))()
    Demo:onGameStarted(true)
    player.Damage=3.5
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==6.5)
    Demo:onPreSpawnCleanAward(); assert(#events==6)
    Demo:onPostRender()
    Demo:onPickupRender(entities[1]); Demo:onPickupRender(entities[2]); assert(#events==8)
    Demo:onPostAddCollectible(733,nil,false,nil,nil,player); assert(player.hearts==0)
  `);
});

test('64 items accepted; 65th blocked in native receiver and prompt without replacing items', async () => {
  await run(`
    for i=0,63 do
      envelope=deepCopy(envelope)
      envelope.id='123_0_1_item_'..i; envelope.profile.bridge_request_id=envelope.id
      envelope.profile.sprite_sheet=string.format('gfx/items/collectibles/generated_slot_%02d.png',i)
      frame=i; nextRaw='profile'; Demo:onPostUpdate()
    end
    assert(#entities==64 and #events==128)
    envelope=deepCopy(envelope)
    envelope.id='123_0_1_overflow'; envelope.profile.bridge_request_id=envelope.id
    frame=64; nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==64 and #events==128)
    held=true; frame=65; Demo:onPostUpdate(); Demo:onPostRender()
    uiCallbacks.input('one more'); uiCallbacks.submit(); Demo:onPostRender()
    assert(lastRequest==nil and uiStatus:find('Item limit reached: 64/64',1,true))
    Demo:onPreGameExit(true); Demo:onGameStarted(true)
    uiCallbacks.submit(); Demo:onPostRender(); assert(lastRequest==nil and uiStatus:find('Item limit reached: 64/64',1,true))
    Demo:onGameStarted(false)
    uiCallbacks.submit(); Demo:onPostRender()
    assert(lastRequest==nil and uiStatus:find('Artwork limit reached: 64/64',1,true))
  `);
});

test('duplicate delivery is idempotent and stale run or occupied artwork is rejected', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==1 and #events==3)
    envelope.id='123_0_1_another'; envelope.profile.bridge_request_id=envelope.id
    frame=2; nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==1 and #events==3)
    Demo:onGameStarted(false)
    frame=3; nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==1 and #events==3)
  `);
});

test('bad saved state and failed persistence block generation and never ACK', async () => {
  await run(`
    Demo.SaveData=function() error('disk failure') end
    nextRaw='profile'; Demo:onPostUpdate(); assert(#events==1)
    frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==1)
  `);
  await run(`
    savedData='bad'; Demo:onGameStarted(true)
    envelope.id='123_0_2_item'; envelope.profile.bridge_request_id=envelope.id
    nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)
  `);
});

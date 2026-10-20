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
  systems: ['stats', 'tears', 'rules'], affects_stats: true,
  stats: { damage: 1, tears: 1, shot_speed: 0.1, range: 2, speed: 0.1, luck: 1, soul_hearts: 2 },
  tear_profile: { flags: ['poison'], color: { r: 0.2, g: 1, b: 0.3, a: 1 }, scale: 1.5 },
  visuals: { pedestal_prompt: 'emerald eye' },
  rules: [{ trigger: 'room_clear', conditions: [{ type: 'once_per_room' }], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] }],
};

const mocks = `
frame, now, held, owns, stage, roomIndex = 0, 0, false, false, 1, 1
logs, events, entities, uiCallbacks, familiarTears, projectiles, itemBanners = {}, {}, {}, {}, {}, {}, {}
function Random() return 123 end
function Color(...) return {...} end
function KColor(...) return {...} end
local vectorMeta = {
  __add = function(left, right) return Vector(left.X + right.X, left.Y + right.Y) end,
  __sub = function(left, right) return Vector(left.X - right.X, left.Y - right.Y) end,
}
Vector = setmetatable({ Zero = { X = 0, Y = 0 } }, { __call = function(_, horizontal, vertical) return setmetatable({ X = horizontal, Y = vertical }, vectorMeta) end })
TearFlags = setmetatable({ TEAR_SLOW=2, TEAR_CHARM=4, TEAR_HOMING=8, TEAR_SPECTRAL=16, TEAR_BURN=64, TEAR_PIERCING=128, TEAR_GLOW=256, TEAR_FEAR=512, TEAR_BOUNCE=1024, TEAR_SPLIT=2048, TEAR_EXPLOSIVE=4096, TEAR_CONFUSION=16384, TEAR_KNOCKBACK=16777216 }, { __index = function() return 1 end })
CacheFlag = { CACHE_DAMAGE=1, CACHE_FIREDELAY=2, CACHE_RANGE=4, CACHE_LUCK=8, CACHE_SHOTSPEED=16, CACHE_SPEED=32, CACHE_FLYING=64 }
ModCallbacks = setmetatable({}, { __index = function(_, key) return key end })
Keyboard = { KEY_8=8, KEY_KP_8=108, KEY_BACKSLASH=92 }
Input = { IsButtonPressed = function() return held end }
EntityType = { ENTITY_TEAR=2, ENTITY_PICKUP=5, ENTITY_FAMILIAR=3, ENTITY_PROJECTILE=9 }
PickupVariant = { PICKUP_COLLECTIBLE=100, PICKUP_COIN=20, PICKUP_KEY=30, PICKUP_BOMB=40, PICKUP_HEART=10 }
FamiliarVariant = { PUNCHING_BAG=67 }
TearVariant = { BLUE=0 }
EntityPartition = { ENEMY=1 }
function EntityRef() return {} end
function RegisterMod() return { AddCallback = function() end,
 SaveData=function(_,value) savedData=value end, HasData=function() return savedData~=nil end,
 LoadData=function() return savedData end } end
spritesheetReplacements, pedestalLayerVisible = 0, true
function Sprite() return { Load=function() end, ReplaceSpritesheet=function() spritesheetReplacements=spritesheetReplacements+1 end, LoadGraphics=function() end, Play=function() end, RenderLayer=function() end,
 GetLayer=function() return { SetVisible=function(_, visible) pedestalLayerVisible=visible end } end } end
function SFXManager() return { Play=function() end } end
player = { InitSeed=11, Position=Vector(0,0), Damage=3.5, MaxFireDelay=10, TearRange=100, Luck=0, ShotSpeed=1, MoveSpeed=1, hearts=0, CanFly=false, ToPlayer=function(self) return self end,
 HasCollectible=function() return owns end, AddCacheFlags=function() end, EvaluateItems=function() end,
 AddSoulHearts=function(self, amount) self.hearts=self.hearts+amount end }
function Game() return { GetFrameCount=function() return frame end, GetNumPlayers=function() return 1 end,
 GetHUD=function() return { ShowItemText=function(_, title, subtitle) itemBanners[#itemBanners+1]={title, subtitle} end } end,
 GetRoom=function() return { FindFreePickupSpawnPosition=function(_, position) return position end } end,
 GetLevel=function() return { GetCurrentRoomIndex=function() return roomIndex end, GetAbsoluteStage=function() return stage end } end } end
Isaac = { DebugString=function(message) logs[#logs+1]=message end, GetItemIdByName=function(name) return 733+tonumber(name:match("(%d+)$")) end,
 GetSoundIdByName=function() return 1 end, GetTime=function() return now+frame*34 end, GetPlayer=function() return player end,
 FindByType=function(entityType) if entityType==EntityType.ENTITY_PROJECTILE then return projectiles end return entities end, WorldToScreen=function(position) return position end, RenderText=function() end,
 Spawn=function(entityType, variant, subtype, position, velocity)
  if entityType==EntityType.ENTITY_FAMILIAR then
   local data={}; local familiar={Position=position,PositionOffset=Vector(0,0),Visible=true,GetData=function() return data end,Exists=function() return true end}
   function familiar:ToFamiliar() return self end
   function familiar:AddToFollowers() self.joinedFollowers=true end
   function familiar:FollowParent() self.followedParent=true end
   function familiar:AddToOrbit(layer) self.orbitLayer=layer end
   function familiar:GetOrbitPosition(anchor) local distance=(self.OrbitDistance and self.OrbitDistance.X) or 40; self.orbitAnchor=anchor; return anchor+Vector(distance,0) end
   function familiar:FollowPosition(position) self.followed=position end
   function familiar:GetSprite()
    local owner=self
    return { Load=function(_, path) owner.loadedAnimation=path end, ReplaceSpritesheet=function(_, _, sheet) owner.spritesheet=sheet end, LoadGraphics=function() owner.graphicsLoaded=true end, Play=function(_, name) owner.animation=name end }
   end
   spawnedFamiliar=familiar
   return familiar
  end
  if entityType==EntityType.ENTITY_TEAR then
   local data={}; local tear={Position=position,Velocity=velocity or Vector(0,0),TearFlags=0,Scale=1,GetData=function() return data end}
   function tear:ToTear() return self end
   familiarTears[#familiarTears+1]=tear
   spawnedFamiliarTear=tear
   return tear
  end
  events[#events+1]='spawn:'..tostring(variant)
  if failSpawn then return { ToPickup=function() return nil end } end
  local data = {}
  local pickup = { InitSeed=#entities+1, SubType=subtype, Position=position, PositionOffset=Vector(0,0), GetData=function() return data end, GetSprite=Sprite }
  function pickup:ToPickup() return self end
  entities[#entities+1]=pickup
  return pickup
 end,
 FindInRadius=function() return enemies or {} end }
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
DestinationQuad = { NewFromRectangle=function(position, width, height) lastDestination={x=position.X,y=position.Y,width=width,height=height}; return {} end }
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
    assert(uiStatus=='Asking for a random sentence...' and lastRequest==nil)
    local asked=false
    for _, line in ipairs(logs) do if line:find('[NebiusBridge] sentence',1,true) then asked=true end end
    assert(asked)
    envelope={version=1,type='status',id='123_0_1_123_1',status='sentence',detail='A glass eye that blinks when the room is dark.'}
    frame=1; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender()
    assert(uiInputDataType==1 and uiInputValue=='A glass eye that blinks when the room is dark.' and uiStatus=='Random sentence ready. Edit it or generate it.')
    uiCallbacks.submit()
    assert(lastRequest and lastRequest.prompt=='A glass eye that blinks when the room is dark.' and not uiVisible)
  `);
});

test('accepted native profile spawns before ACK, renders art, and applies passive behavior', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    assert(events[1]=='spawn:100' and events[2]=='ack:123_0_1_123_1')
    Demo:onPostRender(); Demo:onPickupRender(entities[1]); assert(events[3]=='render')
    assert(spritesheetReplacements==0 and pedestalLayerVisible==false)
    assert(lastDestination.x==64 and lastDestination.y==-48 and lastDestination.width==32 and lastDestination.height==32)
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

test('pickup banner uses the model name and one effect sentence', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onPostAddCollectible(733,nil,true,nil,nil,player)
    frame=frame+1; Demo:onPostUpdate()
    assert(itemBanners[1][1]=='Emerald Eye')
    local summary=itemBanners[1][2]
    assert(summary:find('Damage',1,true) and summary:find('poison',1,true) and summary:find('coin',1,true))
    assert(not summary:find('Generated',1,true) and summary:sub(-1)=='.')
    local sentences=0
    for _ in summary:gmatch('[^.]+') do sentences=sentences+1 end
    assert(sentences==1)
    local boom=setmetatable({}, {__bor=function() error('no bor') end})
    local tear={SpawnerEntity={ToPlayer=function() return player end}, TearFlags=boom, Scale=1, GetData=function() return {} end}
    Demo:onPostFireTear(tear)
    assert(tear.Color[2]==1 and tear.Scale==1.5)
  `);
});

test('invalid profile and failed pedestal creation never ACK', async () => {
  await run(`envelope.profile.stats.damage=99; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
  await run(`envelope.profile.metadata.description=string.rep('x',65); nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
  await run(`failSpawn=true; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==1 and events[1]=='spawn:100')`);
  await run(`envelope.profile.rules={extra='unsupported'}; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
});

function familiarAttack(pattern, flags = ['poison']) {
  return { pattern, flags, color: { r: 0.2, g: 0.9, b: 0.3, a: 1 }, scale: 1.2, speed: 8 };
}

test('sentry fires the item attack profile while aura stays separate', async () => {
  const fixture = structuredClone(profile);
  fixture.familiar = { type: 'sentry', damage: 1.5, cooldown: 30, range: 160, sprite_prompt: 'small red eye', attack: familiarAttack('single', ['homing', 'glow']) };
  fixture.familiar_sprite_sheet = 'gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation = 'gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet = 'gfx/familiars/generated_familiar_sheet_00.png';
  fixture.aura = { type: 'damage', damage: 0.5, radius: 80, cooldown: 30 };
  fixture.systems = [...fixture.systems, 'familiar', 'aura'];
  await run(`
    local enemy={Position=Vector(80,0),damage=0,TakeDamage=function(self,amount) self.damage=self.damage+amount end}
    enemies={enemy}; nextRaw='profile'; Demo:onPostUpdate(); owns=true; frame=30; Demo:onPostUpdate()
    assert(spawnedFamiliar.orbitLayer==1 and math.abs(spawnedFamiliar.Velocity.X-40)<0.001)
    assert(spawnedFamiliar.Visible==true and spawnedFamiliar.animation=='Spin' and spawnedFamiliar.graphicsLoaded==true)
    assert(spawnedFamiliar.loadedAnimation=='gfx/familiars/generated_familiar_anim_00.anm2')
    assert(spawnedFamiliar.spritesheet=='gfx/familiars/generated_familiar_sheet_00.png')
    local tear=spawnedFamiliarTear
    local speed=math.sqrt(tear.Velocity.X*tear.Velocity.X+tear.Velocity.Y*tear.Velocity.Y)
    assert(tear:GetData().familiarPattern=='single' and tear.CollisionDamage==1.5 and tear.Scale==1.2)
    assert(tear.TearFlags==(8|256) and tear.Color[1]==0.2 and tear.Color[2]==0.9 and math.abs(speed-8)<0.001)
    assert(enemy.damage==0.5 and #familiarTears==1)
  `, fixture);
});

test('familiar attack pattern changes delivery without changing the item flags', async () => {
  const fixture = structuredClone(profile);
  fixture.familiar = { type: 'normal', damage: 1.5, cooldown: 30, range: 160, sprite_prompt: 'tiny prism wisp', attack: familiarAttack('fan', ['poison']) };
  fixture.familiar_sprite_sheet = 'gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation = 'gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet = 'gfx/familiars/generated_familiar_sheet_00.png';
  fixture.systems = [...fixture.systems, 'familiar'];
  await run(`
    local enemy={Position=Vector(40,0)}
    enemies={enemy}; nextRaw='profile'; Demo:onPostUpdate(); owns=true; frame=30; Demo:onPostUpdate()
    assert(#familiarTears==3 and familiarTears[1]:GetData().familiarPattern=='fan')
    assert(math.abs(familiarTears[2].CollisionDamage-1.5*0.7)<0.001 and familiarTears[3].TearFlags==1)
    assert(spawnedFamiliar.followedParent==true and spawnedFamiliar.joinedFollowers==true and spawnedFamiliar.animation=='Float')
  `, fixture);
  fixture.familiar.attack = familiarAttack('lob', ['burn']);
  await run(`
    enemies={{Position=Vector(40,0)}}; nextRaw='profile'; Demo:onPostUpdate(); owns=true; frame=30; Demo:onPostUpdate()
    local tear=spawnedFamiliarTear
    assert(tear:GetData().familiarPattern=='lob' and math.abs(tear.CollisionDamage-1.5*1.25)<0.001)
    assert(tear.FallingAcceleration==0.8 and tear.TearFlags==64 and tear.Color[2]==0.9)
  `, fixture);
  fixture.familiar.attack = familiarAttack('varied', ['poison']);
  await run(`
    math.random=function() return 4 end
    enemies={{Position=Vector(40,0)}}; nextRaw='profile'; Demo:onPostUpdate(); owns=true; frame=30; Demo:onPostUpdate()
    local tear=spawnedFamiliarTear
    assert(tear:GetData().familiarPattern=='lob' and tear.TearFlags==1 and tear.Color[1]==0.2)
    assert(math.abs(tear.CollisionDamage-1.5*1.25)<0.001)
  `, fixture);
});

test('melee familiars strike nearby enemies and do not fire tears', async () => {
  const fixture = structuredClone(profile);
  fixture.familiar = { type: 'melee', damage: 1.5, cooldown: 30, range: 160, sprite_prompt: 'small knife imp' };
  fixture.familiar_sprite_sheet = 'gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation = 'gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet = 'gfx/familiars/generated_familiar_sheet_00.png';
  fixture.systems = [...fixture.systems, 'familiar'];
  await run(`
    local enemy={Position=Vector(16,0),damage=0,TakeDamage=function(self,amount) self.damage=self.damage+amount end}
    enemies={enemy}; nextRaw='profile'; Demo:onPostUpdate(); owns=true; frame=30; Demo:onPostUpdate()
    assert(enemy.damage==1.5 and spawnedFamiliarTear==nil and spawnedFamiliar.followed.X==16 and spawnedFamiliar.animation=='Hop')
    enemy.Position=Vector(80,0); enemy.damage=0; frame=60; Demo:onPostUpdate()
    assert(enemy.damage==0 and spawnedFamiliarTear==nil)
  `, fixture);
});

test('shield familiars block a hit, intercept touching shots, and deal contact damage', async () => {
  const fixture = structuredClone(profile);
  fixture.familiar = { type: 'shield', damage: 1.5, cooldown: 30, range: 160, sprite_prompt: 'small round shield' };
  fixture.familiar_sprite_sheet = 'gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation = 'gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet = 'gfx/familiars/generated_familiar_sheet_00.png';
  fixture.systems = [...fixture.systems, 'familiar'];
  await run(`
    local enemy={Position=Vector(18,0),damage=0,TakeDamage=function(self,amount) self.damage=self.damage+amount end}
    local function shot(x)
      return {Position=Vector(x,0), Type=EntityType.ENTITY_PROJECTILE, removed=false, Remove=function(self) self.removed=true end}
    end
    local near, far = shot(20), shot(120)
    enemies={enemy}; projectiles={near, far}
    nextRaw='profile'; Demo:onPostUpdate(); owns=true; frame=30; Demo:onPostUpdate()
    assert(spawnedFamiliar.orbitLayer==2 and math.abs(spawnedFamiliar.Velocity.X-24)<0.001 and spawnedFamiliar.animation=='Idle')
    assert(enemy.damage==1.5 and spawnedFamiliarTear==nil)
    assert(near.removed and not far.removed)
    assert(Demo:onEntityTakeDamage(player,1,0,nil)==false)
    assert(Demo:onEntityTakeDamage(player,1,0,nil)==nil)
    frame=60; assert(Demo:onEntityTakeDamage(player,1,0,nil)==false)
  `, fixture);
});

test('familiar profiles are accepted and advertise the loaded runtime contract', async () => {
  const fixture = structuredClone(profile);
  fixture.familiar = { type: 'sentry', damage: 1, cooldown: 45, range: 160, sprite_prompt: 'thundercloud in a bottle', attack: familiarAttack('single', []) };
  fixture.familiar_sprite_sheet = 'gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation = 'gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet = 'gfx/familiars/generated_familiar_sheet_00.png';
  fixture.systems = [...fixture.systems, 'familiar'];
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    assert(events[1]=='spawn:100' and events[2]=='ack:123_0_1_123_1')
    local state=encodedValues[#encodedValues]
    assert(state.runtime_contract==8 and state.count==1)
  `, fixture);
});

test('an item runs only the systems it marks', async () => {
  const fixture = structuredClone(profile);
  delete fixture.stats;
  delete fixture.tear_profile;
  fixture.systems = ['rules', 'on_kill', 'tear_impact', 'collision'];
  fixture.affects_stats = false;
  fixture.rules = [{ trigger: 'room_clear', conditions: [], actions: [{ type: 'grant_soul_hearts', amount: 1 }] }];
  const proc = { conditions: [], actions: [{ type: 'grant_soul_hearts', amount: 1 }] };
  fixture.on_kill = proc;
  fixture.tear_impact = structuredClone(proc);
  fixture.collision = structuredClone(proc);
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onEvaluateCache(player, CacheFlag.CACHE_DAMAGE); assert(player.Damage==3.5)
    local tearData={}
    local tear={SpawnerEntity={ToPlayer=function() return player end}, TearFlags=0, Scale=1, GetData=function() return tearData end}
    Demo:onPostFireTear(tear); assert(tear.TearFlags==0 and tear.Scale==1 and tear.Color==nil)
    Demo:onPostAddCollectible(733,nil,nil,nil,nil,player); assert(player.hearts==0)
    Demo:onPreSpawnCleanAward(); assert(player.hearts==1)
    local enemy={InitSeed=9, ToPlayer=function() return nil end, ToNPC=function(self) return self end}
    Demo:onPostEntityKill(enemy); Demo:onPostEntityKill(enemy); assert(player.hearts==2)
    Demo:onPreTearCollision(tear, enemy); Demo:onPreTearCollision(tear, enemy); assert(player.hearts==3)
    Demo:onPrePlayerCollision(player, enemy); Demo:onPrePlayerCollision(player, enemy); assert(player.hearts==4)
  `, fixture);
});

test('a 64-byte name is accepted and weapon callbacks apply once', async () => {
  await run(`envelope.profile.metadata.display_name=string.rep('n',65); nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`);
  const wide = structuredClone(profile);
  wide.metadata = { ...wide.metadata, display_name: '你'.repeat(22) };
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, wide);
  const named = structuredClone(profile);
  named.metadata = { ...named.metadata, display_name: 'n'.repeat(64), description: 'd'.repeat(64) };
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`, named);
  const fixture = structuredClone(profile);
  fixture.stats = { ...fixture.stats, flying: true };
  fixture.systems = ['stats', 'tears', 'tear_update', 'bomb', 'laser', 'knife'];
  fixture.rules = [];
  fixture.tear_update = { behavior: 'home', strength: 1 };
  fixture.bomb = { damage: 2, radius: 80 };
  fixture.laser = { damage: 1.5 };
  fixture.knife = { damage: 1 };
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onEvaluateCache(player, CacheFlag.CACHE_FLYING); assert(player.CanFly==true)
    local data={}
    local tear={Position=Vector(0,0), Velocity=Vector(1,0), Scale=1, TearFlags=0, SpawnerEntity={ToPlayer=function() return player end}, GetData=function() return data end}
    enemies={{Position=Vector(10,0)}}
    Demo:onPostFireTear(tear)
    Demo:onPostTearUpdate(tear)
    assert(data.generatedTearUpdate.behavior=='home' and tear.Velocity.X>1)
    local bomb={ExplosionDamage=10, Radius=1, SpawnerEntity={ToPlayer=function() return player end}}
    Demo:onPostFireBomb(bomb); assert(bomb.ExplosionDamage==12 and bomb.Radius==80)
    local weaponData={}
    local laser={CollisionDamage=3, GetData=function() return weaponData end, SpawnerEntity={ToPlayer=function() return player end}}
    Demo:onPostLaserUpdate(laser); Demo:onPostLaserUpdate(laser); assert(math.abs(laser.CollisionDamage-4.5)<0.001)
    local knifeData={}
    local knife={CollisionDamage=2, GetData=function() return knifeData end, Parent={ToPlayer=function() return player end}}
    Demo:onPostKnifeUpdate(knife); assert(knife.CollisionDamage==3)
  `, fixture);
});

test('familiar and aura parameters are rejected before a pedestal or ACK', async () => {
  const fixture = structuredClone(profile);
  fixture.familiar = { type: 'sentry', damage: 4, cooldown: 30, range: 160, sprite_prompt: 'eye' };
  fixture.familiar_sprite_sheet = 'gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation = 'gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet = 'gfx/familiars/generated_familiar_sheet_00.png';
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, fixture);
  fixture.familiar.damage = 1;
  fixture.familiar.type = 'orbital';
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, fixture);
  fixture.familiar.type = 'sentry';
  fixture.familiar.attack = familiarAttack('comet');
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, fixture);
  fixture.familiar.attack = familiarAttack('single');
  fixture.familiar.type = 'melee';
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, fixture);
  fixture.familiar = { type: 'sentry', damage: 1, cooldown: 30, range: 160, sprite_prompt: 'eye' };
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, fixture);
  fixture.familiar.attack = familiarAttack('single');
  fixture.aura = { type: 'damage', damage: 1, radius: 999, cooldown: 30 };
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#events==0)`, fixture);
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
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { validateSchema } from '../../bridge/runtime.mjs';

const heartCases = [
  ['grant_half_red_hearts', 'AddHearts', 1],
  ['grant_full_red_hearts', 'AddHearts', 2],
  ['grant_black_hearts', 'AddBlackHearts', 2],
  ['grant_eternal_hearts', 'AddEternalHearts', 1],
  ['grant_bone_hearts', 'AddBoneHearts', 1],
];
const catalog = JSON.parse(await readFile(new URL('../../content-contract/capabilities.json', import.meta.url)));
const generator = await readFile(new URL('../../bridge/generate.mjs', import.meta.url), 'utf8');
const actionSchemaSource = generator.slice(generator.indexOf('const heartRewardGuidance ='), generator.indexOf('const procSchema ='));
const rewardSchema = vm.runInNewContext(actionSchemaSource + '\nactionSchema', { capabilities: catalog });

for (const [type, method, units] of heartCases) {
  test(`${type}: catalog and generator accept bounds, reject invalid amounts and invented fields`, () => {
    assert.ok(catalog.actions.includes(type));
    assert.equal(catalog.heart_rewards[type].handler, method);
    assert.equal(catalog.heart_rewards[type].units, units);
    assert.deepEqual(catalog.heart_rewards[type].amount_bounds, [1, 4]);
    for (const amount of [1, 4]) validateSchema({ type, amount }, rewardSchema);
    for (const amount of [0, -1, 5, 1.5, '1', null, undefined]) {
      assert.throws(() => validateSchema({ type, amount }, rewardSchema));
    }
    assert.throws(() => validateSchema({ type, amount: 1, handler: 'AddHearts' }, rewardSchema));
    assert.throws(() => validateSchema({ type: 'grant_gold_hearts', amount: 1 }, rewardSchema));
  });

  test(`${type}: room clear grants exact units once, persists the latch, and works in the next room`, async () => {
    for (const amount of [1, 4]) {
      const fixture = structuredClone(profile);
      fixture.rules[0].actions = [{ type, amount }];
      await run(`
        local calls={}
        for _, name in ipairs({'AddHearts','AddBlackHearts','AddEternalHearts','AddBoneHearts'}) do
          player[name]=function(_, value) calls[#calls+1]={name,value} end
        end
        nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
        Demo:onPreSpawnCleanAward(); Demo:onPreSpawnCleanAward()
        assert(#calls==1 and calls[1][1]=='${method}' and calls[1][2]==${amount * units})
        assert(player.hearts==0 and #entities==1)
        Demo:onPreGameExit(true)
        Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
        Demo:onPreSpawnCleanAward(); assert(#calls==1)
        roomIndex=2; Demo:onPreSpawnCleanAward(); assert(#calls==2)
      `, fixture);
    }
  });

  test(`${type}: native rejects invalid actions before pedestal or ACK in both rule and proc paths`, async () => {
    const badActions = [0, -1, 5, 1.5, '1', null, undefined].map(amount => ({type, amount}));
    badActions.push({type, amount:1, handler:method}, {type:'grant_gold_hearts', amount:1});
    for (const action of badActions) {
      for (const proc of [false, true]) {
        const fixture = structuredClone(profile);
        if (proc) {
          fixture.systems.push('on_kill');
          fixture.on_kill = {conditions:[], actions:[action]};
        } else fixture.rules[0].actions = [action];
        await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`, fixture);
      }
    }
  });

  test(`${type}: shared proc handler grants the same reward`, async () => {
    const fixture=structuredClone(profile);
    fixture.systems.push('on_kill');
    fixture.on_kill={conditions:[],actions:[{type,amount:1}]};
    await run(`
      local received=0
      player.${method}=function(_,amount) received=received+amount end
      nextRaw='profile'; Demo:onPostUpdate(); owns=true
      local enemy={InitSeed=9, ToPlayer=function() return nil end, ToNPC=function(self) return self end}
      Demo:onPostEntityKill(enemy); Demo:onPostEntityKill(enemy)
      assert(received==${units})
    `,fixture);
  });
}

const itemSchema = vm.runInNewContext(
  generator.slice(generator.indexOf('const HIT_TRIGGERS ='), generator.indexOf('const fixture =')) + '\nITEM_SCHEMA',
  { capabilities: catalog },
);
const tearSchema = itemSchema.properties.tear_profile;

test('explosive tear schema accepts up to three catalog flags and rejects a fourth, unknown names, and blast parameters', () => {
  assert.ok(catalog.tear_flags.includes('explosive'));
  for (const flags of [[], ['explosive'], ['explosive', 'homing', 'piercing']]) {
    validateSchema({...profile.tear_profile, flags}, tearSchema);
  }
  for (const flags of [['explosive','homing','piercing','spectral'], ['invented'], [4096]]) {
    assert.throws(() => validateSchema({...profile.tear_profile, flags}, tearSchema));
  }
  assert.throws(() => validateSchema({...profile.tear_profile, flags:['explosive'], blast_radius:100}, tearSchema));
});

test('explosive tears receive the named bit, preserve existing bits, and stop applying when unowned', async () => {
  for (const flags of [['explosive'], ['explosive','homing','piercing']]) {
    const fixture=structuredClone(profile);
    fixture.tear_profile.flags=flags;
    await run(`
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      local state=encodedValues[#encodedValues]; assert(state.runtime_contract==8)
      local function shot(native)
        local data={}
        local tear={SpawnerEntity=player,TearFlags=2,Scale=1,GetData=function() return data end}
        if native then tear.AddTearFlags=function(self,flag) self.TearFlags=self.TearFlags|flag end end
        Demo:onPostFireTear(tear)
        return tear
      end
      assert(shot(true).TearFlags==${2 | 4096 | (flags.length===3 ? 8 | 128 : 0)})
      assert(shot(false).TearFlags==${2 | 4096 | (flags.length===3 ? 8 | 128 : 0)})
      Demo:onPreGameExit(true)
      Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
      assert((shot(true).TearFlags & 4096)==4096)
      owns=false; assert(shot(true).TearFlags==2)
    `,fixture);
  }
});

test('invalid tear flags and invented explosive parameters are rejected before pedestal and ACK', async () => {
  for (const flags of [['explosive','homing','piercing','spectral'], ['invented'], [4096]]) {
    const fixture=structuredClone(profile); fixture.tear_profile.flags=flags;
    await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
  }
  const fixture=structuredClone(profile);
  fixture.tear_profile.flags=['explosive']; fixture.tear_profile.blast_radius=100;
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

test('shared familiar flag catalog supports explosive while retaining the three-flag limit', async () => {
  const fixture=structuredClone(profile);
  fixture.systems.push('familiar');
  fixture.familiar={type:'sentry',damage:1,cooldown:30,range:160,sprite_prompt:'small eye',attack:familiarAttack('single',['explosive'])};
  fixture.familiar_sprite_sheet='gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation='gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet='gfx/familiars/generated_familiar_sheet_00.png';
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`,fixture);
  fixture.familiar.attack.flags=['explosive','homing','piercing','spectral'];
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

test('confusion tear schema accepts up to three catalog flags and rejects a fourth, unknown names, and duration parameters', () => {
  assert.ok(catalog.tear_flags.includes('confusion'));
  for (const flags of [[], ['confusion'], ['confusion', 'homing', 'piercing']]) {
    validateSchema({...profile.tear_profile, flags}, tearSchema);
  }
  for (const flags of [['confusion','homing','piercing','spectral'], ['invented'], [16384]]) {
    assert.throws(() => validateSchema({...profile.tear_profile, flags}, tearSchema));
  }
  assert.throws(() => validateSchema({...profile.tear_profile, flags:['confusion'], duration:100}, tearSchema));
});

test('confusion tears receive the named bit, preserve existing bits, and stop applying when unowned', async () => {
  for (const flags of [['confusion'], ['confusion','homing','piercing']]) {
    const fixture=structuredClone(profile);
    fixture.tear_profile.flags=flags;
    await run(`
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      local state=encodedValues[#encodedValues]; assert(state.runtime_contract==8)
      local function shot(native)
        local data={}
        local tear={SpawnerEntity=player,TearFlags=2,Scale=1,GetData=function() return data end}
        if native then tear.AddTearFlags=function(self,flag) self.TearFlags=self.TearFlags|flag end end
        Demo:onPostFireTear(tear)
        return tear
      end
      assert(shot(true).TearFlags==${2 | 16384 | (flags.length===3 ? 8 | 128 : 0)})
      assert(shot(false).TearFlags==${2 | 16384 | (flags.length===3 ? 8 | 128 : 0)})
      Demo:onPreGameExit(true)
      Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
      assert((shot(true).TearFlags & 16384)==16384)
      owns=false; assert(shot(true).TearFlags==2)
    `,fixture);
  }
});

test('invalid tear flags and invented confusion parameters are rejected before pedestal and ACK', async () => {
  for (const flags of [['confusion','homing','piercing','spectral'], ['invented'], [16384]]) {
    const fixture=structuredClone(profile); fixture.tear_profile.flags=flags;
    await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
  }
  const fixture=structuredClone(profile);
  fixture.tear_profile.flags=['confusion']; fixture.tear_profile.duration=100;
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

test('shared familiar flag catalog supports confusion while retaining the three-flag limit', async () => {
  const fixture=structuredClone(profile);
  fixture.systems.push('familiar');
  fixture.familiar={type:'sentry',damage:1,cooldown:30,range:160,sprite_prompt:'small eye',attack:familiarAttack('single',['confusion'])};
  fixture.familiar_sprite_sheet='gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation='gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet='gfx/familiars/generated_familiar_sheet_00.png';
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`,fixture);
  fixture.familiar.attack.flags=['confusion','homing','piercing','spectral'];
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

test('knockback tear schema accepts up to three catalog flags and rejects a fourth, unknown names, and strength parameters', () => {
  assert.ok(catalog.tear_flags.includes('knockback'));
  for (const flags of [[], ['knockback'], ['knockback', 'homing', 'piercing']]) {
    validateSchema({...profile.tear_profile, flags}, tearSchema);
  }
  for (const flags of [['knockback','homing','piercing','spectral'], ['invented'], [16777216]]) {
    assert.throws(() => validateSchema({...profile.tear_profile, flags}, tearSchema));
  }
  assert.throws(() => validateSchema({...profile.tear_profile, flags:['knockback'], strength:100}, tearSchema));
});

test('knockback tears receive the named bit, preserve existing bits, and stop applying when unowned', async () => {
  for (const flags of [['knockback'], ['knockback','homing','piercing']]) {
    const fixture=structuredClone(profile);
    fixture.tear_profile.flags=flags;
    await run(`
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      local state=encodedValues[#encodedValues]; assert(state.runtime_contract==8)
      local function shot(native)
        local data={}
        local tear={SpawnerEntity=player,TearFlags=2,Scale=1,GetData=function() return data end}
        if native then tear.AddTearFlags=function(self,flag) self.TearFlags=self.TearFlags|flag end end
        Demo:onPostFireTear(tear)
        return tear
      end
      assert(shot(true).TearFlags==${2 | 16777216 | (flags.length===3 ? 8 | 128 : 0)})
      assert(shot(false).TearFlags==${2 | 16777216 | (flags.length===3 ? 8 | 128 : 0)})
      Demo:onPreGameExit(true)
      Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
      assert((shot(true).TearFlags & 16777216)==16777216)
      owns=false; assert(shot(true).TearFlags==2)
    `,fixture);
  }
});

test('invalid tear flags and invented knockback parameters are rejected before pedestal and ACK', async () => {
  for (const flags of [['knockback','homing','piercing','spectral'], ['invented'], [16777216]]) {
    const fixture=structuredClone(profile); fixture.tear_profile.flags=flags;
    await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
  }
  const fixture=structuredClone(profile);
  fixture.tear_profile.flags=['knockback']; fixture.tear_profile.strength=100;
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

test('shared familiar flag catalog supports knockback while retaining the three-flag limit', async () => {
  const fixture=structuredClone(profile);
  fixture.systems.push('familiar');
  fixture.familiar={type:'sentry',damage:1,cooldown:30,range:160,sprite_prompt:'small eye',attack:familiarAttack('single',['knockback'])};
  fixture.familiar_sprite_sheet='gfx/items/collectibles/generated_familiar_slot_00.png';
  fixture.familiar_animation='gfx/familiars/generated_familiar_anim_00.anm2';
  fixture.familiar_animation_sheet='gfx/familiars/generated_familiar_sheet_00.png';
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`,fixture);
  fixture.familiar.attack.flags=['knockback','homing','piercing','spectral'];
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

test('explosive, confusion, and knockback compose as three flags; a fourth is rejected', async () => {
  const fixture=structuredClone(profile);
  fixture.tear_profile.flags=['explosive','confusion','knockback'];
  validateSchema(fixture.tear_profile, tearSchema);
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
    local data={}
    local tear={SpawnerEntity=player,TearFlags=2,Scale=1,GetData=function() return data end}
    Demo:onPostFireTear(tear)
    assert(tear.TearFlags==(2|4096|16384|16777216))
  `,fixture);
  fixture.tear_profile.flags.push('homing');
  assert.throws(() => validateSchema(fixture.tear_profile,tearSchema));
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
});

import { applyRegion, applySystems, repairProfile } from '../../bridge/prompt-features.mjs';
const validateDesign = vm.runInNewContext(
  generator.slice(generator.indexOf('const HIT_TRIGGERS ='), generator.indexOf('const fixture =')) + '\n' +
  generator.slice(generator.indexOf('function repairGeneratedProfile(profile, playerPrompt)')) + '\nvalidateProfile',
  { capabilities:catalog, validateSchema, applyRegion, applySystems, repairProfile, Buffer },
);
function designFor(fixture) {
  const design=structuredClone(fixture);
  for (const key of ['version','generated_at','bridge_request_id','sprite_sheet','familiar_sprite_sheet','familiar_animation','familiar_animation_sheet']) delete design[key];
  design.region=design.systems.includes('aura') ? (design.systems.includes('familiar') ? 'familiar_aura':'aura') : (design.systems.includes('familiar') ? 'familiar':'passive');
  return design;
}
async function rejectedByBoth(fixture) {
  assert.throws(() => validateDesign(designFor(fixture)));
  await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==0 and #events==0)`,fixture);
}
test('profile-wide effect budget rejects a seventh system or more than three flags', async () => {
  const tooManySystems = structuredClone(profile);
  tooManySystems.systems.push('bomb', 'laser', 'knife', 'tear_update');
  tooManySystems.bomb = { damage: 1, radius: 80, flags: [] };
  tooManySystems.laser = { damage: 1 };
  tooManySystems.knife = { damage: 1 };
  tooManySystems.tear_update = { behavior: 'home', strength: 1 };
  await rejectedByBoth(tooManySystems);

  const tooManyFlags = structuredClone(profile);
  tooManyFlags.systems.push('bomb');
  tooManyFlags.tear_profile.flags = ['poison', 'homing', 'piercing'];
  tooManyFlags.bomb = { damage: 1, radius: 80, flags: ['poison'] };
  await rejectedByBoth(tooManyFlags);
});
const cacheHarness=`
  cacheEvaluations=0
  player.AddCacheFlags=function(_,flags) cacheRequested=flags end
  player.EvaluateItems=function(self)
    cacheEvaluations=cacheEvaluations+1
    self.Damage=3.5; self.MaxFireDelay=10; self.Luck=0
    Demo:onEvaluateCache(self,CacheFlag.CACHE_DAMAGE)
    Demo:onEvaluateCache(self,CacheFlag.CACHE_FIREDELAY)
    Demo:onEvaluateCache(self,CacheFlag.CACHE_LUCK)
  end
`;
for (const [stat,field,base,sign] of [['damage','Damage',4.5,1],['tears','MaxFireDelay',9,-1],['luck','Luck',1,1]]) {
  test(`grant_stat ${stat}: bounded cache bonus does not stack, reloads, and expires next room`,async()=>{
    for (const amount of [1,4]) {
      const fixture=structuredClone(profile);
      fixture.rules=[{trigger:'room_clear',conditions:[],actions:[{type:'grant_stat',stat,amount}]}];
      validateDesign(designFor(fixture));
      await run(cacheHarness+`
        nextRaw='profile'; Demo:onPostUpdate(); owns=true; player:EvaluateItems()
        assert(player.${field}==${base})
        Demo:onPreSpawnCleanAward(); assert(player.${field}==${base+sign*amount})
        local evaluations=cacheEvaluations
        Demo:onPreSpawnCleanAward(); assert(player.${field}==${base+sign*amount} and cacheEvaluations==evaluations)
        assert((cacheRequested & CacheFlag.CACHE_DAMAGE)~=0 and (cacheRequested & CacheFlag.CACHE_FIREDELAY)~=0 and (cacheRequested & CacheFlag.CACHE_LUCK)~=0)
        Demo:onPreGameExit(true)
        Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
        assert(player.${field}==${base+sign*amount})
        owns=false; player:EvaluateItems(); assert(player.${field}==${field==='Damage'?3.5:field==='MaxFireDelay'?10:0})
        owns=true; player:EvaluateItems()
        roomIndex=2; Demo:onPostNewRoom(); assert(player.${field}==${base})
        roomIndex=1; Demo:onPostNewRoom(); assert(player.${field}==${base})
        Demo:onPreSpawnCleanAward(); assert(player.${field}==${base+sign*amount})
        Demo:onPreGameExit(true); roomIndex=3
        Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
        assert(player.${field}==${base})
      `,fixture);
    }
  });
}

test('grant_stat works without permanent stats, across procs, and keeps player bonuses separate',async()=>{
  const fixture=structuredClone(profile);
  delete fixture.stats; delete fixture.tear_profile;
  fixture.systems=['rules','on_kill']; fixture.affects_stats=false;
  fixture.rules=[{trigger:'tear_fire',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:2}]}];
  fixture.on_kill={conditions:[],actions:[{type:'grant_stat',stat:'luck',amount:1}]};
  validateDesign(designFor(fixture));
  await run(cacheHarness+`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local other=deepCopy(player); other.InitSeed=22
    local function fire(owner) Demo:onPostFireTear({SpawnerEntity=owner,GetData=function() return {} end}) end
    fire(player); assert(player.Damage==5.5)
    other:EvaluateItems(); assert(other.Damage==3.5)
    fire(other); assert(other.Damage==5.5)
    fire(player); assert(player.Damage==5.5)
    local enemy={InitSeed=5,ToNPC=function(self) return self end}
    Demo:onPostEntityKill(enemy); assert(player.Luck==1)
    Demo:onPostEntityKill({InitSeed=6,ToNPC=enemy.ToNPC}); assert(player.Luck==1)
    other:EvaluateItems(); assert(other.Luck==0)
    roomIndex=2; Demo:onPostNewRoom(); other:EvaluateItems()
    assert(player.Damage==3.5 and player.Luck==0 and other.Damage==3.5)
  `,fixture);
});

test('grant_stat rejects unsupported stats, missing fields, extra fields, and amount bounds in rules and procs',async()=>{
  const invalid=[{type:'grant_stat',amount:1},{type:'grant_stat',stat:'speed',amount:1},{type:'grant_stat',stat:'damage',amount:1,pickup_type:'coin'},
    {type:'grant_soul_hearts',stat:'damage',amount:1}, ...[0,5,-1,1.5,'1'].map(amount=>({type:'grant_stat',stat:'damage',amount}))];
  for(const action of invalid) for(const proc of [false,true]) {
    const fixture=structuredClone(profile);
    if(proc){fixture.systems.push('on_kill');fixture.on_kill={conditions:[],actions:[action]};}
    else fixture.rules[0].actions=[action];
    await rejectedByBoth(fixture);
  }
});

test('corrupt temporary stat saves fail closed; old saves need no roomStats field',async()=>{
  const fixture=structuredClone(profile);
  fixture.rules[0].actions=[{type:'grant_stat',stat:'damage',amount:2}];
  await run(cacheHarness+`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true; Demo:onPreSpawnCleanAward(); Demo:onPreGameExit(true)
    local saved=encodedValues[savedData]; saved.roomStats.grants[1].amount=99
    Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
    player:EvaluateItems(); assert(player.Damage==3.5)
    local state=encodedValues[#encodedValues]; assert(state.blocked:find('Invalid saved room stats',1,true))
  `,fixture);
  await run(`nextRaw='profile'; Demo:onPostUpdate(); Demo:onPreGameExit(true); assert(encodedValues[savedData].roomStats==nil)
    Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
    owns=true; player.Damage=3.5; Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==4.5)`);
});

for(const [type,method] of [['slow','AddSlowing'],['burn','AddBurn'],['fear','AddFear']]) {
  test(`${type} aura: status applies only in radius on cooldown and only while owned`,async()=>{
    const fixture=structuredClone(profile);
    fixture.systems.push('aura');fixture.aura={type,radius:80,cooldown:30,duration:60,...(type==='burn'?{damage:0.5}:{})};
    validateDesign(designFor(fixture));
    await run(`
      local function enemy(x,vulnerable)
        local e={Position=Vector(x,0),hits=0,damage=0,IsVulnerableEnemy=function() return vulnerable end}
        e.TakeDamage=function(self,n) self.damage=self.damage+n end
        e.${method}=function(self,source,duration,value) self.hits=self.hits+1; self.duration=duration; self.value=value end
        return e
      end
      local inside=enemy(79,true)
      local boundary=enemy(80,true); local outside=enemy(81,true); local immune=enemy(10,false)
      enemies={inside,boundary,outside,immune}
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      frame=29; Demo:updatePassiveEffects(); assert(inside.hits==0)
      frame=30; Demo:updatePassiveEffects()
      assert(inside.hits==1 and boundary.hits==1 and outside.hits==0 and immune.hits==0)
      assert(inside.duration==60 and inside.damage==0)
      ${type!=='fear'?'assert(inside.value==0.5)':''}
      owns=false; frame=60; Demo:updatePassiveEffects(); assert(inside.hits==1)
    `,fixture);
  });
  test(`${type} aura: numeric bounds and required parameters agree in generator and native validator`,async()=>{
    const make=()=>{const f=structuredClone(profile);f.systems.push('aura');f.aura={type,radius:80,cooldown:30,duration:60,...(type==='burn'?{damage:1}:{})};return f;};
    for(const endpoint of [false,true]) {
      const f=make();Object.assign(f.aura,{duration:endpoint?120:15,radius:endpoint?180:50,cooldown:endpoint?90:15});
      if(type==='burn')f.aura.damage=endpoint?2:0.25;
      validateDesign(designFor(f));await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`,f);
    }
    for(const patch of [{duration:undefined},{duration:14},{duration:121},{duration:30.5},{radius:49},{radius:181},{cooldown:14},{cooldown:91},{type:'freeze'},{strength:0.5},...(type==='burn'?[{damage:undefined},{damage:0.24},{damage:2.1}]:[{damage:1}])]){
      const f=make();Object.assign(f.aura,patch);await rejectedByBoth(f);
    }
  });
}

test('poison bombs preserve other flags and change only marked owned bombs',async()=>{
  const fixture=structuredClone(profile);fixture.systems=['bomb'];fixture.affects_stats=false;delete fixture.stats;delete fixture.tear_profile;fixture.rules=[];
  fixture.bomb={damage:1,radius:80,flags:['poison']};validateDesign(designFor(fixture));
  await run(`
    TearFlags.TEAR_POISON=32768
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local bomb={SpawnerEntity=player,ExplosionDamage=10,Radius=40,Flags=8,AddTearFlags=function(self,f) self.Flags=self.Flags|f end}
    Demo:onPostFireBomb(bomb);assert(bomb.Flags==(8|32768) and bomb.ExplosionDamage==11 and bomb.Radius==80)
    local tear={SpawnerEntity=player,TearFlags=8,Scale=1,GetData=function() return {} end}
    Demo:onPostFireTear(tear);assert(tear.TearFlags==8)
    local weapon={SpawnerEntity=player,CollisionDamage=3,GetData=function() return {} end}
    Demo:onPostLaserUpdate(weapon);Demo:onPostKnifeUpdate(weapon);assert(weapon.CollisionDamage==3)
    owns=false; bomb.Flags=8;bomb.ExplosionDamage=10;bomb.Radius=40
    Demo:onPostFireBomb(bomb);assert(bomb.Flags==8 and bomb.ExplosionDamage==10 and bomb.Radius==40)
  `,fixture);
  await run(`nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local bomb={SpawnerEntity=player,ExplosionDamage=10,Radius=40,Flags=8,AddTearFlags=function() error('unmarked bomb changed') end}
    Demo:onPostFireBomb(bomb);assert(bomb.Flags==8 and bomb.ExplosionDamage==10 and bomb.Radius==40)`);
});

test('bomb flags are optional for old profiles; unknown, duplicate, and excessive flags reject',async()=>{
  for(const flags of [undefined,[],['poison']]){
    const f=structuredClone(profile);f.systems.push('bomb');f.bomb={damage:1,radius:80,...(flags?{flags}:{})};
    validateDesign(designFor(f));await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`,f);
  }
  for(const flags of [['burn'],['unknown'],['poison','poison'],['poison','burn'],[1],'poison']){
    const f=structuredClone(profile);f.systems.push('bomb');f.bomb={damage:1,radius:80,flags};await rejectedByBoth(f);
  }
});

const allTearFlags={homing:'TEAR_HOMING',spectral:'TEAR_SPECTRAL',piercing:'TEAR_PIERCING',poison:'TEAR_POISON',burn:'TEAR_BURN',slow:'TEAR_SLOW',fear:'TEAR_FEAR',charm:'TEAR_CHARM',bounce:'TEAR_BOUNCE',split:'TEAR_SPLIT',orbit:'TEAR_ORBIT',glow:'TEAR_GLOW',explosive:'TEAR_EXPLOSIVE',confusion:'TEAR_CONFUSION',knockback:'TEAR_KNOCKBACK'};
test('every catalog tear flag has an explicit test case',()=>assert.deepEqual([...catalog.tear_flags].sort(),Object.keys(allTearFlags).sort()));
for(const [flag,constant] of Object.entries(allTearFlags)) test(`flag audit: ${flag} maps to ${constant} for player and familiar tears`,async()=>{
  const fixture=structuredClone(profile);fixture.tear_profile.flags=[flag];fixture.systems.push('familiar');
  fixture.familiar={type:'sentry',damage:1,cooldown:30,range:160,sprite_prompt:'test eye',attack:familiarAttack('single',[flag])};
  fixture.familiar_sprite_sheet='gfx/items/collectibles/generated_familiar_slot_00.png';fixture.familiar_animation='gfx/familiars/generated_familiar_anim_00.anm2';fixture.familiar_animation_sheet='gfx/familiars/generated_familiar_sheet_00.png';
  validateDesign(designFor(fixture));
  await run(`
    TearFlags.${constant}=33554432
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local tear={SpawnerEntity=player,TearFlags=0,Scale=1,GetData=function() return {} end}
    Demo:onPostFireTear(tear);assert(tear.TearFlags==33554432)
    enemies={{Position=Vector(80,0)}};frame=30;Demo:updatePassiveEffects()
    assert(spawnedFamiliarTear.TearFlags==33554432)
  `,fixture);
});

const repairDesign = vm.runInNewContext(
  generator.slice(generator.indexOf('function repairGeneratedProfile(profile, playerPrompt)'),generator.indexOf('function validateProfile(profile)')) + '\nrepairGeneratedProfile',
  {repairProfile},
);
test('room-only stat wording does not acquire an unintended permanent stat during repair',()=>{
  for(const prompt of ['When I get hit, add damage for this room.','When I get hit, add luck until the next room.','When I get hit, add damage for the rest of this room.']) {
    const f={systems:['on_hit'],affects_stats:false,rules:[{trigger:'player_hurt',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:1}]}]};
    repairDesign(f,prompt);assert.equal(f.stats,undefined);assert.ok(!f.systems.includes('stats'));
  }
  const f={systems:['on_hit'],rules:[{trigger:'player_hurt',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:1}]}]};
  repairDesign(f,'Add luck. When I get hit, add damage for this room.');
  assert.equal(f.stats.luck,1);assert.equal(f.stats.damage,0);
});

test('new capability entries publish the fixed handlers and numeric bounds',()=>{
  assert.deepEqual(catalog.room_stat_reward.stats,['damage','tears','luck']);
  assert.deepEqual(catalog.room_stat_reward.amount_bounds,[1,4]);
  assert.equal(catalog.room_stat_reward.handler,'MC_EVALUATE_CACHE');
  for(const [type,handler] of [['slow','AddSlowing'],['burn','AddBurn'],['fear','AddFear']]) {
    const entry=catalog.aura_statuses[type];assert.equal(entry.handler,handler);
    assert.deepEqual(entry.duration_bounds,[15,120]);assert.deepEqual(entry.radius_bounds,[50,180]);assert.deepEqual(entry.cooldown_bounds,[15,90]);
  }
  assert.deepEqual(catalog.aura_statuses.burn.damage_bounds,[0.25,2]);assert.equal(catalog.aura_statuses.slow.slow_factor,0.5);
  assert.deepEqual(catalog.bomb_flags,['poison']);assert.equal(catalog.bomb_flag_effects.poison.flag,'TEAR_POISON');assert.equal(catalog.bomb_flag_effects.poison.max_flags,1);
});

test('room-stat grants use the maximum across rules on one item, and room-enter grants apply after clearing',async()=>{
  const f=structuredClone(profile);
  f.rules=[{trigger:'room_clear',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:1},{type:'grant_stat',stat:'damage',amount:4}]},
    {trigger:'room_enter',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:2}]}];
  validateDesign(designFor(f));
  await run(cacheHarness+`
    nextRaw='profile';Demo:onPostUpdate();owns=true
    Demo:onPreSpawnCleanAward();assert(player.Damage==8.5)
    Demo:onPreSpawnCleanAward();assert(player.Damage==8.5)
    roomIndex=2;Demo:onPostNewRoom();assert(player.Damage==6.5)
  `,f);
});

test('damage aura retains its original shape and rejects status-only fields',async()=>{
  const f=structuredClone(profile);f.systems.push('aura');f.aura={type:'damage',damage:1,radius:80,cooldown:30};
  validateDesign(designFor(f));await run(`nextRaw='profile';Demo:onPostUpdate();assert(events[1]=='spawn:100')`,f);
  f.aura.duration=60;await rejectedByBoth(f);
  delete f.aura.duration;delete f.aura.damage;await rejectedByBoth(f);
});

import test from 'node:test';


import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { familiarAnimationXml } from './familiar-animation.mjs';

const mainSource = await readFile(new URL('../../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
const promptSource = await readFile(new URL('../../demo/live-sprite-swap/nebius_prompt.lua', import.meta.url), 'utf8');
const conditionSource = await readFile(new URL('../../demo/live-sprite-swap/condition_metadata.lua', import.meta.url), 'utf8');
const moduleSources = Object.fromEntries(await Promise.all(['expanded_conditions', 'event_context', 'power_ledger', 'expanded_effects', 'effect_metadata', 'vanilla_audit', 'pickup_probe', 'pickup_capture'].map(async name => [name, await readFile(new URL('../../demo/live-sprite-swap/' + name + '.lua', import.meta.url), 'utf8')])));
const factory = new LuaFactory();

const mocks = `
frame, now, held, owns, stage, roomIndex = 0, 0, false, false, 1, 1
logs, events, entities, uiCallbacks, familiarTears, projectiles, itemBanners, friendlies = {}, {}, {}, {}, {}, {}, {}, {}
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
Keyboard = { KEY_8=8, KEY_KP_8=108, KEY_A=65, KEY_B=66, KEY_SPACE=32,
 KEY_BACKSPACE=259, KEY_ENTER=257, KEY_ESCAPE=256, KEY_LEFT_SHIFT=340,
 KEY_UP=265, KEY_DOWN=264, KEY_LEFT=263, KEY_RIGHT=262 }
MouseButton = { LEFT=0 }
keyDown,mouseDown,mousePosition={},false,Vector(-1,-1)
Input = { IsButtonPressed = function(key) return ((key==8 or key==108) and held) or keyDown[key] or false end,
 GetMousePosition=function() return mousePosition end, IsMouseBtnPressed=function() return mouseDown end }
EntityType = { ENTITY_TEAR=2, ENTITY_PICKUP=5, ENTITY_FAMILIAR=3, ENTITY_PROJECTILE=9, ENTITY_ATTACKFLY=18, ENTITY_SPIDER=85, ENTITY_POOTER=14 }
PickupVariant = { PICKUP_COLLECTIBLE=100, PICKUP_COIN=20, PICKUP_KEY=30, PICKUP_BOMB=40, PICKUP_HEART=10, PICKUP_PILL=70, PICKUP_TAROTCARD=300, PICKUP_LIL_BATTERY=90, PICKUP_TRINKET=350, PICKUP_CHEST=50, PICKUP_GRAB_BAG=69 }
FamiliarVariant = { PUNCHING_BAG=67 }
TearVariant = { BLUE=0 }
EntityPartition = { ENEMY=1 }
function EntityRef() return {} end
function RegisterMod() return { AddCallback = function(self,name,callback) if name=='MC_POST_SAVESLOT_LOAD' then callback(self,1,true,1) end end,
 SaveData=function(_,value) savedData=value end, HasData=function() return savedData~=nil end,
 LoadData=function() return savedData end } end
spritesheetReplacements, pedestalLayerVisible = 0, true
function Sprite() return { Load=function() end, ReplaceSpritesheet=function() spritesheetReplacements=spritesheetReplacements+1 end, LoadGraphics=function() end, Play=function() end, RenderLayer=function() end,
 GetLayer=function() return { SetVisible=function(_, visible) pedestalLayerVisible=visible end } end } end
function SFXManager() return { Play=function() end } end
player = { InitSeed=11, Position=Vector(0,0), Damage=3.5, MaxFireDelay=10, TearRange=100, Luck=0, ShotSpeed=1, MoveSpeed=1, hearts=0, CanFly=false, ToPlayer=function(self) return self end,
 HasCollectible=function() return owns end, AddCacheFlags=function() end, EvaluateItems=function() end,
 AddSoulHearts=function(self, amount) self.hearts=self.hearts+amount end }
hudVisible=true
hud = { ShowItemText=function(_, title, subtitle) itemBanners[#itemBanners+1]={title, subtitle} end,
 SetVisible=function(_, visible) hudVisible=visible end }
function Game() return { GetFrameCount=function() return frame end, GetNumPlayers=function() return 1 end,
 GetHUD=function() return hud end,
 GetRoom=function() return { FindFreePickupSpawnPosition=function(_, position) return position end } end,
 GetLevel=function() return { GetCurrentRoomIndex=function() return roomIndex end, GetAbsoluteStage=function() return stage end } end } end
Isaac = { DebugString=function(message) logs[#logs+1]=message end, GetItemIdByName=function(name) if name=="AI Item" then return 797 end; if name=="Singularity Terminal" then return 900 end; local generator=name:match("^Generator (%d+)$"); if generator then return 820+tonumber(generator) end; if name:match("^Generated Active") then return 798+tonumber(name:match("(%d+)$")) end; return 733+tonumber(name:match("(%d+)$")) end,
 GetSoundIdByName=function() return 1 end, GetTime=function() return now+frame*34 end, GetPlayer=function() return player end,
 FindByType=function(entityType)
  if entityType==EntityType.ENTITY_PROJECTILE then return projectiles end
  if entityType==EntityType.ENTITY_ATTACKFLY or entityType==EntityType.ENTITY_SPIDER or entityType==EntityType.ENTITY_POOTER then
   local found={}
   for _, npc in ipairs(friendlies) do if npc.Type==entityType then found[#found+1]=npc end end
   return found
  end
  return entities
 end, WorldToScreen=function(position) return position end, RenderText=function() end,
 GetScreenWidth=function() return 800 end, GetScreenHeight=function() return 600 end,
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
   setmetatable(familiar,{
    __index={CanBlockProjectiles=function() return false end},
    __newindex=function(self,key,value)
     if key=='CanBlockProjectiles' then error("no member named 'CanBlockProjectiles'") end
     rawset(self,key,value)
    end,
   })
   spawnedFamiliar=familiar
   return familiar
  end
  if entityType==EntityType.ENTITY_ATTACKFLY or entityType==EntityType.ENTITY_SPIDER or entityType==EntityType.ENTITY_POOTER then
   local data={}; local npc={Position=position, Type=entityType, GetData=function() return data end, Exists=function() return data.dead~=true end, AddCharmed=function(self, _, duration) self.charmed=duration end}
   friendlies[#friendlies+1]=npc
   function npc:Remove() data.dead=true end
   return npc
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
package.preload.json = function() return { EMPTY_OBJECT={}, EMPTY_ARRAY={}, decode=function(raw) if raw=='bad' then error('bad JSON') end; return encodedValues[raw] or envelope end,
 encode=function(value)
  if value.prompt then lastRequest=value end
  local key='encoded_'..tostring(#encodedValues+1)
  encodedValues[#encodedValues+1]=deepCopy(value); encodedValues[key]=deepCopy(value)
  return key
 end } end
function include(name)
 if name=='condition_metadata' then return assert(load(conditionSource))() end
 if moduleSources and moduleSources[name] then return assert(load(moduleSources[name]))() end
 assert(name=='nebius_prompt')
 local module=assert(load(promptSource))()
 local original=module.new
 module.new=function(...)
  local prompt=original(...)
  uiPrompt=prompt
  uiCallbacks.input=function(value) prompt.text=value end
  uiCallbacks.submit=function() prompt:submit() end
  uiCallbacks.randomize=function() prompt:randomize() end
  uiCallbacks.close=function() prompt:close() end
  return prompt
 end
 return module
end
NebiusBridge = { Poll=function() local result=nextRaw; nextRaw=nil; return result end,
 Ack=function(id) events[#events+1]='ack:'..id; return true end }
windows,uiShown=0,false
Renderer = { LoadImage=function(path)
 if path=='gfx/nebius_creator/white.png' then return { Render=function() end } end
 return { Render=function() events[#events+1]='render' end }
end }
SourceQuad = { NewFromRectangle=function() return {} end }
DestinationQuad = { NewFromRectangle=function(position, width, height) lastDestination={x=position.X,y=position.Y,width=width,height=height}; return {} end }
`;

async function run(body) {
  const engine = await factory.createEngine();
  try {
    engine.global.set('promptSource', promptSource);
    engine.global.set('conditionSource', conditionSource);
    engine.global.set('moduleSources', moduleSources);
    engine.global.set('mainSource', mainSource);
    engine.global.set('familiarAnimationSource', familiarAnimationXml('familiars/generated_familiar_sheet_00.png'));
    engine.global.set('nativeSprite', { Load() {}, ReplaceSpritesheet() {}, LoadGraphics() {}, Play() {} });
    await engine.doString(mocks);
    await engine.doString('Demo = assert(load(mainSource .. [[\nprobe={validate=validateProfile,proc=validProc,combat=combat,nearest=nearestEnemy,mayRun=ruleMayRun,grant=grantRoomStat,prune=pruneRoomStats,summary=effectSummary,sprite=applyFamiliarSprite,install=function(record)\nrecord.metadata=record.metadata or {}; record.visuals=record.visuals or {}; record.rules=record.rules or {}\nlocal index=#records+1; records[index]=record; runtime[index]=makeProfile(record); applyIdentity(index,runtime[index]); rebuildSystems(); return runtime[index]\nend}\nreturn Demo]]))()');
    await engine.doString('Demo:onGameStarted(false); math.randomseed(123); owns=true');
    await engine.doString(body);
  } finally {
    engine.global.close();
  }
}

test('native Sprite userdata can load the generated familiar animation', async () => {
  await run(`
    assert(type(nativeSprite)=='userdata')
    local data={}
    local familiar={GetSprite=function() return nativeSprite end,GetData=function() return data end}
    local profile={familiar={type='normal'},familiarAnimation='generated.anm2',familiarAnimationSheet='generated.png'}
    assert(probe.sprite(familiar,profile) and data.generatedSprite and familiar.Visible)
  `);
});

test('native follower directions remain valid on generated normal and idle melee familiars', async () => {
  for (const mode of ['normal', 'melee']) {
    await run(`
      local allowed={}
      for name in familiarAnimationSource:gmatch('<Animation Name="([^"]+)"') do allowed[name]=true end
      local requested='FloatDown'
      local spawns=0
      local originalSpawn=Isaac.Spawn
      Isaac.Spawn=function(entityType,...)
        local actor=originalSpawn(entityType,...)
        if entityType==EntityType.ENTITY_FAMILIAR then
          spawns=spawns+1
          local sprite={Load=function() end,ReplaceSpritesheet=function() end,LoadGraphics=function() end,
            Play=function(_,name) assert(allowed[name],'missing generated clip '..name);actor.animation=name end}
          actor.GetSprite=function() return sprite end
          actor.FollowParent=function(self) self:GetSprite():Play(requested,true) end
          actor.Remove=function(self) self.removed=true end
          actor.Exists=function(self) return not self.removed end
        end
        return actor
      end
      local profile=probe.install({systems={'familiar'},familiar={type='${mode}',damage=0.5,cooldown=60,range=120,
        attack=${mode === 'normal' ? "{pattern='single',flags={},color={r=1,g=1,b=1,a=1},scale=1,speed=6}" : 'nil'}},
        familiar_animation='gfx/familiars/generated_familiar_anim_00.anm2',
        familiar_animation_sheet='gfx/familiars/generated_familiar_sheet_00.png'})
      for index,name in ipairs({'FloatDown','FloatSide','FloatUp','FloatDown'}) do
        requested=name;frame=index;Demo:updatePassiveEffects()
        local actor=profile.familiarEntities['11']
        assert(actor and actor:GetData().generatedSprite and actor.Visible and actor.animation==name)
        Demo:onFamiliarUpdate(actor)
        assert(spawns==1 and not actor.removed)
      end
      owns=false;frame=5;Demo:updatePassiveEffects()
      assert(profile.familiarEntities['11']==nil and spawnedFamiliar.removed)
    `);
  }
});

test('familiar profiles validate every canonical slot and reject mismatched or out-of-range assets', async () => {
  await run(`
    local profile={version=1,generated_at='2026-10-25',bridge_request_id='familiar_slots',
      metadata={display_name='Slot guardian',description='A small shield',quality=4,theme='none',balance_note=''},
      systems={'familiar'},affects_stats=false,visuals={pedestal_prompt='a guardian'},rules={},
      familiar={type='shield',damage=1,cooldown=30,range=100,sprite_prompt='a tiny guardian'}}
    local function assets(slot)
      profile.sprite_sheet=string.format('gfx/items/collectibles/generated_slot_%02d.png',slot)
      profile.familiar_sprite_sheet=string.format('gfx/items/collectibles/generated_familiar_slot_%02d.png',slot)
      profile.familiar_animation=string.format('gfx/familiars/generated_familiar_anim_%02d.anm2',slot)
      profile.familiar_animation_sheet=string.format('gfx/familiars/generated_familiar_sheet_%02d.png',slot)
    end
    for slot=0,127 do
      assets(slot);local valid,reason=probe.validate(profile,profile.bridge_request_id)
      assert(valid,tostring(slot)..': '..tostring(reason))
    end
    for _,slot in ipairs({-1,128,999}) do
      assets(slot);assert(not probe.validate(profile,profile.bridge_request_id))
    end
    for _,field in ipairs({'sprite_sheet','familiar_sprite_sheet','familiar_animation','familiar_animation_sheet'}) do
      for _,invalid in ipairs({'../elsewhere.png','gfx/familiars/generated_familiar_anim_127.anm2.extra',''}) do
        assets(127);profile[field]=invalid;assert(not probe.validate(profile,profile.bridge_request_id))
      end
    end
    for _,field in ipairs({'familiar_sprite_sheet','familiar_animation','familiar_animation_sheet'}) do
      assets(127);local validAsset=profile[field]
      assets(0);profile[field]=validAsset;assert(not probe.validate(profile,profile.bridge_request_id))
    end
    assets(0);profile.sprite_sheet='gfx/items/collectibles/generated_slot_000.png'
    assert(not probe.validate(profile,profile.bridge_request_id))
  `);
});

test('shield updates preserve native query methods and do not abort later familiar updates', async () => {
  await run(`
    local shieldProfile=probe.install({systems={'familiar'},familiar={type='shield',damage=1,cooldown=30,range=100}})
    local followerProfile=probe.install({systems={'familiar'},familiar={type='normal',damage=0.5,cooldown=30,range=120,
      attack={pattern='single',flags={},color={r=1,g=1,b=1,a=1},scale=1,speed=6}}})
    local nearRemovals,farRemovals=0,0
    projectiles={
      {Type=EntityType.ENTITY_PROJECTILE,Position=Vector(0,0),Remove=function() nearRemovals=nearRemovals+1 end},
      {Type=EntityType.ENTITY_PROJECTILE,Position=Vector(100,0),Remove=function() farRemovals=farRemovals+1 end},
    }
    enemies={{Position=Vector(60,0)}}
    frame=30;Demo:updatePassiveEffects()
    local actor=shieldProfile.familiarEntities['11']
    assert(type(actor.CanBlockProjectiles)=='function' and actor:CanBlockProjectiles()==false)
    assert(not pcall(function() actor.CanBlockProjectiles=true end))
    assert(nearRemovals==1 and farRemovals==0)
    assert(followerProfile.familiarEntities['11'].followedParent and #familiarTears==1)
    Demo:onFamiliarUpdate(actor)
    assert(nearRemovals==1 and #familiarTears==1)
    local collided=0
    assert(Demo:onPreProjectileCollision({Remove=function() collided=collided+1 end},actor)==false and collided==1)
    frame=31;Demo:updatePassiveEffects()
    assert(nearRemovals==2 and farRemovals==0 and #familiarTears==1)
    assert(shieldProfile.familiarEntities['11']==actor and actor:CanBlockProjectiles()==false)
  `);
});

test('shield hit cooldown belongs to its player actor, not the shared item', async () => {
  await run(`
    local profile=probe.install({systems={'familiar'},familiar={type='shield',damage=1,cooldown=30,range=100}})
    local second={InitSeed=22,Position=Vector(0,0),HasCollectible=function() return true end,ToPlayer=function(self) return self end}
    local function shield(owner)
      local data={}
      return {Player=owner,Exists=function() return true end,GetData=function() return data end}
    end
    profile.familiarEntities['11']=shield(player); profile.familiarEntities['22']=shield(second)
    assert(Demo:onEntityTakeDamage(player,1,0,{})==false)
    assert(Demo:onEntityTakeDamage(player,1,0,{})==nil)
    assert(Demo:onEntityTakeDamage(second,1,0,{})==false)
    frame=30; assert(Demo:onEntityTakeDamage(player,1,0,{})==false)
  `);
});

test('removed-source and duplicate orphan shields cannot block projectiles', async () => {
  await run(`
    local profile=probe.install({systems={'familiar'},familiar={type='shield',damage=1,cooldown=30,range=100}})
    local function shield()
      local data={generatedFamiliarIndex=1}
      return {Player=player,ToFamiliar=function(self) return self end,GetData=function() return data end}
    end
    local current,orphan=shield(),shield(); profile.familiarEntities['11']=current
    local removed=0; local shot={Remove=function() removed=removed+1 end}
    assert(Demo:onPreProjectileCollision(shot,orphan)==nil and removed==0)
    owns=false; assert(Demo:onPreProjectileCollision(shot,current)==nil and removed==0)
    owns=true; assert(Demo:onPreProjectileCollision(shot,current)==false and removed==1)
  `);
});

test('targeting chooses the nearest live hostile rather than the first partition member', async () => {
  await run(`
    EntityFlag={FLAG_FRIENDLY=1}
    local friendly={Position=Vector(1,0),HasEntityFlags=function() return true end}
    local dead={Position=Vector(2,0),IsDead=function() return true end}
    local immune={Position=Vector(3,0),IsVulnerableEnemy=function() return false end}
    local far={Position=Vector(70,0)}; local near={Position=Vector(10,0)}
    enemies={friendly,dead,immune,far,near}; assert(probe.nearest(Vector(0,0),80)==near)
    enemies={friendly,dead,immune}; assert(probe.nearest(Vector(0,0),80)==nil)
  `);
});

test('orphan familiar callbacks remove only the orphan and preserve the current actor', async () => {
  await run(`
    local profile=probe.install({systems={'familiar'},familiar={type='melee',damage=1,cooldown=30,range=100}})
    local current={}; profile.familiarEntities['11']=current
    local removed=false; local data={generatedFamiliarIndex=1}
    local orphan={Player=player,GetData=function() return data end,Remove=function() removed=true end}
    Demo:onFamiliarUpdate(orphan)
    assert(removed and profile.familiarEntities['11']==current and data.tickedFrame==nil)
  `);
});

test('expired cooldown keys cannot bypass the 256-entry per-item bound', async () => {
  await run(`
    local profile=probe.install({systems={}})
    profile.cooldowns['11:retry']=1
    for index=1,256 do profile.cooldowns['11:target:'..index]=100 end
    frame=2
    assert(not probe.mayRun(profile,{cooldown=30,actions={}},'retry',player))
    local count=0; for _ in pairs(profile.cooldowns) do count=count+1 end
    assert(count==256 and profile.cooldowns['11:retry']==nil)
  `);
});

test('inactive damage and familiar callbacks do not inspect unrelated entity data', async () => {
  await run(`
    local untouched={ToPlayer=function() error('inactive player inspection') end,ToFamiliar=function() error('inactive familiar inspection') end,GetData=function() error('inactive data inspection') end}
    Demo:onEntityTakeDamage(untouched,1,0,{Entity=untouched})
    Demo:onPostEntityRemove(untouched)
    probe.install({systems={'familiar'},familiar={type='normal',damage=1,cooldown=30,range=100}})
    Demo:onEntityTakeDamage({ToPlayer=function() return nil end},1,0,{Entity=untouched})
  `);
});

test('engine kill source overrides a stale pre-damage owner and generated bursts cannot recurse', async () => {
  await run(`
    probe.install({systems={'on_kill'},on_kill={cooldown=30,conditions={},actions={{type='damage_burst',amount=1,radius=80}}}})
    local second={InitSeed=22,HasCollectible=function() return true end,ToPlayer=function(self) return self end}
    local originalGame=Game
    Game=function() local game=originalGame(); game.GetNumPlayers=function() return 2 end; return game end
    Isaac.GetPlayer=function(index) return index==0 and player or second end
    local data={generatedDamageOwner=player,generatedDamageFrame=0}
    local dead={InitSeed=100,Position=Vector(0,0),GetData=function() return data end,ToNPC=function(self) return self end,IsEnemy=function() return true end}
    local credited={}; local target={Position=Vector(10,0),ToNPC=function(self) return self end}
    local oldDamage=probe.combat.damage
    probe.combat.damage=function(_,_,owner) credited[#credited+1]=owner end
    enemies={target}; Demo:onPostEntityKill(dead,{Entity=second}); assert(#credited==1 and credited[1]==second)
    local unknownData={generatedDamageOwner=player,generatedDamageFrame=0}
    dead.GetData=function() return unknownData end
    Demo:onPostEntityKill(dead,{}); assert(#credited==1)
    local chainedData={}; dead.GetData=function() return chainedData end
    probe.combat.depth=1; Demo:onPostEntityKill(dead,{Entity=player}); probe.combat.depth=0
    assert(#credited==1); probe.combat.damage=oldDamage
  `);
});

test('tear impact resolves nested weapon ownership and keeps each item independent', async () => {
  await run(`
    local function install() return probe.install({systems={'tear_impact'},tear_impact={cooldown=30,actions={{type='apply_status',amount=1,status='slow',duration=30}}}}) end
    install()
    local data={}; local tear={SpawnerEntity={Parent=player},GetData=function() return data end}
    local hits=0; local enemy={Position=Vector(0,0),ToNPC=function(self) return self end,AddSlowing=function() hits=hits+1 end}
    Demo:onPreTearCollision(tear,enemy); Demo:onPreTearCollision(tear,enemy); assert(hits==1)
    install(); Demo:onPreTearCollision(tear,enemy); assert(hits==2)
  `);
});

test('duration ledger expires and source loss clears only the removed item', async () => {
  await run(`
    local first=probe.install({systems={}}); local second=probe.install({systems={}})
    local caches=0; player.EvaluateItems=function() caches=caches+1 end
    local action={type='grant_stat',stat='damage',amount=1,duration=15,stack_limit=2}
    probe.grant(first,player,action,'first'); probe.grant(first,player,action,'first'); probe.grant(first,player,action,'first')
    probe.grant(second,player,{type='grant_stat',stat='damage',amount=3},'legacy')
    player.Damage=0; Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==5 and caches==3)
    player.HasCollectible=function(_,id) return id==734 end; probe.prune()
    player.Damage=0; Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==3)
    owns=true; player.HasCollectible=function() return true end; probe.grant(first,player,action,'first')
    frame=15; probe.prune(); player.Damage=0; Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==3)
  `);
});

test('weapon bonus tracks owner changes and engine recalculation without accumulating', async () => {
  await run(`
    probe.install({systems={'laser','knife'},laser={damage=2,color={r=0.25,g=1,b=0.65,a=1}},knife={damage=2,color={r=0.85,g=0.35,b=1,a=1}}})
    for _,method in ipairs({'onPostLaserUpdate','onPostKnifeUpdate'}) do
      local data={}; local weapon={SpawnerEntity=player,CollisionDamage=3,GetData=function() return data end}
      local colors={}
      weapon.SetColor=function(_,color,duration) colors[#colors+1]={color=color,duration=duration} end
      Demo[method](Demo,weapon); Demo[method](Demo,weapon); assert(weapon.CollisionDamage==5)
      assert(#colors==2 and colors[1].duration==2 and colors[1].color[4]==1)
      assert(colors[1].color[1]~=colors[1].color[2])
      weapon.SpawnerEntity={ToPlayer=function() return nil end}; Demo[method](Demo,weapon); assert(weapon.CollisionDamage==3)
      assert(#colors==2)
      weapon.SpawnerEntity=player; weapon.CollisionDamage=7; Demo[method](Demo,weapon); assert(weapon.CollisionDamage==9)
      owns=false; local previousColors=#colors; Demo[method](Demo,weapon); assert(weapon.CollisionDamage==7 and #colors==previousColors); owns=true
    end
  `);
});

test('explosion immunity is owner-scoped, explosion-only and stops immediately on source loss', async () => {
  await run(`
    DamageFlag={DAMAGE_EXPLOSION=4}
    probe.install({systems={'stats'},affects_stats=true,stats={explosion_immunity=true}})
    assert(Demo:onEntityTakeDamage(player,1,4,{})==false)
    assert(Demo:onEntityTakeDamage(player,1,5,{})==false)
    assert(Demo:onEntityTakeDamage(player,1,0,{})==nil)
    local other={InitSeed=22,ToPlayer=function(self) return self end,HasCollectible=function() return false end}
    assert(Demo:onEntityTakeDamage(other,1,4,{})==nil)
    local enemy={ToPlayer=function() return nil end}
    assert(Demo:onEntityTakeDamage(enemy,1,4,{})==nil)
    probe.combat.depth=1
    assert(Demo:onEntityTakeDamage(player,1,4,{})==false)
    probe.combat.depth=0;owns=false
    assert(Demo:onEntityTakeDamage(player,1,4,{})==nil)
    owns=true
    assert(Demo:onEntityTakeDamage(player,1,4,{})==false)
    assert(probe.summary({stats={explosion_immunity=true}}):lower():find('explosion immunity',1,true))
  `);
});

test('generated explosive tears include protection without requiring an extra rolled system', async () => {
  await run(`
    DamageFlag={DAMAGE_EXPLOSION=4}
    local record={systems={'tears'},tear_profile={flags={'explosive'},color={r=0.7,g=0.8,b=1,a=1},scale=1}}
    probe.install(record)
    assert(Demo:onEntityTakeDamage(player,1,4,{})==false)
    assert(Demo:onEntityTakeDamage(player,1,2,{})==nil)
    assert(probe.summary(record):lower():find('explosion immunity',1,true))
    owns=false
    assert(Demo:onEntityTakeDamage(player,1,4,{})==nil)
  `);
});

test('confirmed hurt retaliation resolves projectile attackers without crediting player-owned shots', async () => {
  await run(`
    probe.install({systems={'on_hit'},rules={{trigger='player_hurt',conditions={},cooldown=30,actions={{type='retaliate',amount=2}}}}})
    local damage=0; local attacker={ToNPC=function(self) return self end,TakeDamage=function(_,amount) damage=damage+amount end}
    local projectile={SpawnerEntity=attacker}; local source={Entity=projectile}
    Demo:onEntityTakeDamage(player,1,0,source); assert(damage==0)
    Demo:onPostEntityTakeDamage(player,1,0,source); assert(damage==2)
    Demo:onPostEntityTakeDamage(player,1,0,source); assert(damage==2)
    frame=30; Demo:onPostEntityTakeDamage(player,1,0,source); assert(damage==4)
    assert(probe.combat.attacker({SpawnerEntity=player})==nil)
    local cycle={}; cycle.Parent=cycle; assert(probe.combat.attacker(cycle)==nil)
  `);
});

test('summaries show hurt retaliation and numeric familiar, aura, proc and tear limits', async () => {
  await run(`
    local summary=probe.summary({rules={{trigger='player_hurt',cooldown=30,actions={{type='retaliate',amount=2}}}},
      player_hurt={cooldown=60,actions={{type='retaliate',amount=1}}},
      on_kill={cooldown=45,actions={{type='damage_burst',amount=2,radius=80}}},
      familiar={type='melee',damage=2,cooldown=30,range=100},
      aura={type='burn',damage=1,cooldown=30,duration=60,radius=80,triggered=true},tear_update={behavior='home',strength=1}})
    for _,phrase in ipairs({'retaliates for 2 damage','60 frame cooldown','max 8 enemies','2 base damage','24 contact radius, max 1 target','80 radius','60 status frames','only while activated','combined cap 2','max 1 target within 240'}) do
      assert(summary:lower():find(phrase,1,true),phrase..' missing from '..summary)
    end
  `);
});

test('rule and proc validators reject chance fields on scope conditions', async () => {
  await run(`
    local action={type='spawn_pickup',pickup_type='coin',amount=1}
    local profile={version=1,generated_at='2026-10-22',bridge_request_id='condition_audit',sprite_sheet='gfx/items/collectibles/generated_slot_00.png',
      metadata={display_name='Scope audit',description='Drops a coin',quality=4,theme='none',balance_note=''},
      systems={'rules'},affects_stats=false,visuals={pedestal_prompt='a coin'},rules={{trigger='room_clear',conditions={},actions={action}}}}
    assert(probe.validate(profile,profile.bridge_request_id))
    for _,kind in ipairs({'once_per_room','once_per_floor'}) do
      local condition={type=kind}; profile.rules[1].conditions={condition}
      local proc={conditions={condition},actions={action}}
      assert(probe.validate(profile,profile.bridge_request_id) and probe.proc(proc,'on_kill'))
      for _,chance in ipairs({0,0.5,1,false,'0.5'}) do
        condition.chance=chance
        local valid,reason=probe.validate(profile,profile.bridge_request_id)
        assert(not valid and type(reason)=='string' and reason:find('chance',1,true) and reason:find(kind,1,true))
        assert(not probe.proc(proc,'on_kill'))
      end
    end
    for _,chance in ipairs({0,0.5,1}) do
      local condition={type='chance',chance=chance}; profile.rules[1].conditions={condition}
      assert(probe.validate(profile,profile.bridge_request_id) and probe.proc({conditions={condition},actions={action}},'on_kill'))
    end
    profile.rules[1].conditions={{type='chance'}}
    assert(not probe.validate(profile,profile.bridge_request_id))
    assert(not probe.proc({conditions={{type='chance'}},actions={action}},'on_kill'))
  `);
});

test('cooldowns and failed chances stay independent across items and players', async () => {
  await run(`
    local first=probe.install({systems={}}); local second=probe.install({systems={}})
    local other={InitSeed=22}
    local rule={cooldown=30,conditions={},actions={}}
    assert(probe.mayRun(first,rule,1,player))
    assert(not probe.mayRun(first,rule,1,player))
    assert(probe.mayRun(first,rule,1,other) and probe.mayRun(second,rule,1,player))
    local original=math.random; math.random=function() return 0.75 end
    local conditional={cooldown=30,conditions={{type='chance',chance=0.5},{type='once_per_room'}},actions={}}
    assert(not probe.mayRun(first,conditional,2,player))
    math.random=function() return 0.25 end
    assert(probe.mayRun(first,conditional,2,player)); math.random=original
    frame=30; assert(probe.mayRun(first,rule,1,player) and not probe.mayRun(first,conditional,2,player))
  `);
});

test('nearby hurt retaliation bounds unique enemies by player radius and eight targets, never on unconfirmed damage', async () => {
  await run(`
    probe.install({systems={'on_hit'},rules={{trigger='player_hurt',conditions={},cooldown=30,actions={{type='retaliate',amount=2,target_mode='nearby',radius=80}}}}})
    EntityFlag={FLAG_FRIENDLY=1}
    local hits,queries=0,0
    local function enemy(position,extra)
      local target={Position=position,ToNPC=function(self) return self end,TakeDamage=function(self,amount) self.hits=(self.hits or 0)+1; hits=hits+amount end}
      for key,value in pairs(extra or {}) do target[key]=value end
      return target
    end
    local outside=enemy(Vector(80.01,0)); local diagonal=enemy(Vector(60,60))
    local friendly=enemy(Vector(0,0),{HasEntityFlags=function() return true end})
    local dead=enemy(Vector(0,0),{IsDead=function() return true end})
    local immune=enemy(Vector(0,0),{IsVulnerableEnemy=function() return false end})
    local boundary=enemy(Vector(80,0)); local duplicate=enemy(Vector(0,0))
    enemies={outside,diagonal,friendly,dead,immune,{},boundary,duplicate,duplicate}
    for index=1,10 do enemies[#enemies+1]=enemy(Vector(index,0)) end
    Isaac.FindInRadius=function(origin,radius,partition)
      assert(origin==player.Position and radius==80 and partition==EntityPartition.ENEMY)
      queries=queries+1; return enemies
    end
    Demo:onEntityTakeDamage(player,1,0,nil); assert(hits==0 and queries==0)
    Demo:onPostEntityTakeDamage(player,1,0,nil)
    assert(hits==16 and queries==1 and boundary.hits==1 and duplicate.hits==1)
    assert(not outside.hits and not diagonal.hits and not friendly.hits and not dead.hits and not immune.hits)
    Demo:onPostEntityTakeDamage(player,1,0,nil); assert(hits==16 and queries==1)
    frame=30; Demo:onPostEntityTakeDamage(player,1,0,nil); assert(hits==32 and queries==2)
    local summary=probe.summary({rules={{trigger='player_hurt',actions={{type='retaliate',amount=2,target_mode='nearby',radius=80}}}}})
    assert(summary:find('80 radius',1,true) and summary:find('max 8 enemies',1,true))
  `);
});

test('nearby retaliation rejects other event contexts and generated damage cannot recurse', async () => {
  await run(`
    local action={type='retaliate',amount=2,target_mode='nearby',radius=40}
    probe.install({systems={'on_hit'},rules={{trigger='player_hurt',conditions={},cooldown=30,actions={action}}}})
    local hits,queries=0,0
    local target={Position=Vector(0,0),ToNPC=function(self) return self end,TakeDamage=function()
      hits=hits+1
      assert(probe.combat.depth==1)
      Demo:onEntityTakeDamage(player,1,0,nil)
      Demo:onPostEntityTakeDamage(player,1,0,nil)
      probe.combat.apply(action,player,{owner=player,trigger='player_hurt',confirmed=true})
    end}
    Isaac.FindInRadius=function() queries=queries+1; return {target} end
    for _,trigger in ipairs({'enemy_hit','on_kill','tear_impact','room_clear'}) do
      probe.combat.apply(action,player,{owner=player,target=target,trigger=trigger,confirmed=true})
    end
    assert(hits==0 and queries==0)
    probe.combat.apply(action,player,{owner=player,target=target,trigger='collision',confirmed=true})
    assert(hits==1 and queries==1)
    hits,queries=0,0
    probe.combat.apply(action,player,{owner=player,trigger='player_hurt'})
    probe.combat.apply(action,player,{owner={},trigger='player_hurt',confirmed=true})
    assert(hits==0 and queries==0)
    Demo:onPostEntityTakeDamage(player,1,0,nil)
    assert(hits==1 and queries==1 and probe.combat.depth==0)
    frame=30; target.TakeDamage=function() error('engine damage rejected') end
    Demo:onPostEntityTakeDamage(player,1,0,nil); assert(probe.combat.depth==0)
  `);
});

test('explicit attacker mode follows hurt projectile ownership while collision remains collider-only', async () => {
  await run(`
    local action={type='retaliate',amount=3,target_mode='attacker'}
    probe.install({systems={'on_hit','collision'},rules={{trigger='player_hurt',conditions={},cooldown=30,actions={action}}},collision={conditions={},cooldown=30,actions={action}}})
    local hits,otherHits=0,0
    local attacker={ToNPC=function(self) return self end,TakeDamage=function(_,amount) hits=hits+amount end}
    local other={ToNPC=function(self) return self end,TakeDamage=function(_,amount) otherHits=otherHits+amount end}
    local projectile={SpawnerEntity=attacker}
    Isaac.FindInRadius=function() error('attacker mode must not query a radius') end
    Demo:onPostEntityTakeDamage(player,1,0,{Entity=projectile}); assert(hits==3)
    probe.combat.apply(action,player,{owner=player,target=projectile,trigger='collision'}); assert(hits==3)
    probe.combat.apply(action,player,{owner=player,target=other,trigger='collision'}); assert(otherHits==3 and hits==3)
    probe.combat.apply({type='retaliate',amount=1},player,{owner=player,target=projectile,trigger='player_hurt',confirmed=true}); assert(hits==4)
  `);
});

import assert from 'node:assert/strict';
import { validateProfile as validateDesign } from '../../bridge/generate.mjs';
import { profileWeight } from '../../bridge/weights.mjs';

function retaliationDesign(action, trigger = 'player_hurt') {
  const direct = ['collision', 'on_kill', 'tear_impact'].includes(trigger);
  const proc = { conditions: [], actions: [action], cooldown: 30 };
  return {
    region: 'passive', systems: [direct ? trigger : ['player_hurt', 'enemy_hit'].includes(trigger) ? 'on_hit' : 'rules'], affects_stats: false,
    metadata: { display_name: 'Thorn', description: 'Retaliates', quality: 4, theme: 'none', balance_note: '' },
    visuals: { pedestal_prompt: 'a thorn' }, rules: direct ? [] : [{ trigger, ...proc }],
    ...(direct ? { [trigger]: proc } : {}),
  };
}

function luaValue(value) {
  if (value === null) return 'false';
  if (Array.isArray(value)) return '{' + value.map(luaValue).join(',') + '}';
  if (typeof value === 'object') return '{' + Object.entries(value).map(([key, entry]) => '[' + JSON.stringify(key) + ']=' + luaValue(entry)).join(',') + '}';
  if (value === Infinity) return 'math.huge';
  return JSON.stringify(value);
}

test('Node and Lua agree on retaliation validation and exact weight at every quality boundary', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../content-contract/capabilities.json', import.meta.url)));
  const engine = await factory.createEngine();
  try {
    engine.global.set('promptSource', promptSource);
    engine.global.set('mainSource', mainSource);
    engine.global.set('conditionSource', conditionSource);
    engine.global.set('moduleSources', moduleSources);
    await engine.doString(mocks);
    await engine.doString('assert(load(mainSource .. [[\nretaliationProbe={weight=profileWeight,validate=validateProfile}\n]]))()');
    const cases = [];
    for (const trigger of ['player_hurt', 'collision', 'enemy_hit', 'on_kill', 'tear_impact', 'room_clear', 'tear_fire']) {
      for (const action of [
        { type: 'retaliate', amount: 2 }, { type: 'retaliate', amount: 2, target_mode: 'attacker' },
        ...[40, 60, 60.5, 120].map(radius => ({ type: 'retaliate', amount: 2, target_mode: 'nearby', radius })),
      ]) cases.push(retaliationDesign(action, trigger));
    }
    for (const patch of [
      { target_mode: 'unsupported' }, { target_mode: false }, { target_mode: null },
      { radius: 80 }, { target_mode: 'attacker', radius: 80 }, { target_mode: 'nearby' },
      { target_mode: 'nearby', radius: 39 }, { target_mode: 'nearby', radius: 121 },
      { target_mode: 'nearby', radius: Infinity }, { target_mode: 'nearby', radius: 80, max_targets: 8 },
    ]) cases.push(retaliationDesign({ type: 'retaliate', amount: 2, ...patch }));
    for (const action of [
      { type: 'damage_burst', amount: 2, radius: 80, target_mode: 'nearby' },
      { type: 'apply_status', amount: 1, status: 'slow', duration: 30, target_mode: 'attacker' },
      { type: 'grant_soul_hearts', amount: 1, target_mode: 'nearby' },
    ]) cases.push(retaliationDesign(action, action.type === 'damage_burst' ? 'on_kill' : action.type === 'apply_status' ? 'tear_impact' : 'room_clear'));
    const fast = retaliationDesign({ type: 'retaliate', amount: 2, target_mode: 'nearby', radius: 80 });
    fast.rules[0].cooldown = 29; cases.push(fast);
    for (const design of cases) {
      for (const quality of [0, 1, 2, 3, 4]) {
        design.metadata.quality = quality;
        let valid = true;
        try { validateDesign(design); } catch { valid = false; }
        const { region, ...record } = design;
        Object.assign(record, { version: 1, generated_at: '2026-10-22', bridge_request_id: 'retaliation_parity', sprite_sheet: 'gfx/items/collectibles/generated_slot_00.png' });
        const message = JSON.stringify(design);
        await engine.doString('local record=' + luaValue(record) + '; assert(retaliationProbe.validate(record,record.bridge_request_id)==' + valid + ',' + JSON.stringify(message) + ')');
        if (valid) {
          const expected = profileWeight(design, catalog);
          assert.ok(Number.isFinite(expected));
          await engine.doString('assert(retaliationProbe.weight(' + luaValue(record) + ')==' + expected + ',' + JSON.stringify(message) + ')');
        }
      }
    }
  } finally {
    engine.global.close();
  }
});

import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { toLua } from '../../bridge/runtime.mjs';
import { profileWeight } from '../../bridge/weights.mjs';
import { ITEM_SCHEMA, repairGeneratedProfile as repairDesign, validateProfile as validateDesign } from '../../bridge/generate.mjs';

const mainSource = await readFile(new URL('../../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
const promptSource = await readFile(new URL('../../demo/live-sprite-swap/nebius_prompt.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();
const profile = {
  version: 1, generated_at: '2026-10-11', bridge_request_id: '123_0_1_123_1', sprite_sheet: 'gfx/items/collectibles/generated_slot_00.png',
  metadata: { display_name: 'Emerald Eye', description: 'Poison and damage', quality: 4, theme: 'cursed', balance_note: '' },
  systems: ['stats', 'tears', 'rules'], affects_stats: true,
  stats: { damage: 0.5, tears: 0, shot_speed: 0, range: 0, speed: 0.1, luck: 0, soul_hearts: 0 },
  tear_profile: { flags: ['poison'], color: { r: 0.2, g: 1, b: 0.3, a: 1 }, scale: 1.5 },
  visuals: { pedestal_prompt: 'emerald eye' },
  rules: [{ trigger: 'room_clear', conditions: [{ type: 'once_per_room' }], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] }],
};

const mocks = `
frame, now, held, owns, stage, roomIndex, clipboardText = 0, 0, false, false, 1, 1, nil
logs, events, entities, uiCallbacks, familiarTears, projectiles, itemBanners, friendlies = {}, {}, {}, {}, {}, {}, {}, {}
imageLoads,artRenders,textRenders={},{},{}
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
Keyboard = { KEY_8=8, KEY_KP_8=108, KEY_A=65, KEY_B=66, KEY_C=67, KEY_V=86, KEY_SPACE=32,
 KEY_BACKSPACE=259, KEY_ENTER=257, KEY_ESCAPE=256, KEY_LEFT_SHIFT=340, KEY_LEFT_CONTROL=341,
 KEY_UP=265, KEY_DOWN=264, KEY_LEFT=263, KEY_RIGHT=262 }
MouseButton = { LEFT=0 }
keyDown,mouseDown,mousePosition={},false,Vector(-1,-1)
Input = { IsButtonPressed = function(key) return ((key==8 or key==108) and held) or keyDown[key] or false end,
 GetMousePosition=function() return mousePosition end, IsMouseBtnPressed=function() return mouseDown end }
EntityType = { ENTITY_TEAR=2, ENTITY_PICKUP=5, ENTITY_FAMILIAR=3, ENTITY_PROJECTILE=9, ENTITY_ATTACKFLY=18, ENTITY_SPIDER=85, ENTITY_POOTER=14, ENTITY_DIP=217, ENTITY_EFFECT=1000 }
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
Isaac = { DebugString=function(message) logs[#logs+1]=message end, GetItemIdByName=function(name) if name=="AI Item" then return 797 end; if name=="Singularity Terminal" then return 900 end; local generator=name:match("^Generator (%d+)$"); if generator then return 820+tonumber(generator) end; if name:match("^Generated Active") then return 798+tonumber(name:match("(%d+)$")) end; local slot=tonumber(name:match("(%d+)$")); return slot<64 and 733+slot or 1000+slot end,
 GetSoundIdByName=function() return 1 end, GetTime=function() return now+frame*34 end, GetClipboard=function() return clipboardText end,
 SetClipboard=function(value) clipboardText=value; return true end, GetPlayer=function() return player end,
 FindByType=function(entityType)
  if entityType==EntityType.ENTITY_PROJECTILE then return projectiles end
  if entityType==EntityType.ENTITY_ATTACKFLY or entityType==EntityType.ENTITY_SPIDER or entityType==EntityType.ENTITY_POOTER or entityType==EntityType.ENTITY_DIP then
   local found={}
   for _, npc in ipairs(friendlies) do if npc.Type==entityType then found[#found+1]=npc end end
   return found
  end
  return entities
 end, WorldToScreen=function(position) return position end, RenderText=function(text) textRenders[#textRenders+1]=text end,
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
   spawnedFamiliar=familiar
   return familiar
  end
  if entityType==EntityType.ENTITY_ATTACKFLY or entityType==EntityType.ENTITY_SPIDER or entityType==EntityType.ENTITY_POOTER or entityType==EntityType.ENTITY_DIP then
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
package.preload.json = function() return { decode=function(raw) if raw=='bad' then error('bad JSON') end; return encodedValues[raw] or envelope end,
 encode=function(value)
  if value.prompt or value.auto then lastRequest=value end
  local key='encoded_'..tostring(#encodedValues+1)
  encodedValues[#encodedValues+1]=deepCopy(value); encodedValues[key]=deepCopy(value)
  return key
 end } end
function include(name)
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
 imageLoads[#imageLoads+1]=path
 if path=='gfx/nebius_creator/white.png' then return { Render=function() end } end
 return { Render=function(_,_,destination) events[#events+1]='render'; artRenders[#artRenders+1]={path=path,destination=destination} end }
end }
SourceQuad = { NewFromRectangle=function() return {} end }
DestinationQuad = { NewFromRectangle=function(position, width, height) lastDestination={x=position.X,y=position.Y,width=width,height=height}; return lastDestination end }
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

test('8 opens one in-game panel; hold and double submit do not duplicate requests', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); assert(not uiPrompt.open)
    Demo:onPostRender(); assert(uiPrompt.open and windows==0 and not uiShown)
    local layout=uiPrompt:layout(); assert(layout.x==150 and layout.y==170 and layout.w==500 and layout.h==260)
    frame=1; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiPrompt.open)
    held=false; frame=2; Demo:onPostUpdate()
    held=true; frame=3; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiPrompt.open)
    uiCallbacks.input('  poison eye  '); uiCallbacks.submit(); uiCallbacks.submit()
    assert(lastRequest.id=='123_0_1_123_1' and lastRequest.prompt=='poison eye')
    assert(not uiPrompt.open and not uiShown)
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
    assert(uiPrompt.status=='Finding an idea...' and lastRequest==nil)
    local asked=false
    for _, line in ipairs(logs) do if line:find('[NebiusBridge] sentence',1,true) then asked=true end end
    assert(asked)
    envelope={version=1,type='status',id='123_0_1_123_1',status='sentence',detail='A glass eye that blinks when the room is dark.'}
    frame=1; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender()
    assert(uiPrompt.text=='A glass eye that blinks when the room is dark.' and uiPrompt.status=='Idea ready. Edit it or generate the item.')
    uiCallbacks.submit()
    assert(lastRequest and lastRequest.prompt=='A glass eye that blinks when the room is dark.' and not uiPrompt.open)
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
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==4)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_FIREDELAY); assert(player.MaxFireDelay==10)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_RANGE); assert(player.TearRange==100)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_LUCK); assert(player.Luck==0)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_SHOTSPEED); assert(player.ShotSpeed==1)
    Demo:onEvaluateCache(player,CacheFlag.CACHE_SPEED); assert(player.MoveSpeed==1.1)
    Demo:onPostAddCollectible(733,nil,nil,nil,nil,player); assert(player.hearts==0)
    local tear={SpawnerEntity={ToPlayer=function() return player end}, TearFlags=0, Scale=1, GetData=function() return {} end}
    Demo:onPostFireTear(tear); assert(tear.TearFlags==1 and tear.Scale==1.5 and tear.Color[2]==1)
    Demo:onPreSpawnCleanAward(); Demo:onPreSpawnCleanAward(); assert(#events==4)
    stage=2; Demo:onPreSpawnCleanAward(); assert(#events==5)
  `);
});

test('History HUD art follows native slots, duplicates, twins, and Normal/Mini sizes', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); Demo:onPostRender()
    assert(#imageLoads==0)
    local calls={}
    local function item(id,x,y)
      return {GetItemID=function() return id end,GetRenderOffset=function() return Vector(x,y) end}
    end
    local history={GetCollectibles=function(_,slot,ids,includeHidden)
      assert(includeHidden==false and ids[1]==733)
      calls[#calls+1]=slot
      if slot==0 then return {item(733,0,32),item(733,32,32),item(1,64,32)} end
      return {item(733,-2+33,0)}
    end}
    Options={ExtraHUDStyle=1}
    local hidden=Demo:onPreHistoryHudRender(history,Vector(610,114),false)
    assert(#calls==2 and #hidden.HideCollectibles==1 and hidden.HideCollectibles[1]==733)
    Demo:onPostHistoryHudRender()
    assert(#artRenders==3 and #imageLoads==1)
    assert(artRenders[1].destination.x==610 and artRenders[1].destination.y==146)
    assert(artRenders[2].destination.x==642 and artRenders[3].destination.x==641)
    assert(artRenders[1].destination.width==32 and artRenders[1].destination.height==32)
    Options.ExtraHUDStyle=2
    Demo:onPreHistoryHudRender(history,Vector(500,80),true); Demo:onPostHistoryHudRender()
    assert(#artRenders==6 and #imageLoads==1)
    assert(artRenders[4].destination.x==500 and artRenders[4].destination.y==112)
    assert(artRenders[4].destination.width==16 and artRenders[4].destination.height==16)
  `);
});

test('HUD Off and invisible history entries never request artwork', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); Demo:onPostRender()
    Options={ExtraHUDStyle=0}
    local history={GetCollectibles=function() error('Off must not inspect history') end}
    assert(Demo:onPreHistoryHudRender(history,Vector(600,100),false)==nil)
    Demo:onPostHistoryHudRender(); assert(#imageLoads==0 and #artRenders==0)
    Options.ExtraHUDStyle=1
    history.GetCollectibles=function() return {} end
    assert(Demo:onPreHistoryHudRender(history,Vector(600,100),false)==nil)
    Demo:onPostHistoryHudRender(); assert(#imageLoads==0 and #artRenders==0)
    Demo:onPickupRender(entities[1]); assert(#imageLoads==1 and #artRenders==1)
  `);
});

test('failed HUD image loads retain vanilla placeholders without retrying every frame', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); Options={ExtraHUDStyle=1}
    local attempts=0
    Renderer.LoadImage=function() attempts=attempts+1; error('missing PNG') end
    local history={GetCollectibles=function(_,slot)
      if slot==1 then return {} end
      return {{GetItemID=function() return 733 end,GetRenderOffset=function() return Vector(0,0) end}}
    end}
    assert(Demo:onPreHistoryHudRender(history,Vector(600,100),false)==nil)
    Demo:onPostHistoryHudRender()
    assert(Demo:onPreHistoryHudRender(history,Vector(600,100),false)==nil)
    Demo:onPostHistoryHudRender(); assert(attempts==1 and #artRenders==0)
  `);
});

test('pause-screen button opens the library without touching creator drafts or requests', async () => {
  await run(`
    uiPrompt.text='Keep my draft'; uiPrompt.pending,uiPrompt.pendingKind='inflight','sentence'
    Demo:onPostPauseScreenRender()
    local button=uiPrompt:pauseButtonBounds()
    mousePosition=Vector(button.x+10,button.y+10); mouseDown=true
    Demo:onPostPauseScreenRender(); assert(uiPrompt.pauseLibrary and uiPrompt.page=='library')
    mouseDown=false; Demo:onPostPauseScreenRender()
    assert(not uiPrompt:shouldPause() and hudVisible and uiPrompt.text=='Keep my draft' and uiPrompt.pending=='inflight')
    assert(#uiPrompt.getItems()==0)
    local empty=false
    for _,text in ipairs(textRenders) do if text=='No generated items in this run yet.' then empty=true end end
    assert(empty)
    keyDown[Keyboard.KEY_ESCAPE]=true; Demo:onPostPauseScreenRender()
    assert(not uiPrompt.pauseLibrary and uiPrompt.page=='creator' and uiPrompt.pending=='inflight')
  `);
});


test('library displays validated profile quality, effects, and source-specific flags', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    local items=uiPrompt.getItems()
    assert(#items==1 and items[1].quality==envelope.profile.metadata.quality)
    assert(items[1].description==envelope.profile.metadata.description)
    uiPrompt:openPauseLibrary(); Demo:onPostPauseScreenRender()
    local combined=table.concat(uiPrompt:descriptorLines(items[1],1000),' ')
    assert(combined:find('DESCRIPTION: Poison and damage',1,true))
    assert(combined:find('EFFECTS: Damage',1,true))
    assert(combined:find('SYSTEMS: stats, tears, rules',1,true))
    assert(combined:find('TEAR FLAGS: poison',1,true))
    assert(combined:find('FAMILIAR FLAGS: none',1,true) and combined:find('BOMB FLAGS: none',1,true))
    assert(#artRenders==1 and artRenders[1].destination.width==32)
    for quality=0,4 do
      items[1].quality=quality; textRenders={}; Demo:onPostPauseScreenRender()
      local found=false
      for _,text in ipairs(textRenders) do if text:find('Q'..quality..' / 4',1,true) then found=true end end
      assert(found)
    end
    for _,quality in ipairs({'bad',-1,5,1.5}) do
      items[1].quality=quality; textRenders={}; Demo:onPostPauseScreenRender()
      local found=false
      for _,text in ipairs(textRenders) do if text:find('QUALITY UNKNOWN',1,true) then found=true end end
      assert(found and not uiPrompt.failed)
    end
    items[1].quality=nil; Demo:onPostPauseScreenRender(); assert(not uiPrompt.failed)
    items[1].familiar={attack={flags={'burn'}}}; items[1].bomb={flags={'fear'}}
    combined=table.concat(uiPrompt:descriptorLines(items[1],1000),' ')
    assert(combined:find('FAMILIAR FLAGS: burn',1,true) and combined:find('BOMB FLAGS: fear',1,true))
  `);
});

test('library pages and scrolls long descriptions without stale selections', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    envelope=deepCopy(envelope); envelope.id='123_0_1_second'; envelope.profile.bridge_request_id=envelope.id
    envelope.profile.sprite_sheet='gfx/items/collectibles/generated_slot_01.png'
    envelope.profile.metadata.display_name='Second item'
    frame=1; nextRaw='profile'; Demo:onPostUpdate()
    uiPrompt.getItems()[1].summary=string.rep('Long effect detail. ',100)
    uiPrompt:openPauseLibrary(); Demo:onPostPauseScreenRender()
    assert(uiPrompt.maxDetailScroll>0)
    uiPrompt:menuButtons()[4].action(); Demo:onPostPauseScreenRender(); assert(uiPrompt.detailScroll==3)
    uiPrompt:menuButtons()[2].action(); Demo:onPostPauseScreenRender()
    assert(uiPrompt.itemIndex==2 and uiPrompt.detailScroll==0)
    uiPrompt.itemIndex=500; Demo:onPostPauseScreenRender(); assert(uiPrompt.itemIndex==2)
    uiPrompt:selectItem(-1); assert(uiPrompt.itemIndex==1)
    uiPrompt:reset(); assert(uiPrompt.itemIndex==1 and uiPrompt.page=='creator' and uiPrompt.detailScroll==0)
  `);
});

test('item descriptors restore from existing run persistence', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    Demo:onPreGameExit(true)
    Demo=assert(load(mainSource..string.char(10)..'return Demo'))(); Demo:onGameStarted(true)
    local items=uiPrompt.getItems()
    assert(#items==1 and items[1].quality==4 and items[1].name=='Emerald Eye')
    assert(items[1].tearFlagNames[1]=='poison')
    Demo:onGameStarted(false); assert(#uiPrompt.getItems()==0)
  `);
});


test('Tab opens the pause library and Back returns to the pause screen', async () => {
  await run(`
    Keyboard.KEY_TAB=258
    keyDown[Keyboard.KEY_TAB]=true; Demo:onPostPauseScreenRender(); assert(uiPrompt.pauseLibrary)
    keyDown={}; Demo:onPostPauseScreenRender()
    local back=uiPrompt:menuButtons()[5]
    mousePosition=Vector(back.x+10,back.y+10)
    mouseDown=true; Demo:onPostPauseScreenRender(); assert(not uiPrompt.pauseLibrary)
  `);
});

test('pause button stays out of Isaac options screens', async () => {
  await run(`
    PauseMenu={GetState=function() return 2 end}
    Demo:onPostPauseScreenRender(); assert(uiPrompt.pixel==nil and not uiPrompt.pauseLibrary)
    PauseMenu.GetState=function() return 1 end
    Demo:onPostPauseScreenRender(); assert(uiPrompt.pixel~=nil)
  `);
});

test('library controller navigation pages and scrolls while small viewports stay bounded', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    uiPrompt.getItems()[1].summary=string.rep('Detailed effect. ',100)
    uiPrompt:openPauseLibrary(); now=200
    ButtonAction={ACTION_MENUDOWN=1,ACTION_MENURIGHT=2,ACTION_MENUCONFIRM=3}
    local actionDown={}
    Input.IsActionPressed=function(action) return actionDown[action]==true end
    for _,screen in ipairs({{480,270},{640,360},{800,600}}) do
      Isaac.GetScreenWidth=function() return screen[1] end
      Isaac.GetScreenHeight=function() return screen[2] end
      Demo:onPostPauseScreenRender()
      local layout=uiPrompt:layout()
      for _,button in ipairs(uiPrompt:menuButtons()) do
        assert(button.x>=0 and button.y>=0 and button.x+button.w<=screen[1] and button.y+button.h<=screen[2])
      end
    end
    actionDown[1]=true; Demo:onPostPauseScreenRender(); assert(uiPrompt.detailScroll==1)
    actionDown={}; Demo:onPostPauseScreenRender()
    actionDown[2]=true; Demo:onPostPauseScreenRender(); assert(uiPrompt.menuFocus==2)
    actionDown={}; Demo:onPostPauseScreenRender()
    uiPrompt.menuFocus=5; actionDown[3]=true; Demo:onPostPauseScreenRender(); assert(not uiPrompt.pauseLibrary)
  `);
});

test('HUD rendering fails open when destination allocation or History HUD APIs are unavailable', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); Options={ExtraHUDStyle=1}
    assert(Demo:onPreHistoryHudRender({},Vector(600,100),false)==nil)
    local history={GetCollectibles=function(_,slot)
      if slot==1 then return {} end
      return {{GetItemID=function() return 733 end,GetRenderOffset=function() return Vector(0,0) end}}
    end}
    local original=DestinationQuad.NewFromRectangle
    DestinationQuad.NewFromRectangle=function() error('unavailable destination') end
    assert(Demo:onPreHistoryHudRender(history,Vector(600,100),false)==nil)
    Demo:onPostHistoryHudRender(); assert(#artRenders==0)
    DestinationQuad.NewFromRectangle=original
    assert(Demo:onPreHistoryHudRender(history,Vector(600,100),false).HideCollectibles[1]==733)
    Options.ExtraHUDStyle=0; Demo:onPostHistoryHudRender(); assert(#artRenders==0)
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

function dropProbe(fixture) {
  fixture.metadata.quality = 4;
  fixture.affects_stats = false;
  delete fixture.stats;
  fixture.systems = fixture.systems.filter((name) => name !== 'stats');
  if (fixture.rules?.every((rule) => rule.actions?.every((action) => action.type === 'spawn_pickup' && action.pickup_type === 'coin'))) {
    fixture.rules = [];
    fixture.systems = fixture.systems.filter((name) => name !== 'rules');
  }
  return fixture;
}

function familiarAttack(pattern, flags = ['poison']) {
  return { pattern, flags, color: { r: 0.2, g: 0.9, b: 0.3, a: 1 }, scale: 1.2, speed: 8 };
}

test('sentry fires the item attack profile while aura stays separate', async () => {
  const fixture = dropProbe(structuredClone(profile));
  fixture.tear_profile.flags = [];
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
  const fixture = dropProbe(structuredClone(profile));
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
    assert(state.runtime_contract==13 and state.count==1)
  `, fixture);
});

test('an item runs only the systems it marks', async () => {
  const fixture = structuredClone(profile);
  delete fixture.stats;
  delete fixture.tear_profile;
  fixture.systems = ['rules', 'on_kill', 'tear_impact', 'collision'];
  fixture.affects_stats = false;
  fixture.rules = [{ trigger: 'room_clear', conditions: [], actions: [{ type: 'grant_soul_hearts', amount: 1 }] }];
  const proc = { conditions: [], actions: [{ type: 'spawn_pickup', pickup_type: 'coin', amount: 1 }] };
  fixture.on_kill = proc;
  fixture.tear_impact = structuredClone(proc);
  fixture.collision = structuredClone(proc);
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onEvaluateCache(player, CacheFlag.CACHE_DAMAGE); assert(player.Damage==3.5)
    local tearData={}
    local tear={SpawnerEntity={ToPlayer=function() return player end}, TearFlags=0, Scale=1, GetData=function() return tearData end}
    Demo:onPostFireTear(tear); assert(tear.TearFlags==0 and tear.Scale==1 and tear.Color==nil)
    local function coins()
      local n=0
      for _, event in ipairs(events) do if event=='spawn:20' then n=n+1 end end
      return n
    end
    Demo:onPostAddCollectible(733,nil,nil,nil,nil,player); assert(player.hearts==0 and coins()==0)
    Demo:onPreSpawnCleanAward(); assert(player.hearts==1 and coins()==0)
    local enemy={InitSeed=9, ToPlayer=function() return nil end, ToNPC=function(self) return self end}
    Demo:onPostEntityKill(enemy); Demo:onPostEntityKill(enemy); assert(player.hearts==1 and coins()==1)
    Demo:onPreTearCollision(tear, enemy); Demo:onPreTearCollision(tear, enemy); assert(player.hearts==1 and coins()==2)
    Demo:onPrePlayerCollision(player, enemy); Demo:onPrePlayerCollision(player, enemy); assert(player.hearts==1 and coins()==3)
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
  const flyer = structuredClone(profile);
  flyer.systems = ['stats'];
  flyer.rules = [];
  delete flyer.tear_profile;
  flyer.stats = { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0, flying: true };
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onEvaluateCache(player, CacheFlag.CACHE_FLYING); assert(player.CanFly==true)
  `, flyer);
  const fixture = dropProbe(structuredClone(profile));
  fixture.tear_profile.flags = [];
  fixture.systems = ['tears', 'tear_update', 'bomb', 'laser', 'knife'];
  fixture.tear_update = { behavior: 'home', strength: 1 };
  fixture.bomb = { damage: 2, radius: 80 };
  fixture.laser = { damage: 1.5 };
  fixture.knife = { damage: 1 };
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local data={}
    local tear={Position=Vector(0,0), Velocity=Vector(1,0), Scale=1, TearFlags=0, SpawnerEntity={ToPlayer=function() return player end}, GetData=function() return data end}
    enemies={{Position=Vector(10,0)}}
    Demo:onPostFireTear(tear)
    Demo:onPostTearUpdate(tear)
    assert(data.generatedTearSources[1].behavior=='home' and tear.Velocity.X>1)
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
    frame=1; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiPrompt.status~='wrong request')
    envelope.id='123_0_1_123_1'; envelope.detail='Image service unavailable'
    frame=2; nextRaw='status'; Demo:onPostUpdate(); Demo:onPostRender(); assert(uiPrompt.status=='Art service unavailable. Start ComfyUI and retry.' and uiPrompt.open)
    assert(uiPrompt.text=='eye')
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
    assert(uiPrompt.text=='eye')
  `);
});

test('missing UI rendering binding leaves the native product path usable', async () => {
  await run(`ImGui=nil; held=true; Demo:onPostUpdate(); Demo:onPostRender(); frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==2)`);
  await run(`Renderer.LoadImage=function() error('test UI binding failure') end; held=true; Demo:onPostUpdate(); Demo:onPostRender(); frame=1; nextRaw='profile'; Demo:onPostUpdate(); assert(#events==2)`);
});

test('paused render receives progress but defers profile application until update', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); uiCallbacks.input('eye'); uiCallbacks.submit()
    frame=1; envelope={version=1,type='status',id='123_0_1_123_1',status='generating',detail='Preparing artwork'}
    nextRaw='status'; Demo:onPostRender(); assert(uiPrompt.status=='Preparing artwork' and #events==0)
    assert(uiPrompt.text=='eye')
    envelope=${toLua({ version: 1, type: 'profile', id: profile.bridge_request_id, profile })}
    frame=2; nextRaw='profile'; Demo:onPostRender(); assert(#events==0)
    Demo:onPostUpdate(); assert(events[1]=='spawn:100' and events[2]=='ack:123_0_1_123_1')
    assert(uiPrompt.text=='' and uiPrompt.phase=='success')
  `);
});

test('two collectibles have independent profiles, art, ownership and persisted rule state', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate()
    envelope=deepCopy(envelope)
    envelope.id='123_0_1_second'; envelope.profile.bridge_request_id=envelope.id
    envelope.profile.sprite_sheet='gfx/items/collectibles/generated_slot_01.png'
    envelope.profile.stats.damage=1
    frame=1; nextRaw='profile'; Demo:onPostUpdate()
    assert(entities[1].SubType==733 and entities[2].SubType==734)
    player.HasCollectible=function(_,id) return id==733 end
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==4)
    player.Damage=3.5; player.HasCollectible=function() return true end
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==5)
    Demo:onPreSpawnCleanAward(); assert(#events==6)
    Demo:onPreGameExit(true)
    -- Reload all Lua runtime state to simulate closing and reopening Isaac.
    Demo=assert(load(mainSource.."\\nreturn Demo"))()
    Demo:onGameStarted(true)
    player.Damage=3.5
    Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==5)
    Demo:onPreSpawnCleanAward(); assert(#events==6)
    Demo:onPostRender()
    Demo:onPickupRender(entities[1]); Demo:onPickupRender(entities[2]); assert(#events==8)
    Demo:onPostAddCollectible(733,nil,false,nil,nil,player); assert(player.hearts==0)
  `);
});

test('128 items accepted; 129th blocked in native receiver and prompt without replacing items', async () => {
  await run(`
    for i=0,127 do
      envelope=deepCopy(envelope)
      envelope.id='123_0_1_item_'..i; envelope.profile.bridge_request_id=envelope.id
      envelope.profile.sprite_sheet=string.format('gfx/items/collectibles/generated_slot_%02d.png',i)
      frame=i; nextRaw='profile'; Demo:onPostUpdate()
    end
    assert(#entities==128 and #events==256)
    envelope=deepCopy(envelope)
    envelope.id='123_0_1_overflow'; envelope.profile.bridge_request_id=envelope.id
    frame=128; nextRaw='profile'; Demo:onPostUpdate(); assert(#entities==128 and #events==256)
    held=true; frame=65; Demo:onPostUpdate(); Demo:onPostRender()
    uiCallbacks.input('one more'); uiCallbacks.submit(); Demo:onPostRender()
    assert(lastRequest==nil and uiPrompt.status:find('Item limit reached: 128/128',1,true))
    Demo:onPreGameExit(true); Demo:onGameStarted(true)
    uiCallbacks.submit(); Demo:onPostRender(); assert(lastRequest==nil and uiPrompt.status:find('Item limit reached: 128/128',1,true))
    Demo:onGameStarted(false)
    uiCallbacks.submit(); Demo:onPostRender()
    assert(lastRequest==nil and uiPrompt.status:find('Artwork limit reached: 128/128',1,true))
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
import { validateSchema } from '../../bridge/runtime.mjs';

const heartCases = [
  ['grant_half_red_hearts', 'AddHearts', 1],
  ['grant_full_red_hearts', 'AddHearts', 2],
  ['grant_black_hearts', 'AddBlackHearts', 2],
  ['grant_eternal_hearts', 'AddEternalHearts', 1],
  ['grant_bone_hearts', 'AddBoneHearts', 1],
];
const catalog = JSON.parse(await readFile(new URL('../../content-contract/capabilities.json', import.meta.url)));
const rewardSchema = ITEM_SCHEMA.properties.rules.items.properties.actions.items;

for (const [type, method, units] of heartCases) {
  test(`${type}: catalog and generator accept bounds, reject invalid amounts and invented fields`, () => {
    assert.ok(catalog.actions.includes(type));
    assert.equal(catalog.heart_rewards[type].handler, method);
    assert.equal(catalog.heart_rewards[type].units, units);
    assert.deepEqual(catalog.heart_rewards[type].amount_bounds, [1, 4]);
    for (const amount of [1, 4]) validateSchema({ type, amount }, rewardSchema);
    for (const amount of [0, -1, 7, 1.5, '1', null, undefined]) {
      assert.throws(() => validateSchema({ type, amount }, rewardSchema));
    }
    for (const amount of [5, 6]) assert.throws(() => validateDesign(designFor({ ...structuredClone(profile), rules: [{ trigger: 'room_clear', conditions: [], actions: [{ type, amount }] }] })));
    assert.throws(() => validateSchema({ type, amount: 1, handler: 'AddHearts' }, rewardSchema));
    assert.throws(() => validateSchema({ type: 'grant_missing_hearts', amount: 1 }, rewardSchema));
  });

  test(`${type}: room clear grants exact units once, persists the latch, and works in the next room`, async () => {
    for (const amount of [1, 4].filter((amount) => catalog.weights.heart_rewards[type] * amount <= catalog.quality_budgets[4])) {
      const fixture = dropProbe(structuredClone(profile));
      delete fixture.tear_profile;
      fixture.systems = ['rules'];
      fixture.rules = [{ trigger: 'room_clear', conditions: [{ type: 'once_per_room' }], actions: [{ type, amount }] }];
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
    badActions.push({type, amount:1, handler:method}, {type:'grant_missing_hearts', amount:1});
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
    const fixture=dropProbe(structuredClone(profile));
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

const itemSchema = ITEM_SCHEMA;
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
    const fixture=dropProbe(structuredClone(profile));
    fixture.tear_profile.flags=flags;
    await run(`
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      local state=encodedValues[#encodedValues]; assert(state.runtime_contract==13)
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
  const fixture=dropProbe(structuredClone(profile));
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
    const fixture=dropProbe(structuredClone(profile));
    fixture.tear_profile.flags=flags;
    await run(`
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      local state=encodedValues[#encodedValues]; assert(state.runtime_contract==13)
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
  const fixture=dropProbe(structuredClone(profile));
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
    const fixture=dropProbe(structuredClone(profile));
    fixture.tear_profile.flags=flags;
    await run(`
      nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100'); owns=true
      local state=encodedValues[#encodedValues]; assert(state.runtime_contract==13)
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
  const fixture=dropProbe(structuredClone(profile));
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
  const fixture=dropProbe(structuredClone(profile));
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
test('kill bursts credit the damage owner, cap targets, and cannot chain themselves', async () => {
  const fixture=structuredClone(profile);
  fixture.systems=['on_kill']; fixture.affects_stats=false; delete fixture.stats; delete fixture.tear_profile; fixture.rules=[];
  fixture.on_kill={conditions:[],cooldown:30,actions:[{type:'damage_burst',amount:2,radius:60}]};
  validateDesign(designFor(fixture));
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    function EntityRef(owner) return {Entity=owner} end
    local function enemy(seed)
      local data={}
      local enemy={InitSeed=seed,Position=Vector(0,0),damage=0,ToPlayer=function() return nil end,ToNPC=function(self) return self end,GetData=function() return data end}
      function enemy:TakeDamage(amount,flags,source)
        self.damage=self.damage+amount
        Demo:onEntityTakeDamage(self,amount,flags,source)
        Demo:onPostEntityKill(self)
      end
      return enemy
    end
    local victim=enemy(1)
    enemies={}
    for index=1,10 do enemies[index]=enemy(index+1) end
    Demo:onEntityTakeDamage(victim,1,0,{Entity={SpawnerEntity=player}})
    Demo:onPostEntityKill(victim)
    for index=1,8 do assert(enemies[index].damage==2) end
    assert(enemies[9].damage==0 and enemies[10].damage==0)
    frame=31; Demo:onPostEntityKill(victim); assert(enemies[1].damage==2)
    local uncredited=enemy(99); Demo:onPostEntityKill(uncredited); assert(enemies[1].damage==2)
  `,fixture);
});

test('status impacts are per item and tear; contact retaliation repeats only after cooldown', async () => {
  const fixture=structuredClone(profile);
  fixture.systems=['tear_impact','collision']; fixture.affects_stats=false; delete fixture.stats; delete fixture.tear_profile; fixture.rules=[];
  fixture.tear_impact={conditions:[],cooldown:30,actions:[{type:'apply_status',status:'burn',duration:60,amount:1}]};
  fixture.collision={conditions:[],cooldown:30,actions:[{type:'retaliate',amount:2}]};
  validateDesign(designFor(fixture));
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local enemy={InitSeed=1,Position=Vector(0,0),hits=0,damage=0,ToNPC=function(self) return self end}
    function enemy:AddBurn(source,duration,amount) self.hits=self.hits+1; self.duration=duration; self.burn=amount end
    function enemy:TakeDamage(amount) self.damage=self.damage+amount end
    local data={}; local tear={SpawnerEntity=player,GetData=function() return data end}
    Demo:onPreTearCollision(tear,enemy); Demo:onPreTearCollision(tear,enemy)
    assert(enemy.hits==1 and enemy.duration==60 and enemy.burn==1)
    Demo:onPrePlayerCollision(player,enemy); Demo:onPrePlayerCollision(player,enemy); assert(enemy.damage==2)
    frame=30; Demo:onPrePlayerCollision(player,enemy); assert(enemy.damage==4)
    Demo:onPreTearCollision(tear,enemy); assert(enemy.hits==1)
    local secondData={}; Demo:onPreTearCollision({SpawnerEntity=player,GetData=function() return secondData end},enemy)
    assert(enemy.hits==2)
  `,fixture);
});

test('combat effects reject missing cooldowns, wrong triggers, and invented parameters', async () => {
  for (const change of [proc=>delete proc.cooldown,proc=>proc.cooldown=15,proc=>proc.actions[0].radius=121,proc=>proc.actions[0].status='burn',proc=>proc.actions[0].amount=4]) {
    const fixture=structuredClone(profile);
    fixture.systems=['on_kill']; fixture.affects_stats=false; delete fixture.stats; delete fixture.tear_profile; fixture.rules=[];
    fixture.on_kill={conditions:[],cooldown:30,actions:[{type:'damage_burst',amount:1,radius:60}]};
    change(fixture.on_kill); await rejectedByBoth(fixture);
  }
  const fixture=structuredClone(profile);
  fixture.rules=[{trigger:'room_clear',conditions:[],cooldown:30,actions:[{type:'retaliate',amount:1}]}];
  await rejectedByBoth(fixture);
});

test('timed stat stacks expire, persist remaining time, and clear on source removal', async () => {
  const fixture=structuredClone(profile);
  fixture.systems=['rules']; fixture.affects_stats=false; delete fixture.stats; delete fixture.tear_profile;
  fixture.rules=[{trigger:'room_clear',conditions:[],cooldown:15,actions:[{type:'grant_stat',stat:'damage',amount:1,duration:60,stack_limit:2}]}];
  validateDesign(designFor(fixture));
  await run(cacheHarness+`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onPreSpawnCleanAward(); assert(player.Damage==4.5)
    frame=14; Demo:onPreSpawnCleanAward(); assert(player.Damage==4.5)
    frame=15; Demo:onPreSpawnCleanAward(); assert(player.Damage==5.5)
    frame=30; Demo:onPreSpawnCleanAward(); assert(player.Damage==5.5)
    frame=40; Demo:onPreGameExit(true)
    frame=0; Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
    assert(player.Damage==5.5)
    frame=49; Demo:onPostUpdate(); assert(player.Damage==5.5)
    frame=50; Demo:onPostUpdate(); assert(player.Damage==3.5)
    Demo:onPreSpawnCleanAward(); assert(player.Damage==4.5)
    owns=false; Demo:onPostUpdate(); assert(player.Damage==3.5)
    owns=true; player:EvaluateItems(); assert(player.Damage==3.5)
  `,fixture);
});

test('a failed chance does not consume cooldown and cooldowns survive continue', async () => {
  const fixture=structuredClone(profile);
  fixture.systems=['rules']; fixture.affects_stats=false; delete fixture.stats; delete fixture.tear_profile;
  fixture.rules=[{trigger:'room_clear',conditions:[{type:'chance',chance:0.5}],cooldown:60,actions:[{type:'grant_soul_hearts',amount:1}]}];
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    math.random=function() return 0.9 end
    Demo:onPreSpawnCleanAward(); assert(player.hearts==0)
    math.random=function() return 0.1 end
    Demo:onPreSpawnCleanAward(); assert(player.hearts==1)
    frame=20; Demo:onPreGameExit(true)
    frame=0; Demo=assert(load(mainSource.."\\nreturn Demo"))(); Demo:onGameStarted(true)
    frame=39; Demo:onPreSpawnCleanAward(); assert(player.hearts==1)
    frame=40; Demo:onPreSpawnCleanAward(); assert(player.hearts==2)
  `,fixture);
});

test('lifecycle bounds and pickup subtype families agree in both validators', async () => {
  for (const fields of [{cooldown:0},{cooldown:1801},{cooldown:1.5}]) {
    const fixture=structuredClone(profile); Object.assign(fixture.rules[0],fields); await rejectedByBoth(fixture);
  }
  for (const fields of [{duration:14},{duration:1801},{stack_limit:0},{stack_limit:5},{duration:20,stack_limit:1.5}]) {
    const fixture=structuredClone(profile); fixture.rules[0].actions=[{type:'grant_stat',stat:'luck',amount:1,...fields}]; await rejectedByBoth(fixture);
  }
  const invalid=structuredClone(profile);
  invalid.rules[0].actions=[{type:'spawn_pickup',pickup_type:'coin',pickup_subtype:'soul',amount:1}]; await rejectedByBoth(invalid);
  const fixture=structuredClone(profile);
  fixture.rules[0].actions=[{type:'spawn_pickup',pickup_type:'coin',pickup_subtype:'nickel',amount:1}];
  validateDesign(designFor(fixture));
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onPreSpawnCleanAward(); assert(entities[2].SubType==2)
  `,fixture);
});

for (const [stat,field,base,sign] of [['damage','Damage',4,1],['tears','MaxFireDelay',10,-1],['luck','Luck',0,1]]) {
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
  const invalid=[{type:'grant_stat',amount:1},{type:'grant_stat',stat:'flying',amount:1},{type:'grant_stat',stat:'damage',amount:1,pickup_type:'coin'},
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
    owns=true; player.Damage=3.5; Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE); assert(player.Damage==4)`);
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
  for(const flags of [undefined,[],['poison'],['burn'],['poison','burn']]){
    const f=dropProbe(structuredClone(profile));f.systems.push('bomb');f.bomb={damage:1,radius:80,...(flags?{flags}:{})};
    validateDesign(designFor(f));await run(`nextRaw='profile'; Demo:onPostUpdate(); assert(events[1]=='spawn:100')`,f);
  }
  for(const flags of [['unknown'],['poison','poison'],['poison','burn','fear'],[1],'poison']){
    const f=structuredClone(profile);f.systems.push('bomb');f.bomb={damage:1,radius:80,flags};await rejectedByBoth(f);
  }
});

const allTearFlags={homing:'TEAR_HOMING',spectral:'TEAR_SPECTRAL',piercing:'TEAR_PIERCING',poison:'TEAR_POISON',burn:'TEAR_BURN',slow:'TEAR_SLOW',fear:'TEAR_FEAR',charm:'TEAR_CHARM',bounce:'TEAR_BOUNCE',split:'TEAR_SPLIT',orbit:'TEAR_ORBIT',glow:'TEAR_GLOW',explosive:'TEAR_EXPLOSIVE',confusion:'TEAR_CONFUSION',knockback:'TEAR_KNOCKBACK',continuum:'TEAR_CONTINUUM',boomerang:'TEAR_BOOMERANG',grow:'TEAR_GROW',shrink:'TEAR_SHRINK',sticky:'TEAR_WAIT',wiggle:'TEAR_WIGGLE',slowing_creep:'TEAR_GISH'};
test('every catalog tear flag has an explicit test case',()=>assert.deepEqual([...catalog.tear_flags].sort(),Object.keys(allTearFlags).sort()));
for(const [flag,constant] of Object.entries(allTearFlags)) test(`flag audit: ${flag} maps to ${constant} for player and familiar tears`,async()=>{
  const fixture=structuredClone(profile);fixture.tear_profile.flags=[flag];fixture.systems=['tears','familiar'];fixture.affects_stats=false;delete fixture.stats;fixture.rules=[];
  fixture.familiar={type:'sentry',damage:1,cooldown:30,range:160,sprite_prompt:'test eye',attack:familiarAttack('single',[flag])};
  fixture.familiar_sprite_sheet='gfx/items/collectibles/generated_familiar_slot_00.png';fixture.familiar_animation='gfx/familiars/generated_familiar_anim_00.anm2';fixture.familiar_animation_sheet='gfx/familiars/generated_familiar_sheet_00.png';
  validateDesign(designFor(fixture));
  await run(`
    TearFlags.${constant}=33554432
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    local tear={SpawnerEntity=player,TearFlags=0,Scale=1,GetData=function() return {} end}
    Demo:onPostFireTear(tear);assert(tear.TearFlags==${flag === 'orbit' ? '(33554432|TearFlags.TEAR_SPECTRAL)' : '33554432'})
    enemies={{Position=Vector(80,0)}};frame=30;Demo:updatePassiveEffects()
    assert(spawnedFamiliarTear.TearFlags==${flag === 'orbit' ? '(33554432|TearFlags.TEAR_SPECTRAL)' : '33554432'})
  `,fixture);
});

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
  assert.deepEqual(catalog.room_stat_reward.stats,['damage','tears','luck','speed','range','shot_speed']);
  assert.deepEqual(catalog.room_stat_reward.amount_bounds,[1,4]);
  assert.equal(catalog.room_stat_reward.handler,'MC_EVALUATE_CACHE');
  for(const [type,handler] of [['slow','AddSlowing'],['burn','AddBurn'],['fear','AddFear']]) {
    const entry=catalog.aura_statuses[type];assert.equal(entry.handler,handler);
    assert.deepEqual(entry.duration_bounds,[15,120]);assert.deepEqual(entry.radius_bounds,[50,180]);assert.deepEqual(entry.cooldown_bounds,[15,90]);
  }
  assert.deepEqual(catalog.aura_statuses.burn.damage_bounds,[0.25,2]);assert.equal(catalog.aura_statuses.slow.slow_factor,0.5);
  assert.deepEqual(catalog.bomb_flags,['poison','burn','fear']);assert.equal(catalog.bomb_flag_effects.poison.flag,'TEAR_POISON');assert.equal(catalog.bomb_flag_effects.poison.max_flags,1);assert.equal(catalog.bomb_flag_limit,2);
});

test('temporary speed grants add one tenth of a move-speed step per amount',async()=>{
  const f=structuredClone(profile);
  f.stats.speed=0;
  f.rules[0].actions=[{type:'grant_stat',stat:'speed',amount:2}];
  validateDesign(designFor(f));
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    player.MoveSpeed=1
    Demo:onPreSpawnCleanAward()
    Demo:onEvaluateCache(player, CacheFlag.CACHE_SPEED)
    assert(math.abs(player.MoveSpeed-1.2)<0.0001)
  `,f);
});

test('room-stat grants use the maximum across rules on one item, and room-enter grants apply after clearing',async()=>{
  const f=structuredClone(profile);
  f.rules=[{trigger:'room_clear',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:1},{type:'grant_stat',stat:'damage',amount:4}]},
    {trigger:'room_enter',conditions:[],actions:[{type:'grant_stat',stat:'damage',amount:2}]}];
  validateDesign(designFor(f));
  await run(cacheHarness+`
    nextRaw='profile';Demo:onPostUpdate();owns=true
    Demo:onPreSpawnCleanAward();assert(player.Damage==8)
    Demo:onPreSpawnCleanAward();assert(player.Damage==8)
    roomIndex=2;Demo:onPostNewRoom();assert(player.Damage==6)
  `,f);
});

test('damage aura retains its original shape and rejects status-only fields',async()=>{
  const f=structuredClone(profile);f.systems.push('aura');f.aura={type:'damage',damage:1,radius:80,cooldown:30};
  validateDesign(designFor(f));await run(`nextRaw='profile';Demo:onPostUpdate();assert(events[1]=='spawn:100')`,f);
  f.aura.duration=60;await rejectedByBoth(f);
  delete f.aura.duration;delete f.aura.damage;await rejectedByBoth(f);
});

test('weight budget rejects an overspent quality and a speed drop below -0.15', async () => {
  const over = structuredClone(profile);
  over.metadata.quality = 0;
  over.stats = { damage: 0, tears: 0, shot_speed: 0, range: 0, speed: 0, luck: 0, soul_hearts: 0 };
  over.tear_profile.flags = ['homing', 'glow'];
  over.rules = [];
  await rejectedByBoth(over);
  const slow = structuredClone(profile);
  slow.stats.speed = -0.16;
  await rejectedByBoth(slow);
  const priced = structuredClone(profile);
  priced.metadata.quality = 1;
  priced.systems = ['tears'];
  priced.affects_stats = false;
  delete priced.stats;
  priced.rules = [];
  priced.tear_profile.flags = ['glow'];
  validateDesign(designFor(priced));
  assert.equal(profileWeight(designFor(priced), catalog), 6);
});

test('creator space types a space and does not open the on-screen keyboard', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    ButtonAction={ACTION_MENUCONFIRM=7}
    Input.IsActionPressed=function(action) return action==7 end
    keyDown[Keyboard.KEY_SPACE]=true; Demo:onPostRender()
    assert(uiPrompt.text==' ' and not uiPrompt.virtualKeyboard and uiPrompt.open)
    keyDown[Keyboard.KEY_SPACE]=false; Demo:onPostRender()
    uiPrompt.focus=3; uiPrompt.text='a quiet black candle'
    keyDown[Keyboard.KEY_SPACE]=true; Demo:onPostRender()
    assert(lastRequest==nil and uiPrompt.open)
  `);
});

test('creator pastes clipboard text and copies the prompt', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    clipboardText='a cursed nail that poisons enemies'
    keyDown[Keyboard.KEY_LEFT_CONTROL]=true; keyDown[Keyboard.KEY_V]=true; Demo:onPostRender()
    assert(uiPrompt.text=='a cursed nail that poisons enemies' and not uiPrompt.virtualKeyboard)
    keyDown[Keyboard.KEY_V]=false; Demo:onPostRender()
    uiPrompt.text='edit the pasted idea'
    keyDown[Keyboard.KEY_C]=true; Demo:onPostRender()
    assert(clipboardText=='edit the pasted idea')
  `);
});

test('in-game creator accepts keyboard text and clicks its visible Generate button', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false
    now=200; keyDown[Keyboard.KEY_A]=true; Demo:onPostRender(); assert(uiPrompt.text=='a')
    keyDown[Keyboard.KEY_A]=false; Demo:onPostRender()
    keyDown[Keyboard.KEY_B]=true; Demo:onPostRender(); assert(uiPrompt.text=='ab')
    keyDown[Keyboard.KEY_B]=false; Demo:onPostRender()
    mousePosition=Vector(350,380); mouseDown=true; Demo:onPostRender()
    assert(lastRequest.prompt=='ab' and lastRequest.quality==3 and not uiPrompt.open and not uiShown)
  `);
});

test('creator keyboard focus moves between prompt and buttons, then activates the focused action', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    assert(uiPrompt.focus==1 and hudVisible==false)
    keyDown[Keyboard.KEY_DOWN]=true; Demo:onPostRender(); assert(uiPrompt.focus==2)
    keyDown[Keyboard.KEY_DOWN]=false; Demo:onPostRender()
    keyDown[Keyboard.KEY_RIGHT]=true; Demo:onPostRender(); assert(uiPrompt.focus==3)
    keyDown[Keyboard.KEY_RIGHT]=false; Demo:onPostRender()
    uiPrompt.text='a quiet black candle'
    keyDown[Keyboard.KEY_ENTER]=true; Demo:onPostRender()
    assert(lastRequest.prompt=='a quiet black candle' and not uiPrompt.open and hudVisible==true)
  `);
});

test('creator mouse click returns focus to the prompt and buttons remain clickable', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    keyDown[Keyboard.KEY_DOWN]=true; Demo:onPostRender(); assert(uiPrompt.focus==2)
    keyDown[Keyboard.KEY_DOWN]=false; Demo:onPostRender()
    mousePosition=Vector(250,280); mouseDown=true; Demo:onPostRender(); assert(uiPrompt.focus==1)
    mouseDown=false; Demo:onPostRender()
    keyDown[Keyboard.KEY_A]=true; Demo:onPostRender(); assert(uiPrompt.text=='a')
    keyDown[Keyboard.KEY_A]=false; Demo:onPostRender()
    mousePosition=Vector(350,380); mouseDown=true; Demo:onPostRender()
    assert(lastRequest.prompt=='a' and not uiPrompt.open)
  `);
});

test('creator sends the selected quality with its item request', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    mousePosition=Vector(580,240); mouseDown=true; Demo:onPostRender(); assert(uiPrompt.quality==0)
    mouseDown=false; Demo:onPostRender()
    uiCallbacks.input('a small candle'); mousePosition=Vector(350,380); mouseDown=true; Demo:onPostRender()
    assert(lastRequest.quality==0 and lastRequest.prompt=='a small candle')
  `);
});

test('creator reaches the quality selector from prompt and every main button', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    keyDown[Keyboard.KEY_RIGHT]=true; Demo:onPostRender(); assert(uiPrompt.focus==8)
    keyDown[Keyboard.KEY_RIGHT]=false; Demo:onPostRender()
    for focus=2,4 do
      uiPrompt.focus=focus; keyDown[Keyboard.KEY_DOWN]=true; Demo:onPostRender(); assert(uiPrompt.focus==8)
      keyDown[Keyboard.KEY_DOWN]=false; Demo:onPostRender()
    end
    keyDown[Keyboard.KEY_DOWN]=true; Demo:onPostRender(); assert(uiPrompt.focus==9)
    keyDown[Keyboard.KEY_DOWN]=false; Demo:onPostRender()
    keyDown[Keyboard.KEY_ENTER]=true; Demo:onPostRender(); assert(uiPrompt.quality==4)
    keyDown[Keyboard.KEY_ENTER]=false; Demo:onPostRender()
    for _=1,4 do
      keyDown[Keyboard.KEY_UP]=true; Demo:onPostRender()
      keyDown[Keyboard.KEY_UP]=false; Demo:onPostRender()
    end
    assert(uiPrompt.focus==5)
    keyDown[Keyboard.KEY_ENTER]=true; Demo:onPostRender(); assert(uiPrompt.quality==0)
  `);
});

test('creator restores the game HUD when closed with keyboard navigation', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false; now=200
    assert(hudVisible==false)
    keyDown[Keyboard.KEY_DOWN]=true; Demo:onPostRender()
    keyDown[Keyboard.KEY_DOWN]=false; Demo:onPostRender()
    keyDown[Keyboard.KEY_LEFT]=true; Demo:onPostRender(); assert(uiPrompt.focus==4)
    keyDown[Keyboard.KEY_LEFT]=false; Demo:onPostRender()
    keyDown[Keyboard.KEY_ENTER]=true; Demo:onPostRender()
    assert(not uiPrompt.open and hudVisible==true)
  `);
});

test('creator hides generated pedestal, status, and collected-item overlays while open', async () => {
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); Demo:onPostRender(); events={}
    statusText='Generated item ready'; statusUntil=100
    held=true; Demo:onPostUpdate(); Demo:onPostRender(); held=false
    Demo:onPickupRender(entities[1]); Demo:onPreHistoryHudRender(nil,Vector(0,0)); Demo:onPostHistoryHudRender()
    assert(#events==0)
    uiCallbacks.close(); Demo:onPickupRender(entities[1])
    assert(events[1]=='render')
  `);
});

test('creator panel stays centered and fully inside a small game viewport', async () => {
  await run(`
    Isaac.GetScreenWidth=function() return 480 end
    Isaac.GetScreenHeight=function() return 270 end
    local panel=uiPrompt:layout()
    assert(panel.x==12 and panel.y==9 and panel.w==456 and panel.h==252)
    held=true; Demo:onPostUpdate(); Demo:onPostRender()
    assert(uiPrompt.open and not uiPrompt.failed and not uiShown)
  `);
});

test('creator pauses room updates while open and releases them on close and submit', async () => {
  await run(`
    held=true; Demo:onPostUpdate(); Demo:onPostRender()
    assert(Demo:onPreUpdate()==true)
    uiCallbacks.close(); assert(Demo:onPreUpdate()==false)
    held=false; Demo:onPostUpdate(); held=true; Demo:onPostUpdate(); Demo:onPostRender()
    assert(Demo:onPreUpdate()==true)
    uiCallbacks.input('an icy coin'); uiCallbacks.submit()
    assert(Demo:onPreUpdate()==false)
  `);
});


test('signed health and damage multipliers agree across bridge and game', async () => {
  const fixture = structuredClone(profile);
  fixture.metadata.quality = 4;
  fixture.stats = { damage: 1, damage_multiplier: 1.1, tears: -1, shot_speed: 0, range: 1, speed: 0, luck: -1, soul_hearts: -2 };
  fixture.tear_profile.flags = ['orbit'];
  fixture.rules = [];
  fixture.systems = ['stats', 'tears'];
  const design = designFor(fixture);
  assert.equal(profileWeight(design, catalog), 1 + 2 - 1 + 1 - 1 - 4 + 6);
  validateDesign(design);
  await run(`
    nextRaw='profile';Demo:onPostUpdate();assert(events[1]=='spawn:100')
    owns=true;player.Damage=3.5;Demo:onEvaluateCache(player,CacheFlag.CACHE_DAMAGE)
    assert(math.abs(player.Damage-4.95)<0.001)
    player.hearts=4;Demo:onPostAddCollectible(733,nil,true,nil,nil,player)
    assert(player.hearts==2)
    local tear={SpawnerEntity=player,TearFlags=0,Scale=1,GetData=function() return {} end}
    Demo:onPostFireTear(tear)
    assert((tear.TearFlags & TearFlags.TEAR_SPECTRAL)~=0)
  `, fixture);
  fixture.stats.damage_multiplier = 2.1;
  await rejectedByBoth(fixture);
});

test('new pickups spawn their variants and one friendly stays alive', async () => {
  const fixture = structuredClone(profile);
  fixture.metadata.quality = 4;
  fixture.systems = ['rules'];
  fixture.affects_stats = false;
  delete fixture.stats;
  delete fixture.tear_profile;
  fixture.rules = [{ trigger: 'room_clear', conditions: [], actions: [
    { type: 'spawn_pickup', pickup_type: 'pill', amount: 1 },
    { type: 'spawn_friendly', friendly_type: 'spider', amount: 1 },
  ] }];
  validateDesign(designFor(fixture));
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onPreSpawnCleanAward()
    assert(events[#events]=='spawn:70' and #friendlies==1 and friendlies[1].charmed==-1 and friendlies[1].Type==85)
    Demo:onPreSpawnCleanAward()
    assert(#friendlies==1)
  `, fixture);
  fixture.rules[0].actions[1].amount = 2;
  await rejectedByBoth(fixture);
});

function rulesFixture(actions, extra = {}) {
  return { version: 1, generated_at: profile.generated_at, bridge_request_id: profile.bridge_request_id,
    sprite_sheet: profile.sprite_sheet, metadata: { ...profile.metadata, quality: 4 },
    visuals: profile.visuals, affects_stats: false, systems: ['rules'],
    rules: [{ trigger: 'room_clear', cooldown: 30, conditions: [], actions }], ...extra };
}

test('resource exchange spends only available input and rolls back capped output', async () => {
  const fixture = rulesFixture([{ type: 'convert_resource', input_resource: 'coin', output_resource: 'key', cost: 2, amount: 1 }]);
  validateDesign(designFor(fixture));
  await run(`
    local coins,keys=1,0
    player.GetNumCoins=function() return coins end; player.GetNumKeys=function() return keys end
    player.AddCoins=function(_,n) coins=coins+n end; player.AddKeys=function(_,n) keys=math.min(99,keys+n) end
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:onPreSpawnCleanAward(); assert(coins==1 and keys==0)
    coins=2; Demo:onPreSpawnCleanAward(); assert(coins==0 and keys==1)
    coins=2; Demo:onPreSpawnCleanAward(); assert(coins==2 and keys==1)
    frame=30; keys=99; Demo:onPreSpawnCleanAward(); assert(coins==2 and keys==99)
  `, fixture);
});

test('triggered aura expires, continues with remaining time, and clears on source loss', async () => {
  const fixture = rulesFixture([{ type: 'activate_aura', amount: 1, duration: 60 }], {
    systems: ['rules', 'aura'], aura: { type: 'damage', damage: 0.5, radius: 80, cooldown: 15, triggered: true },
  });
  validateDesign(designFor(fixture));
  await run(`
    local hits=0
    enemies={{Position=Vector(0,0),TakeDamage=function() hits=hits+1 end,IsVulnerableEnemy=function() return true end,IsDead=function() return false end}}
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    Demo:updatePassiveEffects(); assert(hits==0)
    Demo:onPreSpawnCleanAward(); Demo:updatePassiveEffects(); assert(hits==1)
    frame=15; Demo:onPreGameExit(true); frame=100; Demo:onGameStarted(true)
    frame=120; Demo:updatePassiveEffects(); assert(hits==2)
    owns=false; Demo:updatePassiveEffects(); owns=true; frame=135; Demo:updatePassiveEffects(); assert(hits==2)
    Demo:onPreSpawnCleanAward(); frame=195; Demo:updatePassiveEffects(); assert(hits==2)
  `, fixture);
});

test('friendly children are removed when their owner loses the source', async () => {
  const fixture = rulesFixture([{ type: 'spawn_friendly', friendly_type: 'spider', amount: 1 }]);
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true; Demo:onPreSpawnCleanAward()
    assert(#friendlies==1 and friendlies[1]:Exists())
    owns=false; frame=1; Demo:onPostUpdate(); assert(not friendlies[1]:Exists())
  `, fixture);
});

const blankInventory = `
  local blanks,generated,activeInventory=1,0,0
  player.GetCollectibleNum=function(_,id) if id==797 then return blanks end; return generated end
  player.HasCollectible=function(_,id) if id==797 then return blanks>0 end; return generated>0 end
  player.RemoveCollectible=function(_,id) if id==797 then blanks=blanks-1 else generated=generated-1; if id>=798 then activeInventory=0 end end end
  player.AddCollectible=function(_,id) if id==797 then blanks=blanks+1 else generated=generated+1; if id>=798 then activeInventory=id end end end
  Demo:onPostAddCollectible(797,nil,true,nil,nil,player)
  Demo:onPostRender(); uiCallbacks.input('a glass eye'); uiCallbacks.submit()
  assert(lastRequest.delivery.mode=='blank' and lastRequest.delivery.owner=='11' and blanks==1)
`;

test('blank request survives continue and exchanges exactly once before ACK', async () => {
  await run(blankInventory + `
    Demo:onPreGameExit(true); Demo:onGameStarted(true)
    assert(uiPrompt.pending=='123_0_1_123_1' and uiPrompt.text=='a glass eye')
    envelope.delivery={mode='blank',owner='11'}; nextRaw='profile'; frame=1; Demo:onPostUpdate()
    assert(blanks==0 and generated==1 and events[1]=='ack:123_0_1_123_1')
    nextRaw='profile'; frame=2; Demo:onPostUpdate(); assert(blanks==0 and generated==1)
    Demo:onPreGameExit(true); Demo:onGameStarted(true); assert(uiPrompt.pending==nil)
  `);
});

test('blank delivery rejects forged ownership and preserves entitlement on save failure', async () => {
  await run(blankInventory + `
    envelope.delivery={mode='blank',owner='22'}; nextRaw='profile'; frame=1; Demo:onPostUpdate()
    assert(blanks==1 and generated==0 and #events==0)
  `);
  await run(blankInventory + `
    Demo.SaveData=function() error('disk full') end
    envelope.delivery={mode='blank',owner='11'}; nextRaw='profile'; frame=1; Demo:onPostUpdate()
    assert(blanks==1 and generated==0 and #events==0)
  `);
});

test('creator errors and close preserve a blank and allow a new request', async () => {
  await run(blankInventory + `
    uiCallbacks.close(); assert(blanks==1)
    envelope={version=1,type='status',id=lastRequest.id,status='error',detail='Art service unavailable'}
    frame=1; nextRaw='status'; Demo:onPostUpdate(); assert(blanks==1)
    uiCallbacks.submit(); assert(lastRequest.id=='123_0_1_123_2' and blanks==1)
  `);
});

const activeFixture = rulesFixture([], {systems:['active'],rules:[],active:{effect:'radial_burst',charges:6,targeting:'self',damage:4,radius:100}});

test('active use bounds targets, refuses empty rooms and duplicate uses, and preserves alternate slots',async()=>{
  validateDesign(designFor(activeFixture));
  assert.equal(profileWeight(designFor(activeFixture),catalog),8);
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); assert(entities[1].SubType==798)
    local activeSlot,charges=1,6
    player.GetActiveItem=function(_,slot) return slot==activeSlot and 798 or 0 end
    player.GetActiveCharge=function(_,slot) assert(slot==activeSlot); return charges end
    owns=true; enemies={}
    assert(Demo:onPreUseItem(798,nil,player,0,1).Discharge==false)
    local hits=0
    for i=1,12 do enemies[i]={Position=Vector(10,0),ToNPC=function(self) return self end,IsVulnerableEnemy=function() return true end,IsDead=function() return false end,TakeDamage=function(_,amount) assert(amount==4); hits=hits+1 end} end
    assert(Demo:onPreUseItem(798,nil,player,0,1)==nil)
    assert(Demo:onUseItem(798,nil,player,0,0).Discharge==false and hits==0)
    local result=Demo:onUseItem(798,nil,player,0,1); assert(result.Discharge and result.ShowAnim and not result.Remove and hits==8)
    assert(Demo:onUseItem(798,nil,player,0,1).Discharge==false and hits==8)
    frame=1; charges=5; assert(Demo:onUseItem(798,nil,player,0,1).Discharge==false)
    charges=6; UseFlag={USE_CARBATTERY=4}; assert(Demo:onUseItem(798,nil,player,4,1).Discharge==false)
    Demo:onPreGameExit(true); frame=10; Demo:onGameStarted(true)
    assert(Demo:onUseItem(798,nil,player,0,1).Discharge and hits==16)
    assert(charges==6) -- The handler returns charge policy; the engine owns charge mutation.
  `,activeFixture);
});

test('failed active damage spends no charge and invalid active profiles reject on both sides',async()=>{
  await run(`
    nextRaw='profile'; Demo:onPostUpdate(); owns=true
    player.GetActiveItem=function() return 798 end; player.GetActiveCharge=function() return 6 end
    enemies={{Position=Vector(0,0),ToNPC=function(self) return self end,TakeDamage=function() error('damage unavailable') end}}
    assert(Demo:onUseItem(798,nil,player,0,0).Discharge==false)
  `,activeFixture);
  for(const field of [{charges:3},{damage:7},{radius:121},{effect:'arbitrary'},{targeting:'mouse'},{callback:'execute'}]) {
    const fixture=structuredClone(activeFixture);Object.assign(fixture.active,field);await rejectedByBoth(fixture);
  }
  const fixture=structuredClone(activeFixture);fixture.systems.push('rules');fixture.rules=[{trigger:'room_clear',conditions:[],actions:[{type:'spawn_pickup',pickup_type:'coin',amount:1}]}];
  await rejectedByBoth(fixture);
});

test('active shell bank never overwrites a passive and the ninth active is refused',async()=>{
  await run(`
    for slot=0,8 do
      envelope=deepCopy(envelope)
      envelope.id='123_0_1_active_'..slot;envelope.profile.bridge_request_id=envelope.id
      envelope.profile.sprite_sheet=string.format('gfx/items/collectibles/generated_slot_%02d.png',slot)
      frame=slot;nextRaw='profile';Demo:onPostUpdate()
    end
    assert(#entities==8)
    for index,pickup in ipairs(entities) do assert(pickup.SubType==797+index) end
    Demo:onPreGameExit(true);Demo:onGameStarted(true)
    assert(uiPrompt.getContext().active_count==8 and uiPrompt.getContext().count==8)
  `,activeFixture);
});

test('blank active keeps an occupied inventory and delivers into an empty slot',async()=>{
  await run(blankInventory.replace("uiCallbacks.input('a glass eye')","uiPrompt.activesEnabled=true;uiPrompt.itemType='active';uiCallbacks.input('a glass eye')")+`
    player.GetActiveItem=function() return activeInventory end
    envelope.profile=${toLua(activeFixture)}; envelope.delivery={mode='blank',owner='11'}
    frame=1;nextRaw='profile';Demo:onPostUpdate();assert(blanks==0 and generated==1)
  `);
  await run(blankInventory+`
    player.GetActiveItem=function() return 42 end
    envelope.profile=${toLua(activeFixture)}; envelope.delivery={mode='blank',owner='11'}
    frame=1;nextRaw='profile';Demo:onPostUpdate();assert(blanks==1 and generated==0 and #events==0)
  `);
});

test('Creator replacement preserves shop and choice data and excludes quest, active, and special pedestals',async()=>{
  await run(`
    Isaac.GetPlayerTypeByName=function() return 20 end;player.GetPlayerType=function() return 20 end
    ItemType={ITEM_PASSIVE=1,ITEM_FAMILIAR=2,ITEM_ACTIVE=3};ItemConfig={TAG_QUEST=2}
    local itemType,tags=1,0
    Isaac.GetItemConfig=function() return {GetCollectible=function() return {Type=itemType,Tags=tags} end} end
    Demo:onExecuteCmd('nebius','replace on')
    local function pedestal(subtype,price)
      local data={};local pickup={SubType=subtype,Variant=100,Price=price,ShopItemId=4,OptionsPickupIndex=7,AutoUpdatePrice=false,Wait=10,GetData=function() return data end}
      function pickup:Morph(_,_,id) self.SubType=id;self.Price=0;self.ShopItemId=-1;self.OptionsPickupIndex=0;self.Wait=0 end
      return pickup
    end
    local pickup=pedestal(10,15);Demo:onPickupUpdate(pickup)
    assert(pickup.SubType==797 and pickup.Price==15 and pickup.ShopItemId==4 and pickup.OptionsPickupIndex==7 and pickup.AutoUpdatePrice==false and pickup.Wait==10)
    Demo:onPickupUpdate(pickup);assert(pickup.SubType==797)
    tags=2;local quest=pedestal(11,0);Demo:onPickupUpdate(quest);assert(quest.SubType==11)
    tags=0;itemType=3;local active=pedestal(12,0);Demo:onPickupUpdate(active);assert(active.SubType==12)
    itemType=1;local devil=pedestal(13,-2);Demo:onPickupUpdate(devil);assert(devil.SubType==13)
    local generated=pedestal(733,0);Demo:onPickupUpdate(generated);assert(generated.SubType==733)
    local special=pedestal(14,0);special.VarData=1;Demo:onPickupUpdate(special);assert(special.SubType==14)
  `);
});

test('creator controller can open and cancel without switching to an active',async()=>{
  await run(`
    local actions={};ButtonAction={ACTION_MAP=1,ACTION_DROP=2,ACTION_MENULEFT=3,ACTION_MENURIGHT=4,ACTION_MENUUP=5,ACTION_MENUDOWN=6,ACTION_MENUCONFIRM=7,ACTION_MENUBACK=8}
    player.ControllerIndex=1
    Input.IsActionPressed=function(action,controller) assert(controller==1);return actions[action]==true end
    actions[1],actions[2]=true,true;Demo:onPostRender();assert(uiPrompt.open)
    actions={};now=200;Demo:onPostRender()
    actions[7]=true;Demo:onPostRender();assert(not uiPrompt.virtualKeyboard and uiPrompt.text=='')
    actions={};Demo:onPostRender();actions[1]=true;Demo:onPostRender();assert(uiPrompt.itemType=='passive')
    actions={};Demo:onPostRender();actions[8]=true;Demo:onPostRender();assert(not uiPrompt.open)
  `);
});

test('creator hotkey and replacement setting survive a new run, and cancel keeps the blank',async()=>{
  await run(blankInventory+`
    Keyboard.KEY_F6=295;Demo:onExecuteCmd('nebius','hotkey KEY_F6');Demo:onExecuteCmd('nebius','replace on')
    Demo:onExecuteCmd('nebius','cancel');assert(blanks==1 and uiPrompt.pending==nil)
    Demo:onGameStarted(false);assert(uiPrompt.getHotkey()=='KEY_F6')
    uiPrompt:close();held=true;Demo:onPostRender();assert(not uiPrompt.open)
    held=false;Demo:onPostRender();keyDown[295]=true;Demo:onPostRender();assert(uiPrompt.open)
  `);
});

test('contact retaliation has independent bounded cooldowns for each target',async()=>{
  const fixture=rulesFixture([], {systems:['collision'],rules:[],collision:{conditions:[],cooldown:30,actions:[{type:'retaliate',amount:2}]}});
  await run(`
    nextRaw='profile';Demo:onPostUpdate();owns=true
    local hits=0
    local function enemy(seed) return {InitSeed=seed,Position=Vector(0,0),ToNPC=function(self) return self end,TakeDamage=function() hits=hits+1 end} end
    local one,two=enemy(1),enemy(2)
    Demo:onPrePlayerCollision(player,one);Demo:onPrePlayerCollision(player,one);Demo:onPrePlayerCollision(player,two)
    assert(hits==2)
    frame=30;Demo:onPrePlayerCollision(player,one);assert(hits==3)
  `,fixture);
});

test('stacked weapon updates preserve other sources and native recalculation',async()=>{
  const fixture=rulesFixture([], {systems:['tear_update','bomb','laser','knife'],rules:[],tear_update:{behavior:'pulse',strength:1},bomb:{damage:1,radius:100},laser:{damage:1},knife:{damage:1}});
  await run(`
    nextRaw='profile';Demo:onPostUpdate()
    envelope=deepCopy(envelope);envelope.id='123_0_1_second';envelope.profile.bridge_request_id=envelope.id;envelope.profile.sprite_sheet='gfx/items/collectibles/generated_slot_01.png'
    envelope.profile.tear_update={behavior='shrink',strength=1};envelope.profile.bomb.radius=60
    frame=1;nextRaw='profile';Demo:onPostUpdate()
    local ownedIds={[733]=true,[734]=true};player.HasCollectible=function(_,id) return ownedIds[id]==true end
    local data={};local tear={SpawnerEntity=player,Position=Vector(0,0),Velocity=Vector(1,0),Scale=1,GetData=function() return data end}
    Demo:onPostFireTear(tear);frame=11;Demo:onPostTearUpdate(tear);assert(tear.Scale<1)
    ownedIds[734]=nil;frame=12;Demo:onPostTearUpdate(tear);assert(math.abs(tear.Scale-(1+0.08*math.sin(frame*0.3)))<0.00001)
    ownedIds[733]=nil;Demo:onPostTearUpdate(tear);assert(tear.Scale==1)
    ownedIds[733],ownedIds[734]=true,true
    local bd={};local bomb={SpawnerEntity=player,ExplosionDamage=10,Radius=1,GetData=function() return bd end}
    Demo:onPostFireBomb(bomb);Demo:onPostFireBomb(bomb);assert(bomb.ExplosionDamage==12 and bomb.Radius==100)
    for _,method in ipairs({'onPostLaserUpdate','onPostKnifeUpdate'}) do
      local wd={};local weapon={SpawnerEntity=player,CollisionDamage=3,GetData=function() return wd end}
      Demo[method](Demo,weapon);Demo[method](Demo,weapon);assert(weapon.CollisionDamage==5)
      weapon.CollisionDamage=7;Demo[method](Demo,weapon);assert(weapon.CollisionDamage==9)
      ownedIds[734]=nil;Demo[method](Demo,weapon);assert(weapon.CollisionDamage==8)
      ownedIds[733]=nil;Demo[method](Demo,weapon);assert(weapon.CollisionDamage==7)
      ownedIds[733],ownedIds[734]=true,true
    end
  `,fixture);
});


test('co-op blank delivery belongs to the purchasing player and never falls back to player zero',async()=>{
  await run(`
    local first=player;local second=deepCopy(player);second.InitSeed=22
    local baseGame=Game;Game=function() local game=baseGame();game.GetNumPlayers=function() return 2 end;return game end
    Isaac.GetPlayer=function(index) return index==0 and first or second end
    for _,owner in ipairs({first,second}) do
      owner.blanks,owner.generated=1,0
      owner.GetCollectibleNum=function(self,id) return id==797 and self.blanks or self.generated end
      owner.HasCollectible=function(self,id) return self:GetCollectibleNum(id)>0 end
      owner.RemoveCollectible=function(self,id) if id==797 then self.blanks=self.blanks-1 else self.generated=self.generated-1 end end
      owner.AddCollectible=function(self,id) if id==797 then self.blanks=self.blanks+1 else self.generated=self.generated+1 end end
    end
    Demo:onPostAddCollectible(797,nil,true,nil,nil,second);Demo:onPostRender()
    uiCallbacks.input('a coin eye');uiCallbacks.submit();assert(lastRequest.delivery.owner=='22')
    Demo:onPreGameExit(true);Demo:onGameStarted(true)
    envelope.delivery={mode='blank',owner='22'};frame=1;nextRaw='profile';Demo:onPostUpdate()
    assert(first.blanks==1 and first.generated==0 and second.blanks==0 and second.generated==1)
  `);
});

test('player-hurt retaliation waits for confirmed damage and does not replay legacy rewards',async()=>{
  const fixture=rulesFixture([], {systems:['on_hit'],rules:[
    {trigger:'player_hurt',conditions:[],cooldown:30,actions:[{type:'retaliate',amount:2}]},
    {trigger:'player_hurt',conditions:[],actions:[{type:'grant_soul_hearts',amount:1}]},
  ]});
  validateDesign(designFor(fixture));
  await run(`
    nextRaw='profile';Demo:onPostUpdate();owns=true
    local hits=0
    local enemy={Position=Vector(0,0),ToNPC=function(self) return self end,TakeDamage=function() hits=hits+1;Demo:onPostEntityTakeDamage(player,1,0,{Entity=enemy}) end}
    Demo:onEntityTakeDamage(player,1,0,{Entity=enemy});assert(hits==0 and player.hearts==1)
    Demo:onPostEntityTakeDamage(player,1,0,{Entity=enemy});assert(hits==1 and player.hearts==1)
    Demo:onPostEntityTakeDamage(player,1,0,{Entity=enemy});assert(hits==1 and player.hearts==1)
  `,fixture);
});

test('inactive effect families do not scan enemies or allocate weapon data',async()=>{
  const fixture=rulesFixture([], {systems:[],rules:[]});
  await run(`
    nextRaw='profile';Demo:onPostUpdate();owns=true
    Isaac.FindInRadius=function() error('unexpected radius scan') end
    Isaac.FindByType=function() error('unexpected entity scan') end
    local entity={SpawnerEntity=player,GetData=function() error('unexpected entity data') end}
    Demo:onPostUpdate();Demo:onPostFireTear(entity);Demo:onPostTearUpdate(entity);Demo:onPostFireBomb(entity)
    Demo:onPostLaserUpdate(entity);Demo:onPostKnifeUpdate(entity);Demo:updatePassiveEffects()
    Demo:onPreTearCollision(entity,entity);Demo:onPrePlayerCollision(player,entity);Demo:onPostEntityKill(entity)
  `,fixture);
});

test('presentation choices are bounded and missing engine sounds fall back safely',async()=>{
  const fixture=structuredClone(profile);fixture.visuals={...fixture.visuals,sound:'chime',animation:'pulse'};
  validateDesign(designFor(fixture));
  await run(`
    SoundEffect={SOUND_POWERUP1=1};nextRaw='profile';Demo:onPostUpdate();Demo:onPostRender()
    Demo:onPostAddCollectible(733,nil,true,nil,nil,player)
    frame=10;Demo:onPickupRender(entities[1]);assert(lastDestination.width>=30 and lastDestination.width<=34)
  `,fixture);
  for(const visuals of [{sound:'execute'},{animation:'arbitrary'},{path:'../../file'}]){
    const invalid=structuredClone(profile);Object.assign(invalid.visuals,visuals);await rejectedByBoth(invalid);
  }
});

test('AIsaac applies cosmetic goggles once without granting Tech X', async () => {
  await run(`
    Isaac.GetPlayerTypeByName=function(name) if name=='AIsaac' then return 41 end; return -1 end
    player.GetPlayerType=function() return 41 end
    local data,costumes={},0
    player.GetData=function() return data end
    Isaac.GetCostumeIdByPath=function(path) assert(path=='gfx/characters/aisaac_techx.anm2'); return 0 end
    player.AddNullCostume=function(_,id) assert(id==0);costumes=costumes+1 end
    player.AddCollectible=function() error('Goggles must not grant Tech X') end
    Demo:onPostPlayerInit(player);Demo:onPostPlayerInit(player)
    assert(costumes==1 and data.nebiusAIsaacGoggles)
  `);
});

test('AIsaac morphs pedestals into the matching Generator, including actives and devil deals', async () => {
  await run(`
    Isaac.GetPlayerTypeByName=function(name) if name=='AIsaac' then return 41 end; return -1 end
    player.GetPlayerType=function() return 41 end
    ItemType={ITEM_PASSIVE=1,ITEM_FAMILIAR=2,ITEM_ACTIVE=3};ItemConfig={TAG_QUEST=2}
    local qualities={[10]=0,[11]=3,[12]=4,[13]=1,[14]=2}
    local itemType,tags=1,0
    Isaac.GetItemConfig=function() return {GetCollectible=function(_,id) return {Type=itemType,Tags=tags,Quality=qualities[id] or 1} end} end
    local function pedestal(subtype,price)
      local data={};local pickup={SubType=subtype,Variant=100,InitSeed=subtype,Price=price,ShopItemId=4,OptionsPickupIndex=7,AutoUpdatePrice=false,Wait=10,Touched=false,VarData=0,GetData=function() return data end}
      function pickup:Morph(_,_,id) self.SubType=id;self.Price=0;self.ShopItemId=-1;self.OptionsPickupIndex=0;self.Wait=0 end
      return pickup,data
    end
    local gray,grayData=pedestal(10,0);Demo:onPickupUpdate(gray)
    assert(gray.SubType==820 and gray.Price==0 and grayData.nebiusGeneratorQuality==0 and grayData.nebiusGeneratorItemType=='passive')
    local purple=pedestal(11,15);Demo:onPickupUpdate(purple);assert(purple.SubType==823 and purple.Price==15 and purple.ShopItemId==4)
    itemType=3;local yellow,yellowData=pedestal(12,-2);Demo:onPickupUpdate(yellow)
    assert(yellow.SubType==824 and yellow.Price==-2 and yellowData.nebiusGeneratorItemType=='active')
    itemType=1;tags=2;local quest=pedestal(13,0);Demo:onPickupUpdate(quest);assert(quest.SubType==13)
    tags=0;local generated=pedestal(733,0);Demo:onPickupUpdate(generated);assert(generated.SubType==733)
    local choice=pedestal(14,0);choice.GetCollectibleCycle=function() return {1,2} end;Demo:onPickupUpdate(choice);assert(choice.SubType==822)
  `);
});

const aisaacPedestalSetup = `
  Isaac.GetPlayerTypeByName=function(name) if name=='AIsaac' then return 41 end; return -1 end
  player.GetPlayerType=function() return 41 end
  ItemType={ITEM_PASSIVE=1,ITEM_FAMILIAR=2,ITEM_ACTIVE=3};ItemConfig={TAG_QUEST=2}
  Isaac.GetItemConfig=function() return {GetCollectible=function(_,id) return {Type=id==14 and 3 or 1,Tags=0,Quality=id%10} end} end
  function generatorPedestal(subtype)
    local data={}
    local pickup={SubType=subtype,Variant=100,InitSeed=123,Price=15,ShopItemId=4,OptionsPickupIndex=7,AutoUpdatePrice=false,Wait=10,Touched=false,VarData=0,GetData=function() return data end}
    pickup.GetCollectibleCycle=function() return {} end
    pickup.HasFlipData=function() return false end
    pickup.GetFlipCollectible=function() return nil end
    function pickup:Morph(_,_,id)
      Demo:onPickupInit(self)
      self.SubType=id;self.Price=0;self.ShopItemId=-1;self.OptionsPickupIndex=0;self.Wait=0
    end
    return pickup,data
  end
`;

const singularitySetup = `
  Isaac.GetPlayerTypeByName=function(name) if name=='AIsaac' then return 41 end; return -1 end
  player.GetPlayerType=function() return 41 end
  ItemType={ITEM_PASSIVE=1,ITEM_FAMILIAR=2,ITEM_ACTIVE=3};ItemConfig={TAG_QUEST=2}
  Isaac.GetItemConfig=function() return {GetCollectible=function() return {Type=3,Tags=0,Quality=3} end} end
  local inventory={}
  local activeItem,charge=0,0
  player.GetActiveItem=function() return activeItem end
  player.GetActiveCharge=function() return charge end
  player.GetBatteryCharge=function() return 0 end
  player.SetActiveCharge=function(_,amount) charge=amount end
  player.GetCollectibleNum=function(_,id) return inventory[id] or 0 end
  player.HasCollectible=function(_,id) return (inventory[id] or 0)>0 end
  player.RemoveCollectible=function(_,id) inventory[id]=(inventory[id] or 0)-1;if activeItem==id then activeItem=0 end end
  player.AddCollectible=function(_,id,amount,firstTime,slot)
    inventory[id]=(inventory[id] or 0)+1
    if id==900 then activeItem=id;charge=amount or 0 end
    Demo:onPostAddCollectible(id,amount,firstTime,slot,nil,player)
  end
  Random=function() return 724217988 end
`;

test('AIsaac starts with one fully charged Terminal use and never converts it into a Generator', async () => {
  await run(singularitySetup + `
    Demo:onGameStarted(false)
    assert(player:GetActiveItem(0)==900,'startup grant must survive the collectible callback')
    assert(player:GetCollectibleNum(823)==0 and uiPrompt.pending==nil,'startup must not queue an AI build')
    assert(player:GetActiveCharge(0)==12,'a fresh run starts with one Terminal use ready')
    player:SetActiveCharge(7,0);Demo:onPreGameExit(true);Demo:onGameStarted(true)
    assert(player:GetActiveCharge(0)==7,'continue must preserve earned charge')
  `);
});

test('AIsaac leaves dropped Terminal pedestals intact', async () => {
  await run(aisaacPedestalSetup + `
    local pickup=generatorPedestal(900)
    Demo:onPickupInit(pickup);Demo:onPickupUpdate(pickup)
    Demo:onPrePickupCollision(pickup,player)
    assert(pickup.SubType==900,'the fixed Terminal is not an active Generator source')
  `);
});

test('Terminal needs twelve charges and requests a passive without replacing itself', async () => {
  await run(singularitySetup + `
    Demo:onGameStarted(false)
    for amount=0,11 do
      player:SetActiveCharge(amount,0)
      assert(Demo:onPreUseItem(900,nil,player,0,0).Discharge==false)
      assert(Demo:onUseItem(900,nil,player,0,0).Discharge==false and uiPrompt.pending==nil)
    end
    player:SetActiveCharge(12,0)
    assert(Demo:onPreUseItem(900,nil,player,0,0)==nil)
    local result=Demo:onUseItem(900,nil,player,0,0)
    assert(result.Discharge and not result.Remove and player:GetActiveItem(0)==900)
    assert(lastRequest.delivery.mode=='singularity' and lastRequest.quality==3 and lastRequest.delivery.quality==3 and lastRequest.item_type=='passive')
    local requestId=uiPrompt.pending
    assert(Demo:onUseItem(900,nil,player,0,0).Discharge==false and uiPrompt.pending==requestId)
    envelope.delivery={mode='singularity',owner='11',quality=3}
    envelope.id=requestId;envelope.profile.bridge_request_id=requestId;envelope.profile.metadata.quality=3
    frame=1;nextRaw='profile';Demo:onPostUpdate()
    assert(player:GetCollectibleNum(733)==1 and player:GetActiveItem(0)==900 and uiPrompt.pending==nil)
  `);
});

test('Terminal keeps its charge when the generation request cannot be saved', async () => {
  await run(singularitySetup + `
    Demo:onGameStarted(false);player:SetActiveCharge(12,0)
    Demo.SaveData=function() error('save failed') end
    local result=Demo:onUseItem(900,nil,player,0,0)
    assert(not result.Discharge and not result.ShowAnim and not result.Remove)
    assert(uiPrompt.pending==nil and lastRequest==nil and player:GetActiveCharge(0)==12)
  `);
});

test('AIsaac converts every quality during pickup initialization and preserves prices and choices', async () => {
  await run(aisaacPedestalSetup + `
    for quality=0,4 do
      local pickup,data=generatorPedestal(10+quality)
      Demo:onPickupInit(pickup)
      assert(pickup.SubType==820+quality and data.nebiusGeneratorQuality==quality)
      assert(data.nebiusGeneratorItemType==(quality==4 and 'active' or 'passive'))
      assert(pickup.Price==15 and pickup.ShopItemId==4 and pickup.OptionsPickupIndex==7 and pickup.Wait==10 and pickup.AutoUpdatePrice==false)
      assert(not data.nebiusMorphing)
    end
  `);
});

test('AIsaac reconverts rerolled and revisited pedestals rather than trusting stale replacement markers', async () => {
  await run(aisaacPedestalSetup + `
    local pickup,data=generatorPedestal(10)
    Demo:onPickupUpdate(pickup);assert(pickup.SubType==820)
    pickup.SubType=14
    Demo:onPickupUpdate(pickup);assert(pickup.SubType==824 and data.nebiusGeneratorItemType=='active')
    pickup.SubType=10;data.nebiusCheckedSubtype=10
    Demo:onPickupUpdate(pickup);assert(pickup.SubType==820 and data.nebiusGeneratorItemType=='passive')
    local revisited=generatorPedestal(12)
    Demo:onPickupInit(revisited);assert(revisited.SubType==822)
  `);
});

test('AIsaac replacement does not depend on generation readiness or valid generated-item save data', async () => {
  await run(aisaacPedestalSetup + `
    Demo:onPreGameExit(true)
    local early=generatorPedestal(11)
    Demo:onPickupInit(early);assert(early.SubType==821)
    savedData='bad';Demo:onGameStarted(true)
    local blockedPickup=generatorPedestal(13)
    Demo:onPickupUpdate(blockedPickup);assert(blockedPickup.SubType==823)
  `);
});

test('AIsaac converts touched, special, cycling, and Flip pedestals and catches collisions before another update', async () => {
  await run(aisaacPedestalSetup + `
    local special=generatorPedestal(12)
    special.Touched=true;special.VarData=5
    special.GetCollectibleCycle=function() return {10,12,14} end
    special.HasFlipData=function() return true end
    special.GetFlipCollectible=function() return 14 end
    Demo:onPickupUpdate(special);assert(special.SubType==822)
    local pickup,data=generatorPedestal(14)
    Demo:onPrePickupCollision(pickup,player)
    assert(pickup.SubType==824 and data.nebiusGeneratorItemType=='active')
    player.GetCollectibleNum=function(_,id) return id==824 and 1 or 0 end
    Demo:onPostAddCollectible(824,nil,true,nil,nil,player)
    assert(lastRequest.auto and lastRequest.quality==4 and lastRequest.item_type=='active')
  `);
});

test('picking up a Generator queues an auto build without opening the creator', async () => {
  await run(`
    Isaac.GetPlayerTypeByName=function(name) if name=='AIsaac' then return 41 end; return -1 end
    player.GetPlayerType=function() return 41 end
    local held={[822]=1,[733]=0}
    player.GetCollectibleNum=function(_,id) return held[id] or 0 end
    player.RemoveCollectible=function(_,id) held[id]=(held[id] or 1)-1 end
    player.AddCollectible=function(_,id) held[id]=(held[id] or 0)+1 end
    local data={nebiusGeneratorQuality=2,nebiusGeneratorItemType='passive'}
    local pickup={Variant=100,SubType=822,GetData=function() return data end}
    Demo:onPrePickupCollision(pickup,player)
    Demo:onPostAddCollectible(822,nil,true,nil,nil,player)
    Demo:onPostRender()
    assert(not uiPrompt.open and uiPrompt.pending~=nil and lastRequest.auto==true and lastRequest.quality==2 and lastRequest.delivery.mode=='generator' and lastRequest.delivery.quality==2)
    local requestId=lastRequest.id
    Demo:onPreGameExit(true);Demo:onGameStarted(true)
    assert(uiPrompt.pending==requestId and not uiPrompt.open)
    envelope.delivery={mode='generator',owner='11',quality=2};envelope.id=requestId;envelope.profile.bridge_request_id=requestId
    frame=1;nextRaw='profile';Demo:onPostUpdate()
    assert(held[822]==0 and held[733]==1 and events[1]=='ack:'..requestId)
  `);
});

test('AIsaac converts a blank AI Item to a Generator instead of opening the manual creator', async () => {
  await run(aisaacPedestalSetup + `
    local pickup=generatorPedestal(797)
    Demo:onPickupInit(pickup);assert(pickup.SubType==824)
    local held={[797]=1}
    player.GetCollectibleNum=function(_,id) return held[id] or 0 end
    player.RemoveCollectible=function(_,id) held[id]=math.max(0,(held[id] or 0)-1) end
    player.AddCollectible=function(self,id) held[id]=(held[id] or 0)+1;Demo:onPostAddCollectible(id,nil,true,nil,nil,self) end
    Demo:onPostAddCollectible(797,nil,true,nil,nil,player)
    assert(held[797]==0 and held[824]==1 and lastRequest.auto and not uiPrompt.open and not uiPrompt.requested)
  `);
});

test('a missed vanilla pickup becomes a Generator and a failed build keeps it', async () => {
  await run(`
    Isaac.GetPlayerTypeByName=function(name) if name=='AIsaac' then return 41 end; return -1 end
    player.GetPlayerType=function() return 41 end
    ItemType={ITEM_PASSIVE=1,ITEM_ACTIVE=3};ItemConfig={TAG_QUEST=2}
    Isaac.GetItemConfig=function() return {GetCollectible=function() return {Type=1,Tags=0,Quality=0} end} end
    local held={}
    player.GetCollectibleNum=function(_,id) return held[id] or 0 end
    player.RemoveCollectible=function(_,id) held[id]=math.max(0,(held[id] or 0)-1) end
    player.AddCollectible=function(self,id) held[id]=(held[id] or 0)+1; Demo:onPostAddCollectible(id,nil,true,nil,nil,self) end
    held[50]=1
    Demo:onPostAddCollectible(50,nil,true,nil,nil,player)
    assert(held[50]==0 and held[820]==1 and lastRequest.auto==true and lastRequest.quality==0 and not uiPrompt.open)
    local requestId=lastRequest.id
    envelope={version=1,type='status',id=requestId,status='error',detail='Item design was invalid',error_code='INVALID_OUTPUT'}
    nextRaw='status';frame=1;Demo:onPostUpdate()
    assert(held[820]==1 and uiPrompt.pending==nil and uiPrompt.status=='Generator kept.' and not uiPrompt.open)
  `);
});

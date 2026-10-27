local Demo = RegisterMod("Live Sprite Swap Demo", 1)
local bridgeJson = require("json")
local promptUi = include("nebius_prompt").new(bridgeJson)
local vanillaAudit = include("vanilla_audit")
local pickupCaptureModule = include("pickup_capture")
local pickupProbeModule = include("pickup_probe")
local GENERATED_ITEM_CAPACITY, GENERATED_ACTIVE_CAPACITY = 128, 8
local ids, slotById = {}, {}
for slot = 0, GENERATED_ITEM_CAPACITY-1 do
  local id = Isaac.GetItemIdByName(string.format("Generated Passive %02d", slot))
  ids[slot+1], slotById[id] = id, slot+1
end
local records, runtime, usedArt, accepted = {}, {}, {}, {}
local roomStatGrants = {}
local playerDeathSeen = {}
local combat = {depth=0,effects={damage_burst={on_kill=true,player_hurt=true,collision=true},apply_status={tear_impact=true,collision=true,on_kill=true,enemy_hit=true},retaliate={collision=true,player_hurt=true}}}
combat.powerLedger = include("power_ledger")
local function roomStamp()
  local level = Game():GetLevel()
  return tostring(level:GetAbsoluteStage()) .. ":" .. tostring(level:GetCurrentRoomIndex())
end
local session = tostring(Random()) .. "_" .. tostring(Isaac.GetTime())
local serial, runToken, running, blocked = 0, nil, false, nil
local selectedSaveSlot,freshRun,endedRun=nil,false,false
local creator={blank=Isaac.GetItemIdByName("AI Item"),singularity=Isaac.GetItemIdByName("Singularity Terminal"),requests={},cancelled={},deliveries={},noticed={},replacements={},generatorQueue={},touch={},owner=nil,settings={hotkey="KEY_8",replacePassives=false}}
function combat.powerRecords()
  local result={}
  for _,record in ipairs(records) do
    local receipt=creator.deliveries[record.bridge_request_id]
    local mode=receipt and receipt.mode
    result[#result+1]={profile=record,source=mode=="generator" and "Generator" or mode=="singularity" and "Singularity" or "Creator"}
  end
  return result
end
creator.passiveIds,creator.activeIds,creator.generatorIds,creator.generatorIdSet={},{},{},{}
for index,id in ipairs(ids) do creator.passiveIds[index]=id end
for slot=0,GENERATED_ACTIVE_CAPACITY-1 do creator.activeIds[slot+1]=Isaac.GetItemIdByName(string.format("Generated Active %02d",slot)) end
creator.activeIdSet={}
for _,id in ipairs(creator.activeIds) do if id>0 then creator.activeIdSet[id]=true end end
for quality=0,4 do
  local id=Isaac.GetItemIdByName(string.format("Generator %d", quality))
  creator.generatorIds[quality]=id
  if id and id>0 then creator.generatorIdSet[id]=quality end
end
function creator.assignShell(index,record)
  local id=creator.passiveIds[index]
  if record.active then
    local count=0
    for previous=1,index-1 do if records[previous].active then count=count+1 end end
    id=creator.activeIds[count+1]
  end
  if not id or id<=0 then return false end
  slotById[ids[index]]=nil; ids[index]=id; slotById[id]=index
  return true
end
function creator.player(seed)
  for p=0,Game():GetNumPlayers()-1 do local player=Isaac.GetPlayer(p); if tostring(player.InitSeed)==seed then return player end end
end
function creator.count(player)
  return player and player.GetCollectibleNum and player:GetCollectibleNum(creator.blank) or 0
end
function creator.isCharacter(player)
  if not Isaac.GetPlayerTypeByName or not player.GetPlayerType then return false end
  local id=Isaac.GetPlayerTypeByName("The Creator",false)
  return id and id>=0 and player:GetPlayerType()==id
end
function creator.isAIsaac(player)
  if not Isaac.GetPlayerTypeByName or not player or not player.GetPlayerType then return false end
  local id=Isaac.GetPlayerTypeByName("AIsaac",false)
  local creatorId=Isaac.GetPlayerTypeByName("The Creator",false)
  if not id or id<0 or id==creatorId then return false end
  return player:GetPlayerType()==id
end
function creator.anyAIsaac()
  if not Game or not Isaac.GetPlayer then return false end
  for playerIndex=0,Game():GetNumPlayers()-1 do
    if creator.isAIsaac(Isaac.GetPlayer(playerIndex)) then return true end
  end
  return false
end
function creator.applyAIsaac(player)
  if not creator.isAIsaac(player) then return end
  if not creator.aisaacCostume and Isaac.GetCostumeIdByPath then
    for _,costumePath in ipairs({"gfx/characters/aisaac_techx.anm2","aisaac_techx.anm2"}) do
      local ok,id=pcall(Isaac.GetCostumeIdByPath,costumePath)
      if ok and type(id)=="number" and id>=0 then creator.aisaacCostume=id; break end
    end
  end
  if not creator.aisaacCostume or not player.AddNullCostume then return end
  local data=player.GetData and player:GetData()
  if type(data)=="table" and data.nebiusAIsaacGoggles then return end
  if pcall(player.AddNullCostume,player,creator.aisaacCostume) and type(data)=="table" then data.nebiusAIsaacGoggles=true end
end
function creator.snapshot()
  return {requests=creator.requests,cancelled=creator.cancelled,deliveries=creator.deliveries,noticed=creator.noticed,replacements=creator.replacements,generatorQueue=creator.generatorQueue,idleOpen=promptUi.open or promptUi.requested,owner=creator.owner,settings=creator.settings,itemType=promptUi.itemType,text=promptUi.text,quality=promptUi.quality,sequence=promptUi.sequence,pending=promptUi.pending,pendingKind=promptUi.pendingKind}
end
function creator.handoff(player)
  creator.owner=tostring(player.InitSeed)
  promptUi.controller=player.ControllerIndex or 0
end
function creator.serviceBlanks()
  if not running or blocked or promptUi.open or promptUi.requested or promptUi.pending or next(creator.requests) then return end
  for playerIndex=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(playerIndex)
    local owner=tostring(player.InitSeed)
    local count=creator.count(player)
    if count>(creator.noticed[owner] or 0) then
      creator.handoff(player); creator.noticed[owner]=count; promptUi.requested=true; return
    end
    creator.noticed[owner]=count
  end
end
function creator.restore(saved,run)
  if saved==nil then return true end
  if type(saved)~="table" or type(saved.requests)~="table" or type(saved.text)~="string" or #saved.text>2000 or type(saved.quality)~="number" or saved.quality<0 or saved.quality>4 or saved.quality%1~=0 or type(saved.sequence)~="number" or saved.sequence<0 or saved.sequence>1000000 or saved.sequence%1~=0 then return false end
  if saved.owner~=nil and (type(saved.owner)~="string" or #saved.owner>40 or not saved.owner:match("^%-?%d+$")) then return false end
  if saved.pending~=nil and (type(saved.pending)~="string" or #saved.pending>100 or not saved.pending:match("^[%w_-]+$") or type(run)~="string" or saved.pending:sub(1,#run+1)~=run.."_" or (saved.pendingKind~="generate" and saved.pendingKind~="sentence")) then return false end
  local count=0
  for id,request in pairs(saved.requests) do
    count=count+1
    if count>GENERATED_ITEM_CAPACITY or type(id)~="string" or #id>100 or type(run)~="string" or id:sub(1,#run+1)~=run.."_" or not id:match("^[%w_-]+$") or type(request)~="table" or type(request.owner)~="string" or #request.owner>40 or not request.owner:match("^%-?%d+$") or (request.mode~="blank" and request.mode~="generator" and request.mode~="singularity") then return false end
    if request.mode=="blank" then
      if request.itemType~=nil and request.itemType~="active" and request.itemType~="passive" then return false end
      for key in pairs(request) do if key~="mode" and key~="owner" and key~="itemType" then return false end end
    elseif request.mode=="generator" and ((request.itemType~="passive" and request.itemType~="active") or type(request.quality)~="number" or request.quality<0 or request.quality>4 or request.quality%1~=0 or type(request.collectible)~="number" or request.collectible~=creator.generatorIds[request.quality]) then return false
    elseif request.mode=="singularity" then
      if type(request.quality)~="number" or request.quality<0 or request.quality>4 or request.quality%1~=0 or type(request.slot)~="number" or request.slot<0 or request.slot>3 or request.slot%1~=0 then return false end
      for key in pairs(request) do if key~="mode" and key~="owner" and key~="quality" and key~="slot" then return false end end
    else
      for key in pairs(request) do if key~="mode" and key~="owner" and key~="itemType" and key~="quality" and key~="collectible" and key~="slot" then return false end end
    end
  end
  creator.requests,creator.owner=saved.requests,saved.owner
  local function requestId(id)
    return type(id)=="string" and #id<=100 and type(run)=="string" and id:sub(1,#run+1)==run.."_" and id:match("^[%w_-]+$")
  end
  local function integer(value,maximum)
    return type(value)=="number" and value>=0 and value<=maximum and value%1==0
  end
  for _,field in ipairs({"cancelled","deliveries","noticed","replacements"}) do if saved[field]~=nil and type(saved[field])~="table" then return false end end
  if saved.idleOpen~=nil and type(saved.idleOpen)~="boolean" then return false end
  local replacementCount=0
  for key,value in pairs(saved.replacements or {}) do
    replacementCount=replacementCount+1
    if replacementCount>2048 or type(key)~="string" or #key>140 or not key:match("^[%d:%-]+$") or value~=true then return false end
  end
  creator.replacements=saved.replacements or {}
  local count=0
  for id,value in pairs(saved.cancelled or {}) do
    count=count+1
    if count>1000000 or not requestId(id) or value~=true then return false end
  end
  count=0
  for id,receipt in pairs(saved.deliveries or {}) do
    count=count+1
    if count>GENERATED_ITEM_CAPACITY or not requestId(id) or type(receipt)~="table" or type(receipt.owner)~="string" or #receipt.owner>40 or not receipt.owner:match("^%-?%d+$") or (receipt.phase~="prepared" and receipt.phase~="committed") or not integer(receipt.index,GENERATED_ITEM_CAPACITY) or receipt.index<1 or not integer(receipt.shell,1000000) or not integer(receipt.slot,3) or type(receipt.active)~="boolean" then return false end
    for _,name in ipairs({"beforeBlank","afterBlank","beforeShell","afterShell","beforeActive","witnessBlank","witnessShell","witnessActive"}) do if not integer(receipt[name],1000000) then return false end end
    if receipt.beforeBlank<0 or (receipt.afterBlank~=receipt.beforeBlank and receipt.afterBlank~=receipt.beforeBlank-1) or receipt.afterShell~=receipt.beforeShell+1 then return false end
    if receipt.collectible~=nil and (not integer(receipt.collectible,1000000) or (receipt.collectible~=creator.blank and creator.generatorIdSet[receipt.collectible]==nil)) then return false end
  end
  for owner,count in pairs(saved.noticed or {}) do if type(owner)~="string" or #owner>40 or not owner:match("^%-?%d+$") or not integer(count,1000000) then return false end end
  creator.cancelled,creator.deliveries,creator.noticed=saved.cancelled or {},saved.deliveries or {},saved.noticed or {}
  if saved.generatorQueue~=nil and type(saved.generatorQueue)~="table" then return false end
  if type(saved.generatorQueue)=="table" then
    local queue,queueCount={},0
    for _,entry in ipairs(saved.generatorQueue) do
      queueCount=queueCount+1
      if queueCount>16 or type(entry)~="table" or type(entry.owner)~="string" or #entry.owner>40 or not entry.owner:match("^%-?%d+$") or (entry.itemType~="passive" and entry.itemType~="active") or not integer(entry.quality,4) or not integer(entry.collectible,1000000) or entry.collectible~=creator.generatorIds[entry.quality] then return false end
      for key in pairs(entry) do if key~="owner" and key~="quality" and key~="itemType" and key~="collectible" then return false end end
      queue[#queue+1]=entry
    end
    creator.generatorQueue=queue
  else creator.generatorQueue={} end
  if saved.idleOpen and saved.owner and not saved.pending then creator.noticed[saved.owner]=0 end
  if saved.itemType~=nil and saved.itemType~="active" and saved.itemType~="passive" then return false end
  promptUi.itemType=(promptUi.activesEnabled and saved.itemType) or "passive"
  promptUi.text,promptUi.quality,promptUi.sequence=saved.text,saved.quality,saved.sequence
  if saved.pending and saved.pendingKind=="generate" then
    promptUi.pending,promptUi.pendingKind,promptUi.started=saved.pending,"generate",Isaac.GetTime()
    promptUi.phase,promptUi.status="generating","Recovering pending generation..."
    if creator.requests[saved.pending] and creator.requests[saved.pending].mode=="generator" then promptUi.suppressOpen=true end
  end
  return true
end
function creator.inventory(player,receipt)
  if not player or not player.GetCollectibleNum or (receipt.active and not player.GetActiveItem) then return end
  local token=receipt.collectible or creator.blank
  return player:GetCollectibleNum(token),player:GetCollectibleNum(receipt.shell),receipt.active and player:GetActiveItem(receipt.slot) or 0
end
function creator.reconcile()
  local rollback
  for id,receipt in pairs(creator.deliveries) do
    local record=records[receipt.index]
    if not record or record.bridge_request_id~=id or ids[receipt.index]~=receipt.shell or (record.active~=nil)~=receipt.active then return false end
    local blanks,shells,active=creator.inventory(creator.player(receipt.owner),receipt)
    if receipt.phase=="prepared" then
      if receipt.index~=#records or not creator.requests[id] then return false end
      if blanks==receipt.beforeBlank and shells==receipt.beforeShell and active==receipt.beforeActive then
        rollback={id=id,index=receipt.index}
      elseif blanks==receipt.afterBlank and shells==receipt.afterShell and active==(receipt.active and receipt.shell or 0) then
        receipt.phase="committed"; receipt.witnessBlank,receipt.witnessShell,receipt.witnessActive=blanks,shells,active
        creator.requests[id]=nil
        if promptUi.pending==id then promptUi.pending,promptUi.pendingKind=nil,nil; promptUi.phase="success" end
        creator.noticed[receipt.owner]=0
      else return false end
    elseif blanks~=receipt.witnessBlank or shells~=receipt.witnessShell or active~=receipt.witnessActive then return false end
  end
  if rollback then
    usedArt[tonumber(records[rollback.index].sprite_sheet:match("generated_slot_(%d+)"))]=nil
    records[rollback.index],runtime[rollback.index],accepted[rollback.id]=nil,nil,nil
    creator.deliveries[rollback.id]=nil
  end
  return true
end
local pendingProfileEnvelope, lastPollTime, lastStateTime = nil, -999, -999
local statusText, statusUntil = "", 0
local function playProfileSound(profile,volume)
  if not profile or not profile.sound or profile.sound=="none" or Game():GetFrameCount()<(profile.soundReady or -1) then return end
  local name=({chime="SOUND_HOLY",click="SOUND_BUTTON_PRESS",powerup="SOUND_POWERUP1"})[profile.sound]
  local id=SoundEffect and (SoundEffect[name] or SoundEffect.SOUND_POWERUP1)
  if id then pcall(function() SFXManager():Play(id,volume or 0.45) end); profile.soundReady=Game():GetFrameCount()+15 end
end
local pendingBanner, pendingStatPlayer = nil, nil
local function showStatus(message)
  statusText, statusUntil = message, Game():GetFrameCount()+240
  Isaac.DebugString("[Live Sprite Swap Demo] " .. message)
end
local function showBanner(title, subtitle)
  local ok, hud = pcall(function() return Game():GetHUD() end)
  if ok and hud and hud.ShowItemText then pcall(hud.ShowItemText, hud, title, subtitle) end
end
local function statCacheFlags()
  local cacheFlags = CacheFlag.CACHE_DAMAGE|CacheFlag.CACHE_FIREDELAY|CacheFlag.CACHE_RANGE|CacheFlag.CACHE_LUCK|CacheFlag.CACHE_SHOTSPEED|CacheFlag.CACHE_SPEED
  if CacheFlag.CACHE_FLYING then cacheFlags = cacheFlags|CacheFlag.CACHE_FLYING end
  return cacheFlags
end
local function refreshStats(player)
  if not player or not player.AddCacheFlags then return end
  player:AddCacheFlags(statCacheFlags())
  player:EvaluateItems()
end
local function wrapLines(value, width)
  local lines, line = {}, ""
  for word in tostring(value or ""):gmatch("%S+") do
    local nextLine = line == "" and word or (line .. " " .. word)
    if #nextLine > width and line ~= "" then lines[#lines + 1] = line; line = word else line = nextLine end
  end
  if line ~= "" then lines[#lines + 1] = line end
  return lines
end
local function flagFromName(name)
  local flags = {
    homing = TearFlags.TEAR_HOMING, spectral = TearFlags.TEAR_SPECTRAL,
    piercing = TearFlags.TEAR_PIERCING, poison = TearFlags.TEAR_POISON,
    burn = TearFlags.TEAR_BURN, slow = TearFlags.TEAR_SLOW,
    fear = TearFlags.TEAR_FEAR, charm = TearFlags.TEAR_CHARM,
    bounce = TearFlags.TEAR_BOUNCE, split = TearFlags.TEAR_SPLIT,
    orbit = TearFlags.TEAR_ORBIT | TearFlags.TEAR_SPECTRAL, glow = TearFlags.TEAR_GLOW, explosive = TearFlags.TEAR_EXPLOSIVE, confusion = TearFlags.TEAR_CONFUSION, knockback = TearFlags.TEAR_KNOCKBACK,
    continuum = TearFlags.TEAR_CONTINUUM, boomerang = TearFlags.TEAR_BOOMERANG, grow = TearFlags.TEAR_GROW, shrink = TearFlags.TEAR_SHRINK,
    sticky = TearFlags.TEAR_WAIT, wiggle = TearFlags.TEAR_WIGGLE, slowing_creep = TearFlags.TEAR_GISH,
  }
  return flags[name] or 0
end

-- The native bridge delivers JSON data only. This fixed validator deliberately
-- mirrors the Stage 2B contract; no model-provided Lua or paths are executed.
local triggers = { room_enter = true, room_clear = true, enemy_hit = true, player_hurt = true, pickup = true, new_floor = true, tear_fire = true, bomb_explode = true, active_use = true, pill_use = true, card_use = true, boss_kill = true, player_death = true }
local ruleTriggers = { room_enter = true, room_clear = true, pickup = true, new_floor = true, tear_fire = true, bomb_explode = true, active_use = true, pill_use = true, card_use = true, boss_kill = true, player_death = true }
local hitTriggers = { enemy_hit = true, player_hurt = true }
local systemNames = { active=true, stats = true, tears = true, rules = true, familiar = true, aura = true, on_hit = true, on_kill = true, tear_impact = true, collision = true, tear_update = true, bomb = true, laser = true, knife = true }
local tearUpdateBehaviors = { home = true, pulse = true, shrink = true, spiral = true, accelerate = true }
local conditionCatalog = include("condition_metadata")
combat.conditionQueries = include("expanded_conditions").new(conditionCatalog)
combat.eventContext = include("event_context")
combat.expandedModule = include("expanded_effects")
combat.expandedCatalog = include("effect_metadata")
local roomKinds = { boss = 5, secret = 7, super_secret = 8, shop = 2, devil = 14, angel = 15, planetarium = 24, library = 12, curse = 10 }
-- Fixed heart reward catalog: amount is an integer from 1 to 4.
local heartRewards = {
  grant_half_red_hearts = { handler = "AddHearts", units = 1, label = "half red heart" },
  grant_full_red_hearts = { handler = "AddHearts", units = 2, label = "full red heart" },
  grant_black_hearts = { handler = "AddBlackHearts", units = 2, label = "black heart" },
  grant_eternal_hearts = { handler = "AddEternalHearts", units = 1, label = "eternal heart" },
  grant_bone_hearts = { handler = "AddBoneHearts", units = 1, label = "bone heart" },
  grant_gold_hearts = { handler = "AddGoldenHearts", units = 1, label = "gold heart" },
  grant_rotten_hearts = { handler = "AddRottenHearts", units = 1, label = "rotten heart" },
  grant_heart_containers = { handler = "AddMaxHearts", units = 2, label = "heart container" },
}
local actions = { spawn_pickup = true, spawn_friendly = true, grant_soul_hearts = true, grant_stat = true,convert_resource=true,activate_aura=true,spawn_creep=true,refill_charge=true }
local deathActions = { grant_stat = true, spawn_pickup = true, refill_charge = true, grant_soul_hearts = true }
combat.resources={coin={read="GetNumCoins",write="AddCoins"},key={read="GetNumKeys",write="AddKeys"},bomb={read="GetNumBombs",write="AddBombs"}}
combat.childProfiles,combat.childCount={},0
for name in pairs(combat.effects) do actions[name]=true end
for name in pairs(heartRewards) do actions[name] = true; deathActions[name] = true end
local function grantHeartReward(player, action)
  if action.type == "grant_soul_hearts" then
    player:AddSoulHearts(action.amount)
    return true
  end
  local reward = heartRewards[action.type]
  if not reward then return false end
  player[reward.handler](player, action.amount * reward.units)
  return true
end
local pickups = { coin = true, key = true, bomb = true, heart = true, pill = true, card = true, battery = true, trinket = true, chest = true, sack = true }
local pickupSubtypes = {coin={penny=1,nickel=2,dime=3,sticky=5,lucky=6,golden=7},key={normal=1,golden=2,charged=4},bomb={normal=1,double=2,troll=3,golden=4,mega=7},heart={full=1,half=2,soul=3,eternal=4,double=5,black=6,gold=7,half_soul=8,blended=10,bone=11,rotten=12}}
local subtypeWeights = {penny=1,nickel=5,dime=10,normal=2,full=2,half=2,soul=8,sticky=1,lucky=4,golden=6,charged=4,double=3,troll=1,mega=6,eternal=5,black=4,gold=3,half_soul=4,blended=4,bone=4,rotten=2}
local friendlies = { attack_fly = true, spider = true, pooter = true, dip = true, minisaac = true }
local friendlySpawn = { attack_fly = { kind = "familiar", type = 3, variant = 43 }, spider = { kind = "familiar", type = 3, variant = 73 }, pooter = { kind = "npc", type = 14 }, dip = { kind = "npc", type = 217 }, minisaac = { kind = "familiar", type = 3, variant = 228 } }
local creepVariants = { red = 46, green = 53, yellow = 32, black = 45 }
local tearFlagsByName = { homing = true, spectral = true, piercing = true, poison = true, burn = true, slow = true, fear = true, charm = true, bounce = true, split = true, orbit = true, glow = true, explosive = true, confusion = true, knockback = true, continuum = true, boomerang = true, grow = true, shrink = true, sticky = true, wiggle = true, slowing_creep = true }
local familiarTypes = { sentry = true, melee = true, normal = true, shield = true, orbit_contact = true }
local rangedFamiliars = { sentry = true, normal = true }
local familiarPatterns = { single = true, fan = true, lob = true, varied = true }
local statBounds = {
  damage = {-1, 15}, tears = {-1, 10}, shot_speed = {-0.3, 1.5}, range = {-5, 20},
  speed = {-0.15, 0.5}, luck = {-1, 10}, soul_hearts = {-4, 4},
}
-- Keep these numbers in step with content-contract/capabilities.json weights.
local qualityBudgets = { [0] = 4, [1] = 8, [2] = 12, [3] = 18, [4] = 24 }
local flagWeights = {
  glow = 6, spectral = 6, bounce = 6, wiggle = 6, poison = 6, burn = 6, slow = 6, fear = 6, charm = 6,
  confusion = 6, split = 6, knockback = 6, grow = 6, shrink = 6, sticky = 6, slowing_creep = 6,
  piercing = 6, orbit = 6, continuum = 6, boomerang = 6, homing = 6, explosive = 6,
}
local pickupWeights = { coin = 1, heart = 2, key = 2, bomb = 2, pill = 2, card = 2, battery = 2, sack = 2, trinket = 3, chest = 3 }
local heartWeights = { grant_half_red_hearts = 2, grant_full_red_hearts = 3, grant_soul_hearts = 8, grant_black_hearts = 4, grant_bone_hearts = 4, grant_eternal_hearts = 5, grant_gold_hearts = 3, grant_rotten_hearts = 2, grant_heart_containers = 8 }
local friendlyWeights = { attack_fly = 2, spider = 2, pooter = 3, dip = 1, minisaac = 4 }
local grantScale = { damage = 1, tears = 1, luck = 1, range = 1, speed = 4, shot_speed = 3 }
local statWeights = {
  damage = { step = 1, weight = 1 }, damage_multiplier = { base = 1, step = 0.1, weight = 1, activation_weight = 1 }, tears = { step = 1, weight = 1 }, shot_speed = { step = 0.1, weight = 3 },
  range = { step = 1, weight = 1 }, speed = { step = 0.1, weight = 4 }, luck = { step = 1, weight = 1 }, soul_hearts = { step = 1, weight = 2 },
}
local systemWeights = { familiar = 4, aura = 6, bomb = 3, laser = 3, knife = 3, tear_update = 6 }

local function allowedKeys(value, keys)
  if type(value) ~= "table" then return false end
  for key in pairs(value) do if not keys[key] then return false end end
  return true
end

local function text(value, minimum, maximum)
  return type(value) == "string" and #value >= minimum and #value <= maximum
end

local function number(value, minimum, maximum, integer)
  return type(value) == "number" and value == value and value >= minimum and value <= maximum and (not integer or value == math.floor(value))
end

local function array(value, minimum, maximum)
  if type(value) ~= "table" or #value < minimum or #value > maximum then return false end
  local count = 0
  for key in pairs(value) do
    if not number(key, 1, #value, true) then return false end
    count = count + 1
  end
  return count == #value
end

local function validFamiliarAttack(attack)
  if not allowedKeys(attack, { pattern = true, flags = true, color = true, scale = true, speed = true }) then return false end
  if not familiarPatterns[attack.pattern] or not array(attack.flags, 0, 3) or not number(attack.scale, 0.5, 2, false) or not number(attack.speed, 4, 12, false) then return false end
  local seen = {}
  for _, flag in ipairs(attack.flags) do
    if not tearFlagsByName[flag] or seen[flag] then return false end
    seen[flag] = true
  end
  if not allowedKeys(attack.color, { r = true, g = true, b = true, a = true }) then return false end
  for _, channel in ipairs({ "r", "g", "b", "a" }) do if not number(attack.color[channel], 0, 1, false) then return false end end
  return true
end

local function marked(profile, name)
  for _, entry in ipairs(profile.systems) do if entry == name then return true end end
  return false
end

local function totalFlagEffects(profile)
  local tear = type(profile.tear_profile) == "table" and profile.tear_profile.flags or nil
  local attack = type(profile.familiar) == "table" and type(profile.familiar.attack) == "table" and profile.familiar.attack.flags or nil
  local bomb = type(profile.bomb) == "table" and profile.bomb.flags or nil
  return (type(tear) == "table" and #tear or 0) + (type(attack) == "table" and #attack or 0) + (type(bomb) == "table" and #bomb or 0)
end

local roomStatNames = { damage = true, tears = true, luck = true, speed = true, range = true, shot_speed = true }
local function validAction(action,trigger,cooldown)
  if type(action)=="table" and combat.expandedCatalog.actions[action.type] then return combat.expandedModule.validate(action,trigger,combat.expandedCatalog) end
  local amountMax = action.type=="refill_charge" and 6 or 4
  if not allowedKeys(action, { type = true, amount = true, pickup_type = true, stat = true, friendly_type = true, duration=true, stack_limit=true, pickup_subtype=true,status=true,radius=true,target_mode=true,input_resource=true,output_resource=true,cost=true,creep=true }) or not actions[action.type] or not number(action.amount, 1, amountMax, true) then return false end
  if trigger=="player_death" and not deathActions[action.type] then return false end
  if action.target_mode~=nil and (action.type~="retaliate" or (action.target_mode~="attacker" and action.target_mode~="nearby")) then return false end
  if action.duration~=nil and ((action.type~="grant_stat" and action.type~="apply_status" and action.type~="activate_aura" and action.type~="spawn_creep") or not number(action.duration,15,1800,true)) then return false end
  if action.stack_limit~=nil and (action.type~="grant_stat" or not number(action.stack_limit,1,4,true)) then return false end
  if action.pickup_subtype~=nil and (action.type~="spawn_pickup" or not (pickupSubtypes[action.pickup_type] or {})[action.pickup_subtype]) then return false end
  if action.type=="convert_resource" then
    if not combat.resources[action.input_resource] or not combat.resources[action.output_resource] or action.input_resource==action.output_resource or not number(action.cost,1,4,true) or not number(cooldown,30,1800,true) then return false end
  elseif action.input_resource~=nil or action.output_resource~=nil or action.cost~=nil then return false end
  if action.type=="activate_aura" and (action.amount~=1 or not number(action.duration,15,1800,true) or not number(cooldown,30,1800,true)) then return false end
  if combat.effects[action.type] then
    if not combat.effects[action.type][trigger] or not number(cooldown,action.type=="apply_status" and 0 or 30,1800,true) or not number(action.amount,1,action.type=="apply_status" and 2 or 3,true) then return false end
    if action.stat~=nil or action.pickup_type~=nil or action.friendly_type~=nil then return false end
    if action.type=="apply_status" then return ({slow=true,burn=true,fear=true,poison=true,charm=true,confusion=true,freeze=true})[action.status]==true and number(action.duration,15,120,true) and action.radius==nil and action.creep==nil end
    if action.status~=nil or action.duration~=nil or action.creep~=nil then return false end
    if action.type=="retaliate" then
      if action.target_mode=="nearby" then return (trigger=="player_hurt" or trigger=="collision") and number(action.radius,40,120,false) end
      return action.radius==nil
    end
    return action.type=="damage_burst" and number(action.radius,40,120,false)
  elseif action.type=="spawn_creep" then
    return creepVariants[action.creep]~=nil and number(action.radius,20,80,false) and number(action.duration,15,180,true) and action.status==nil and action.stat==nil and action.pickup_type==nil and action.friendly_type==nil
  elseif action.status~=nil or action.radius~=nil or action.creep~=nil then return false end
  if action.type == "grant_stat" then return roomStatNames[action.stat] == true and action.pickup_type == nil and action.friendly_type == nil end
  if action.type == "spawn_friendly" then return action.amount == 1 and friendlies[action.friendly_type] == true and action.pickup_type == nil and action.stat == nil end
  if action.type == "spawn_pickup" then return pickups[action.pickup_type] == true and action.stat == nil and action.friendly_type == nil end
  return action.stat == nil and action.pickup_type == nil and action.friendly_type == nil
end
local function statSteps(value, step)
  if not value or value == 0 then return 0 end
  local steps = math.floor(math.abs(value) / step - 1e-9 + 0.5)
  if steps == 0 then steps = 1 end
  return value < 0 and -steps or steps
end
-- Price damage reductions by their equivalent inverse increase. This makes
-- 2.0x cost 11 and 0.5x refund 11, while 0.9x still refunds 2.
local function multiplierWeight(value, spec)
  local base = spec.base or 1
  if value == base then return 0 end
  if value > base then
    local steps = statSteps(value - base, spec.step)
    return steps * spec.weight + (spec.activation_weight or 0)
  end
  local inverseGain = base / value - 1
  local steps = math.floor(inverseGain / spec.step + 0.5)
  if steps < 1 then steps = 1 end
  return -(steps * spec.weight + (spec.activation_weight or 0))
end
local function profileWeight(profile)
  local total = 0
  if profile.active then total=total+2+profile.active.damage+math.ceil(profile.active.radius/60) end
  local tear = type(profile.tear_profile) == "table" and profile.tear_profile.flags or nil
  local attack = type(profile.familiar) == "table" and type(profile.familiar.attack) == "table" and profile.familiar.attack.flags or nil
  local bomb = type(profile.bomb) == "table" and profile.bomb.flags or nil
  for _, list in ipairs({ tear, attack, bomb }) do
    if type(list) == "table" then for _, flag in ipairs(list) do total = total + (flagWeights[flag] or 0) end end
  end
  if type(profile.stats) == "table" then
    for name, spec in pairs(statWeights) do
      local value = profile.stats[name] or spec.base or 0
      if name == "damage_multiplier" then
        total = total + multiplierWeight(value, spec)
      else
        local steps = statSteps(value - (spec.base or 0), spec.step)
        total = total + steps * spec.weight + (steps == 0 and 0 or (steps > 0 and 1 or -1) * (spec.activation_weight or 0))
      end
    end
    if profile.stats.flying then total = total + 8 end
    if profile.stats.explosion_immunity then total = total + 8 end
  end
  for name, weight in pairs(systemWeights) do if marked(profile, name) then total = total + weight end end
  local roomStats = {}
  local function spend(action)
    if type(action) ~= "table" then return end
    if combat.expandedCatalog.actions[action.type] then total=total+combat.expandedModule.weight(action,combat.expandedCatalog)
    elseif action.type == "spawn_pickup" then total = total + (action.pickup_subtype and subtypeWeights[action.pickup_subtype] or pickupWeights[action.pickup_type] or 0) * (action.amount or 1)
    elseif action.type == "spawn_friendly" then total = total + (friendlyWeights[action.friendly_type] or 0) * (action.amount or 1)
    elseif heartWeights[action.type] then total = total + heartWeights[action.type] * (action.amount or 1)
    elseif combat.effects[action.type] then total=total+6+action.amount+math.ceil((action.radius or 0)/60)+math.ceil((action.duration or 0)/60)+(action.type=="retaliate" and action.target_mode=="nearby" and 6 or 0)
    elseif action.type=="convert_resource" then total=total+2+(pickupWeights[action.output_resource] or 0)*action.amount
    elseif action.type=="activate_aura" then total=total+2+math.ceil(action.duration/60)
    elseif action.type=="spawn_creep" then total=total+3+action.amount
    elseif action.type=="refill_charge" then total=total+2+action.amount
    elseif action.type == "grant_stat" then
      local scale = grantScale[action.stat] or 1
      if action.duration~=nil or action.stack_limit~=nil then total=total+action.amount*(action.stack_limit or 1)*scale
      else roomStats[action.stat] = math.max(roomStats[action.stat] or 0, action.amount or 0) end
    end
  end
  for _, rule in ipairs(profile.rules or {}) do for _, action in ipairs(rule.actions or {}) do spend(action) end end
  for _, name in ipairs({ "on_kill", "tear_impact", "collision" }) do
    local proc = profile[name]
    if type(proc) == "table" then for _, action in ipairs(proc.actions or {}) do spend(action) end end
  end
  for stat, amount in pairs(roomStats) do total = total + amount * (grantScale[stat] or 1) end
  return total
end
local function validAura(aura)
  if not allowedKeys(aura, { type=true, damage=true, radius=true, cooldown=true, duration=true,triggered=true }) or not number(aura.radius,50,180,false) or not number(aura.cooldown,15,90,true) then return false end
  if aura.triggered~=nil and type(aura.triggered)~="boolean" then return false end
  if aura.type == "damage" then return number(aura.damage,0.25,2,false) and aura.duration == nil end
  if not ({ slow=true, burn=true, fear=true, charm=true, poison=true, confusion=true })[aura.type] or not number(aura.duration,15,120,true) then return false end
  if aura.type == "burn" or aura.type == "poison" then return number(aura.damage,0.25,2,false) end
  return aura.damage == nil
end
local function validCondition(condition, context, location)
  location=(location or "condition").." ("..tostring(context).."): "
  local definition=type(condition)=="table" and conditionCatalog.conditions[condition.type]
  if not definition then return false,location.."unsupported condition" end
  local compatible=false
  for _,name in ipairs(definition.contexts) do if name==context then compatible=true end end
  if not compatible then return false,location..condition.type.." requires "..table.concat(definition.requires,", ") end
  for parameter in pairs(condition) do
    if parameter~="type" and not definition.params[parameter] then return false,location..parameter.." is unsupported for "..condition.type end
  end
  for parameter,specification in pairs(definition.params) do
    local value=condition[parameter]
    if value~=nil or specification.required then
      local valid=false
      if specification.type=="string" then
        for _,allowed in ipairs(specification.enum) do if value==allowed then valid=true end end
      else valid=number(value,specification.minimum,specification.maximum,specification.type=="integer") end
      if not valid then return false,location..parameter.." is invalid for "..condition.type end
    end
  end
  return true
end
function combat.validCooldown(entry)
  if entry.cooldown==nil then return true end
  local minimum=0
  for _,action in ipairs(entry.actions or {}) do
    if action.type~="apply_status" and action.type~="spawn_creep" and action.type~="spawn_friendly" then minimum=15; break end
  end
  return number(entry.cooldown,minimum,1800,true)
end
local function validProc(proc,name)
  if not allowedKeys(proc, { conditions = true, actions = true, cooldown=true }) or not array(proc.conditions, 0, 2) or not array(proc.actions, 1, 2) then return false end
  if not combat.validCooldown(proc) then return false end
  for index, condition in ipairs(proc.conditions) do
    local valid,reason=validCondition(condition,name,name..".conditions["..index.."]")
    if not valid then return false,reason end
  end
  for _, action in ipairs(proc.actions) do if not validAction(action,name,proc.cooldown) then return false end end
  return true
end

local function validateProfile(profile, id)
  if not text(id,1,100) then return false, "request identity" end
  if not allowedKeys(profile, { active=true, version = true, generated_at = true, bridge_request_id = true, metadata = true, affects_stats = true, systems = true, stats = true, tear_profile = true, visuals = true, rules = true, familiar = true, aura = true, on_kill = true, tear_impact = true, collision = true, tear_update = true, bomb = true, laser = true, knife = true, sprite_sheet = true, familiar_sprite_sheet = true, familiar_animation = true, familiar_animation_sheet = true }) then return false, "profile keys" end
  local slot=text(profile.sprite_sheet,1,256) and tonumber(profile.sprite_sheet:match("^gfx/items/collectibles/generated_slot_(%d+)%.png$")) or nil
  if profile.version ~= 1 or profile.bridge_request_id ~= id or not text(profile.generated_at, 1, 64) or not number(slot,0,GENERATED_ITEM_CAPACITY-1,true) or profile.sprite_sheet~=string.format("gfx/items/collectibles/generated_slot_%02d.png",slot) then return false, "profile identity" end
  local metadata = profile.metadata
  if not allowedKeys(metadata, { display_name = true, description = true, quality = true, theme = true, balance_note = true }) then return false, "metadata keys" end
  if not text(metadata.display_name, 1, 64) then return false, "metadata display name" end
  if not text(metadata.description, 1, 64) then return false, "metadata description" end
  if not number(metadata.quality, 0, 4, true) then return false, "metadata quality" end
  if not ({ cursed = true, angelic = true, tech = true, gross = true, cosmic = true, none = true })[metadata.theme] then return false, "metadata theme" end
  if not text(metadata.balance_note, 0, 256) then return false, "metadata balance note" end
  if not array(profile.systems, 0, 6) or type(profile.affects_stats) ~= "boolean" then return false, "systems" end
  local seenSystem = {}
  for _, name in ipairs(profile.systems) do
    if not systemNames[name] or seenSystem[name] then return false, "systems" end
    seenSystem[name] = true
  end
  if totalFlagEffects(profile) > 3 then return false, "flag budget" end
  if marked(profile,"active") then
    local active=profile.active
    if #profile.systems~=1 or not allowedKeys(active,{effect=true,charges=true,targeting=true,damage=true,radius=true}) or active.effect~="radial_burst" or active.charges~=6 or active.targeting~="self" or not number(active.damage,1,6,false) or not number(active.radius,40,120,false) or not array(profile.rules,0,0) then return false,"active" end
  elseif profile.active~=nil then return false,"active system" end
  if profile.affects_stats ~= marked(profile, "stats") then return false, "affects_stats" end
  if marked(profile, "stats") then
    if not allowedKeys(profile.stats, { damage = true, damage_multiplier = true, tears = true, shot_speed = true, range = true, speed = true, luck = true, soul_hearts = true, flying = true, explosion_immunity = true }) then return false, "stat keys" end
    for name, bounds in pairs(statBounds) do if not number(profile.stats[name], bounds[1], bounds[2], name == "soul_hearts") then return false, "stat " .. name end end
    if profile.stats.damage_multiplier ~= nil and not number(profile.stats.damage_multiplier, 0.5, 2, false) then return false, "damage multiplier" end
    if profile.stats.flying ~= nil and type(profile.stats.flying) ~= "boolean" then return false, "flying" end
    if profile.stats.explosion_immunity ~= nil and type(profile.stats.explosion_immunity) ~= "boolean" then return false, "explosion immunity" end
  elseif profile.stats ~= nil then return false, "stats" end
  local tear = profile.tear_profile
  if marked(profile, "tears") then
    if not allowedKeys(tear, { flags = true, color = true, scale = true }) or not array(tear.flags, 0, 3) or not number(tear.scale, 0.5, 2, false) then return false, "tear profile" end
    for _, flag in ipairs(tear.flags) do if not tearFlagsByName[flag] then return false, "tear flag" end end
    if not allowedKeys(tear.color, { r = true, g = true, b = true, a = true }) then return false, "tear color keys" end
    for _, channel in ipairs({ "r", "g", "b", "a" }) do if not number(tear.color[channel], 0, 1, false) then return false, "tear color" end end
  elseif tear ~= nil then return false, "tear profile" end
  if not allowedKeys(profile.visuals, { pedestal_prompt = true,sound=true,animation=true }) or not text(profile.visuals.pedestal_prompt, 1, 500) or not array(profile.rules, 0, 2) then return false, "visuals or rules" end
  if profile.visuals.sound~=nil and not ({none=true,chime=true,click=true,powerup=true})[profile.visuals.sound] then return false,"presentation sound" end
  if profile.visuals.animation~=nil and not ({none=true,pulse=true})[profile.visuals.animation] then return false,"presentation animation" end
  if marked(profile, "familiar") then
    if profile.familiar == nil then return false, "familiar" end
  elseif profile.familiar ~= nil then return false, "familiar" end
  if profile.familiar~=nil then
    local familiar=profile.familiar
    if not allowedKeys(familiar,{type=true,damage=true,cooldown=true,range=true,sprite_prompt=true,attack=true}) or not familiarTypes[familiar.type] or not number(familiar.damage,0.5,3,false) or not number(familiar.cooldown,15,90,true) or not number(familiar.range,80,320,false) or not text(familiar.sprite_prompt,1,500) then return false,"familiar" end
    if rangedFamiliars[familiar.type] then
      if not validFamiliarAttack(familiar.attack) then return false,"familiar attack" end
    elseif familiar.attack~=nil then return false,"familiar attack" end
    if profile.familiar_sprite_sheet~=string.format("gfx/items/collectibles/generated_familiar_slot_%02d.png",slot) then return false,"familiar sprite" end
    if profile.familiar_animation~=string.format("gfx/familiars/generated_familiar_anim_%02d.anm2",slot) then return false,"familiar animation" end
    if profile.familiar_animation_sheet~=string.format("gfx/familiars/generated_familiar_sheet_%02d.png",slot) then return false,"familiar animation sheet" end
  elseif profile.familiar_sprite_sheet~=nil or profile.familiar_animation~=nil or profile.familiar_animation_sheet~=nil then return false,"unexpected familiar sprite" end
  if marked(profile, "aura") then
    if profile.aura == nil then return false, "aura" end
  elseif profile.aura ~= nil then return false, "aura" end
  if profile.aura~=nil then
    local aura=profile.aura
    if not validAura(aura) then return false,"aura" end
  end
  for _, name in ipairs({ "on_kill", "tear_impact", "collision" }) do
    if marked(profile, name) then
      local valid,reason=validProc(profile[name],name)
      if not valid then return false,reason or name end
    elseif profile[name] ~= nil then return false, name end
  end
  if marked(profile, "tear_update") then
    local update = profile.tear_update
    if not allowedKeys(update, { behavior = true, strength = true }) or not tearUpdateBehaviors[update.behavior] or not number(update.strength, 0.5, 2, false) then return false, "tear_update" end
  elseif profile.tear_update ~= nil then return false, "tear_update" end
  if marked(profile, "bomb") then
    local bomb = profile.bomb
    if not allowedKeys(bomb, { damage = true, radius = true, flags = true }) or not number(bomb.damage, 0.5, 3, false) or not number(bomb.radius, 40, 120, false) then return false, "bomb" end
    if bomb.flags ~= nil then
      if not array(bomb.flags,0,2) then return false, "bomb flags" end
      local seen = {}
      for _, flag in ipairs(bomb.flags) do
        if not ({ poison = true, burn = true, fear = true })[flag] or seen[flag] then return false, "bomb flag" end
        seen[flag] = true
      end
    end
  elseif profile.bomb ~= nil then return false, "bomb" end
  for _, name in ipairs({ "laser", "knife" }) do
    if marked(profile, name) then
      if not allowedKeys(profile[name], { damage = true, color = true }) or not number(profile[name].damage, 0.5, 3, false) then return false, name end
      local color=profile[name].color
      if color~=nil then
        if not allowedKeys(color,{r=true,g=true,b=true,a=true}) then return false,name.." color keys" end
        for _,channel in ipairs({"r","g","b","a"}) do if not number(color[channel],0,1,false) then return false,name.." color" end end
      end
    elseif profile[name] ~= nil then return false, name end
  end
  local sawRule, sawHit = false, false
  for ruleIndex, rule in ipairs(profile.rules) do
    if not allowedKeys(rule, { trigger = true, conditions = true, actions = true, cooldown=true }) or not triggers[rule.trigger] or not array(rule.conditions, 0, 2) or not array(rule.actions, 1, 2) then return false, "rule" end
    if not combat.validCooldown(rule) then return false,"cooldown" end
    if ruleTriggers[rule.trigger] then
      if not marked(profile, "rules") then return false, "rules" end
      sawRule = true
    elseif hitTriggers[rule.trigger] then
      if not marked(profile, "on_hit") then return false, "on_hit" end
      sawHit = true
    else return false, "rule" end
    for index, condition in ipairs(rule.conditions) do
      local valid,reason=validCondition(condition,rule.trigger,"rules["..ruleIndex.."].conditions["..index.."]")
      if not valid then return false,reason end
    end
    for _, action in ipairs(rule.actions) do if not validAction(action,rule.trigger,rule.cooldown) then return false, "action" end end
  end
  if marked(profile, "rules") and not sawRule then return false, "rules" end
  if marked(profile, "on_hit") and not sawHit then return false, "on_hit" end
  local activations=0
  local function countActivations(entry)
    for _,action in ipairs(entry and entry.actions or {}) do if action.type=="activate_aura" then activations=activations+1 end end
  end
  for _,rule in ipairs(profile.rules) do countActivations(rule) end
  for _,name in ipairs({"on_kill","tear_impact","collision"}) do countActivations(profile[name]) end
  if (activations>0 and (not profile.aura or profile.aura.triggered~=true)) or (profile.aura and profile.aura.triggered==true and activations==0) then return false,"aura activation" end
  local budget = qualityBudgets[metadata.quality]
  if budget == nil or profileWeight(profile) > budget then return false, "weight budget" end
  return true
end


local flagWords = {
  homing = "homing", spectral = "spectral", piercing = "piercing", poison = "poison",
  burn = "burning", slow = "slowing", fear = "fear", charm = "charm", bounce = "bouncing",
  split = "splitting", orbit = "orbiting", glow = "glowing", explosive = "explosive", confusion = "confusing", knockback = "knockback",
  continuum = "wrapping", boomerang = "returning", grow = "growing", shrink = "shrinking", sticky = "sticky", wiggle = "wiggling", slowing_creep = "slowing creep",
}
local whenText = {
  room_enter = "when you enter a room", room_clear = "when a room is cleared",
  pickup = "when you pick this up", new_floor = "on a new floor", tear_fire = "when you fire",
  player_hurt = "when you get hit", enemy_hit = "when a tear hits an enemy",
  on_kill = "when an enemy dies", tear_impact = "when a tear hits an enemy",
  collision = "when you touch an enemy",
  bomb_explode = "when a bomb explodes", active_use = "when you use an active",
  pill_use = "when you use a pill", card_use = "when you use a card",
  boss_kill = "when you kill a boss", player_death = "when you die",
}
local function clauseList(parts)
  local cleaned = {}
  for _, part in ipairs(parts) do if part and part ~= "" then cleaned[#cleaned + 1] = part end end
  if #cleaned == 0 then return nil end
  if #cleaned == 1 then return cleaned[1] end
  if #cleaned == 2 then return cleaned[1] .. " and " .. cleaned[2] end
  cleaned[#cleaned] = "and " .. cleaned[#cleaned]
  return table.concat(cleaned, ", ")
end
local function effectSentence(parts, fallback)
  local sentence = clauseList(parts)
  if not sentence or sentence == "" then sentence = fallback or "No extra effect" end
  sentence = sentence:gsub("^%l", string.upper)
  if sentence:sub(-1) ~= "." then sentence = sentence .. "." end
  return sentence
end
local function flagClause(flags, size)
  local words = {}
  for _, name in ipairs(flags or {}) do words[#words + 1] = flagWords[name] or name end
  if #words == 0 then return size ~= "" and (size .. "tears") or nil end
  return (size or "") .. clauseList(words) .. " tears"
end
local function actionPhrase(action, chance)
  local amount = action.amount or 1
  local lead = chance and "sometimes " or ""
  if combat.expandedCatalog.actions[action.type] then return lead..combat.expandedModule.summary(action,combat.expandedCatalog) end
  if action.type=="damage_burst" then return lead.."deals "..amount.." damage in a "..action.radius.." radius (max 8 enemies)" end
  if action.type=="apply_status" then return lead.."applies "..action.status.." for "..action.duration.." frames"..((action.status=="burn" or action.status=="poison") and (" at "..amount.." damage") or "") end
  if action.type=="spawn_creep" then return lead.."spawns "..amount.." player-safe "..(action.creep or "red").." creep ("..(action.creep=="black" and "slows enemies" or "1 contact damage").."; "..(action.radius/40).."x size; "..action.duration.." frames; max 4 per color per owner/item)" end
  if action.type=="refill_charge" then return lead.."refills "..amount.." charge"..(amount==1 and "" or "s") end
  if action.type=="retaliate" then return lead.."retaliates for "..amount.." damage"..(action.target_mode=="nearby" and " within "..action.radius.." radius, max 8 enemies" or " against the attacker") end
  if action.type=="convert_resource" then return lead.."trades "..action.cost.." "..action.input_resource.." for "..amount.." "..action.output_resource end
  if action.type=="activate_aura" then return lead.."activates its aura for "..action.duration.." frames" end
  if action.type == "grant_soul_hearts" then
    return lead .. "grants " .. amount .. " half-soul-heart" .. (amount==1 and "" or "s")
  end
  if action.type == "grant_stat" then
    local duration=action.duration and (" for "..action.duration.." frames or this room") or " for this room"
    local stacks=action.stack_limit and (" (up to "..action.stack_limit.." stacks)") or ""
    return lead .. "grants +" .. amount .. " " .. action.stat .. duration .. stacks
  end
  if action.type == "spawn_friendly" then
    local names = { attack_fly = "blue attack fly", spider = "blue spider", pooter = "pooter", dip = "dip", minisaac = "minisaac" }
    return lead .. "spawns a friendly " .. (names[action.friendly_type] or "enemy") .. " (accumulates; max 32 summons per owner/item, 256 total)"
  end
  local reward = heartRewards[action.type]
  if reward then return lead .. "grants " .. amount .. " " .. reward.label .. (amount == 1 and "" or "s") end
  local word = action.pickup_type or "pickup"
  local noun = amount == 1 and ("a " .. word) or (amount .. " " .. word .. "s")
  return lead .. "drops " .. noun
end
local function timedClause(entry, trigger)
  if not entry then return nil end
  local chance = false
  local requirements={}
  for _, condition in ipairs(entry.conditions or {}) do
    local definition=conditionCatalog.conditions[condition.type]
    if definition and definition.category=="probability" and (condition.chance or 1)<1 then chance=true end
    if definition and definition.summary then
      requirements[#requirements+1]=definition.summary:gsub("{(%w+)}",function(parameter) return tostring(condition[parameter]) end)
    end
  end
  local actions = {}
  for _, action in ipairs(entry.actions or {}) do actions[#actions + 1] = actionPhrase(action, chance) end
  local body = clauseList(actions)
  if not body then return nil end
  return body .. " " .. (whenText[trigger] or "sometimes") .. (#requirements>0 and ("; "..table.concat(requirements,", ")) or "") .. (entry.cooldown and entry.cooldown>0 and ("; "..entry.cooldown.." frame cooldown") or "")
end
function combat.explosionProtected(generated)
  if generated.stats and generated.stats.explosion_immunity==true then return true end
  for _,shot in pairs({generated.tear_profile or {},generated.familiar and generated.familiar.attack or {}}) do
    for _,flag in ipairs(shot.flags or {}) do if flag=="explosive" then return true end end
  end
  return false
end
local function effectSummary(generated)
  if generated.active then return "Use: "..generated.active.damage.." radial damage within "..generated.active.radius.."; max 8 enemies; 6 charges" end
  local parts = {}
  if combat.explosionProtected(generated) then parts[#parts+1]="explosion immunity" end
  local stats = generated.stats
  if generated.affects_stats and stats then
    local up, down = {}, {}
    local labels = {
      { "damage", stats.damage }, { "tears", stats.tears }, { "shot speed", stats.shot_speed },
      { "range", stats.range }, { "speed", stats.speed }, { "luck", stats.luck },
    }
    for _, entry in ipairs(labels) do
      local value = entry[2] or 0
      if value > 0 then up[#up + 1] = entry[1] elseif value < 0 then down[#down + 1] = entry[1] end
    end
    if #up > 0 then parts[#parts + 1] = clauseList(up) .. " up" end
    if #down > 0 then parts[#parts + 1] = clauseList(down) .. " down" end
    if stats.damage_multiplier and stats.damage_multiplier ~= 1 then
      parts[#parts + 1] = "damage x" .. string.format("%.1f", stats.damage_multiplier)
    end
    local hearts = stats.soul_hearts or 0
    if hearts > 0 then parts[#parts + 1] = "grants " .. hearts .. " half-soul-heart" .. (hearts == 1 and "" or "s") end
    if stats.flying == true then parts[#parts + 1] = "grants flight" end
  end
  local tear = generated.tear_profile
  if tear then
    local size = ""
    if (tear.scale or 1) >= 1.15 then size = "larger " elseif (tear.scale or 1) <= 0.85 then size = "smaller " end
    parts[#parts + 1] = flagClause(tear.flags, size)
  end
  for _, rule in ipairs(generated.rules or {}) do parts[#parts + 1] = timedClause(rule, rule.trigger) end
  for _, name in ipairs({ "on_kill", "tear_impact", "collision", "player_hurt" }) do
    parts[#parts + 1] = timedClause(generated[name], name)
  end
  local familiar = generated.familiar
  if familiar then
    if familiar.type == "shield" then parts[#parts + 1] = "a shield familiar blocks a hit"
    elseif familiar.type == "melee" then parts[#parts + 1] = "a melee familiar strikes nearby enemies"
    elseif familiar.type == "orbit_contact" then parts[#parts + 1] = "an orbiting familiar strikes nearby enemies"
    else
      local lead = familiar.type == "sentry" and "an orbiting familiar fires" or "a familiar behind you fires"
      local flags = familiar.attack and familiar.attack.flags or {}
      parts[#parts + 1] = #flags > 0 and (lead .. " " .. flagClause(flags, "")) or (lead .. " tears")
    end
    local targeting=rangedFamiliars[familiar.type] and (familiar.range.." targeting range, max 1 target") or "24 contact radius, max 1 target"
    if familiar.type=="shield" then targeting=targeting.."; 20 projectile intercept radius" end
    parts[#parts]=parts[#parts].." (1 per owner; "..familiar.damage.." base damage; "..familiar.cooldown.." frame cooldown; "..targeting..")"
  end
  if generated.aura then
    local auraText = { damage="nearby enemies take damage", slow="nearby enemies are slowed", burn="nearby enemies burn", fear="nearby enemies flee", charm="nearby enemies are charmed", poison="nearby enemies are poisoned", confusion="nearby enemies are confused" }
    local aura=generated.aura
    local damage=aura.damage and ("; "..aura.damage.." damage") or ""
    local duration=aura.duration and ("; "..aura.duration.." status frames") or ""
    parts[#parts + 1] = auraText[aura.type].." ("..aura.radius.." radius; "..aura.cooldown.." frame cooldown"..damage..duration..(aura.triggered and "; only while activated" or "")..")"
  end
  local updateText = { home = "tears drift toward enemies", pulse = "tears pulse in size", shrink = "tears shrink as they fly", spiral = "tears spiral as they fly", accelerate = "tears speed up as they fly" }
  if generated.tear_update then
    local update=generated.tear_update
    local limits=update.behavior=="home" and "; max 1 target within 240" or "; scale bounded to 0.5-2"
    parts[#parts + 1] = updateText[update.behavior].." (strength "..update.strength.."; combined cap 2"..limits..")"
  end
  if generated.bomb then
    local bomb=generated.bomb
    parts[#parts + 1] = "existing bombs: +"..bomb.damage.." explosion damage; radius at least "..bomb.radius..(#(bomb.flags or {})>0 and ("; "..table.concat(bomb.flags,", ")) or "").." (does not grant bombs)"
  end
  for _,weapon in ipairs({"laser","knife"}) do
    if generated[weapon] then parts[#parts + 1] = "existing "..(weapon=="laser" and "lasers" or "knives")..": +"..generated[weapon].damage.." damage (requires that weapon; does not grant it)" end
  end
  return effectSentence(parts, generated.metadata and generated.metadata.description)
end

local function makeProfile(generated)
  local metadata, stats, tear = generated.metadata, generated.stats or {}, generated.tear_profile
  local tearFlags = 0
  if tear then for _, name in ipairs(tear.flags or {}) do tearFlags = tearFlags | flagFromName(name) end end
  local color = tear and tear.color or {}
  return {
    name = metadata.display_name or "Generated Item",
    description = metadata.description or "",
    quality = metadata.quality,
    systems = generated.systems or {},
    summary = effectSummary(generated),
    spriteSheet = generated.sprite_sheet or "gfx/items/collectibles/generated_item.png",
    tearColor = Color(color.r or 1, color.g or 1, color.b or 1, color.a or 1, 0, 0, 0),
    tearFlag = tearFlags, tearFlagNames = tear and tear.flags or {}, tearScale = tear and tear.scale or 1,
    affectsStats = generated.affects_stats == true,
    explosionImmune = combat.explosionProtected(generated),
    active=generated.active,
    sound=generated.visuals.sound,animation=generated.visuals.animation,
    damage = stats.damage or 0, damageMultiplier = stats.damage_multiplier or 1, fireDelay = -(stats.tears or 0),
    range = stats.range or 0, luck = stats.luck or 0,
    shotSpeed = stats.shot_speed or 0, speed = stats.speed or 0,
    soulHearts = stats.soul_hearts or 0, flying = stats.flying == true, rules = generated.rules or {}, familiar = generated.familiar, aura = generated.aura,
    friendlyToken = generated.bridge_request_id,
    on_kill = generated.on_kill, tear_impact = generated.tear_impact, collision = generated.collision,
    tear_update = generated.tear_update, bomb = generated.bomb, laser = generated.laser, knife = generated.knife,
    familiarSpriteSheet = generated.familiar_sprite_sheet, familiarAnimation = generated.familiar_animation, familiarAnimationSheet = generated.familiar_animation_sheet, familiarEntities = {}, ownedChildren={}, ruleState = {}, cooldowns = {}, auraOwners={},
  }
end

local function applyIdentity(index, profile)
  profile.index=index
  if EID and EID.addCollectible then pcall(EID.addCollectible, EID, ids[index], profile.summary, profile.name) end
  if not Isaac.GetItemConfig then return end
  local ok, config = pcall(Isaac.GetItemConfig)
  if not ok or not config or not config.GetCollectible then return end
  local itemOk, item = pcall(config.GetCollectible, config, ids[index])
  if not itemOk or not item then return end
  pcall(function() item.Name = profile.name end)
  pcall(function() item.Description = profile.summary end)
end
local function queueBanner(profile)
  playProfileSound(profile)
  pendingBanner = { name = profile.name, summary = profile.summary, frame = Game():GetFrameCount() }
  showBanner(profile.name, profile.summary)
end
local function applyTearFlags(tear, profile)
  if not profile or profile.tearFlag == nil or profile.tearFlag == 0 then return end
  if tear.AddTearFlags and profile.tearFlagNames then
    local applied = false
    for _, name in ipairs(profile.tearFlagNames) do
      local flag = flagFromName(name)
      if flag ~= 0 and pcall(tear.AddTearFlags, tear, flag) then applied = true end
    end
    if applied then return end
  end
  pcall(function() tear.TearFlags = (tear.TearFlags or 0) | profile.tearFlag end)
end

local members = { stats = {}, tears = {}, rules = {}, familiar = {}, aura = {}, on_hit = {}, on_kill = {}, tear_impact = {}, collision = {}, tear_update = {}, bomb = {}, laser = {}, knife = {} }
local byTrigger = {}
local function rebuildSystems()
  for name in pairs(members) do members[name] = {} end
  byTrigger = {}
  local seen = {}
  for index, record in ipairs(records) do
    local listed = {}
    for _, name in ipairs(record.systems or {}) do
      if members[name] and not listed[name] then
        listed[name] = true
        members[name][#members[name] + 1] = index
      end
    end
    for _, rule in ipairs(record.rules or {}) do
      local key = rule.trigger .. ":" .. index
      if not seen[key] then
        seen[key] = true
        local bucket = byTrigger[rule.trigger]
        if not bucket then bucket = {}; byTrigger[rule.trigger] = bucket end
        bucket[#bucket + 1] = index
      end
    end
  end
end
local function owned(player,index)
  return player and ids[index]>0 and player:HasCollectible(ids[index])
end
local function eachOwned(list, player, visit)
  if not list or #list == 0 then return end
  for _, index in ipairs(list) do if owned(player, index) then visit(index, runtime[index]) end end
end
combat.expandedEffects=combat.expandedModule.new({
  frame=function() return Game():GetFrameCount() end,
  owns=function(source,player)
    local index=tonumber(source)
    if not running or blocked or not index or not runtime[index] or not owned(player,index) then return false end
    for playerIndex=0,Game():GetNumPlayers()-1 do if Isaac.GetPlayer(playerIndex)==player then return true end end
    return false
  end,
  vector=function(horizontal,vertical) return Vector(horizontal,vertical) end,
  entityRef=function(player) return EntityRef(player) end,
  spawn=function(entityType,variant,subtype,position,velocity,spawner)
    return Game():Spawn(entityType,variant,position,velocity,spawner,subtype,math.max(1,Random()))
  end,
  enums={tear=EntityType.ENTITY_TEAR,blueTear=TearVariant.BLUE,pooter=EntityType.ENTITY_POOTER,primarySlot=ActiveSlot and ActiveSlot.SLOT_PRIMARY or 0,
    friendly=EntityFlag and EntityFlag.FLAG_FRIENDLY,charm=EntityFlag and EntityFlag.FLAG_CHARM},
  isEnemy=function(entity)
    if not entity or not entity.ToNPC or not entity:ToNPC() or not entity.IsVulnerableEnemy or not entity:IsVulnerableEnemy() then return false end
    if not EntityFlag or not EntityFlag.FLAG_FRIENDLY or not entity.HasEntityFlags then return false end
    if entity:HasEntityFlags(EntityFlag.FLAG_FRIENDLY) then return false end
    return not EntityFlag.FLAG_CHARM or not entity:HasEntityFlags(EntityFlag.FLAG_CHARM)
  end,
  projectiles=function() return Isaac.FindByType(EntityType.ENTITY_PROJECTILE) end,
  isHostileProjectile=function(entity)
    if not entity or entity.Type~=EntityType.ENTITY_PROJECTILE or not ProjectileFlags or not ProjectileFlags.CANT_HIT_PLAYER or not entity.HasProjectileFlags then return false end
    if entity:HasProjectileFlags(ProjectileFlags.CANT_HIT_PLAYER) or combat.expandedEffects:suppressed(entity,true) or combat.owner(entity,true) then return false end
    local spawner=entity.SpawnerEntity or entity.Parent
    if spawner and spawner.ToNPC and spawner:ToNPC() then
      if not EntityFlag or not EntityFlag.FLAG_FRIENDLY or not spawner.HasEntityFlags then return false end
      if spawner:HasEntityFlags(EntityFlag.FLAG_FRIENDLY) or (EntityFlag.FLAG_CHARM and spawner:HasEntityFlags(EntityFlag.FLAG_CHARM)) then return false end
    end
    return true
  end,
  chargeLimit=function(item)
    if not ChargeType or ChargeType.NORMAL==nil or not ItemType or not ItemType.ITEM_ACTIVE or not Isaac.GetItemConfig then return nil end
    local config=Isaac.GetItemConfig():GetCollectible(item)
    if config and config.Type==ItemType.ITEM_ACTIVE and config.ChargeType==ChargeType.NORMAL then return config.MaxCharges end
  end,
  withGuard=function(callback)
    combat.depth=combat.depth+1
    local ok,result=pcall(callback)
    combat.depth=combat.depth-1
    if not ok then error(result) end
    return result
  end,
},combat.expandedCatalog)
function combat.expandedEvent(action,player,event)
  local normalized={}
  for key,value in pairs(event or {}) do normalized[key]=value end
  normalized.owner=normalized.owner or player
  if normalized.trigger=="active_use" then
    local getter=action.type=="dash" and player.GetMovementInput or player.GetShootingInput
    normalized.velocity=getter and getter(player) or nil
  end
  return normalized
end
function combat.nativeSecondary(entity,creepOnly)
  if not combat.nativeSecondaryActive then return false end
  local seen={}
  local function secondary(candidate,depth)
    if not candidate or depth>=8 or seen[candidate] then return false end
    seen[candidate]=true
    local data=candidate.GetData and candidate:GetData()
    if data and (data.nebiusCreep or (not creepOnly and data.nebiusFriendlyItem)) then return true end
    return secondary(candidate.SpawnerEntity,depth+1) or secondary(candidate.Parent,depth+1)
  end
  return secondary(entity,0)
end
function combat.secondary(entity)
  return (combat.expandedActive and combat.expandedEffects:suppressed(entity)) or combat.nativeSecondary(entity)
end
local function pruneRoomStats()
  if #roomStatGrants==0 then return end
  local players,changed={},{}
  for playerIndex=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(playerIndex)
    players[tostring(player.InitSeed)]=player
  end
  for grantIndex=#roomStatGrants,1,-1 do
    local grant=roomStatGrants[grantIndex]
    local player=players[grant.player]
    if not player or not owned(player,grant.index) or (grant.expires and Game():GetFrameCount()>=grant.expires) then
      if player then changed[grant.player]=player end
      table.remove(roomStatGrants,grantIndex)
    end
  end
  for _,player in pairs(changed) do refreshStats(player) end
end
local function saveRun()
  if blocked then return false end
  if not selectedSaveSlot then blocked="Save-slot identity unavailable. Select a save slot and fully restart Isaac."; return false end
  local states={}
  for index,profile in ipairs(runtime) do states[index]=profile.ruleState end
  local ok,err=pcall(function()
    for id,receipt in pairs(creator.deliveries) do
      if receipt.phase=="settled" then creator.deliveries[id]=nil end
      if receipt.phase=="committed" then
        local blanks,shells,active=creator.inventory(creator.player(receipt.owner),receipt)
        if blanks==nil then error("Delivery inventory unavailable") end
        receipt.witnessBlank,receipt.witnessShell,receipt.witnessActive=blanks,shells,active
      end
    end
    local saved = {version=3,records=records,ruleStates=states,cooldowns={},expandedCooldowns=combat.expandedEffects:snapshot(),runId=runToken,saveSlot=selectedSaveSlot,creator=creator.snapshot(),settings=creator.settings}
    for index,profile in ipairs(runtime) do
      local cooldowns={}
      for key,ready in pairs(profile.cooldowns) do
        local remaining=ready-Game():GetFrameCount()
        if remaining>0 then cooldowns[key]=remaining end
      end
      saved.cooldowns[index]=cooldowns
    end
    local grants={}
    for _,grant in ipairs(roomStatGrants) do
      local copy={}
      for key,value in pairs(grant) do if key~="expires" then copy[key]=value end end
      if grant.expires then copy.remaining=math.max(0,grant.expires-Game():GetFrameCount()) end
      grants[#grants+1]=copy
    end
    if #grants > 0 then saved.roomStats = {room=roomStamp(),grants=grants} end
    Demo:SaveData(bridgeJson.encode(saved))
  end)
  if ok then for _,receipt in pairs(creator.deliveries) do if receipt.phase=="committed" then receipt.phase="settled" end end end
  if not ok then blocked="Could not save generated items: "..tostring(err); showStatus(blocked) end
  return ok
end
promptUi.prepareRequest=function(id,data)
  local player=creator.player(creator.owner)
  if creator.count(player)>0 then
    for _ in pairs(creator.requests) do return false,"A blank item request is already pending." end
    creator.requests[id]={mode="blank",owner=tostring(player.InitSeed),itemType=data.item_type or "passive"}
    data.delivery={mode="blank",owner=tostring(player.InitSeed)}
  end
  return true
end
promptUi.persist=function() if running then return saveRun() end return true end
promptUi.requestFailed=function(id) creator.cancelled[id]=true; creator.requests[id]=nil; if running then saveRun() end end
promptUi.getHotkey=function() return creator.settings.hotkey end
promptUi.getItems=function()
  local ledger=combat.powerLedger.details(combat.powerRecords())
  for index,profile in ipairs(runtime) do
    local entry=ledger.entries[index]
    local details={}
    for _,key in ipairs(entry and entry.power_keys or {}) do details[#details+1]=key.." x"..tostring(ledger.power_usage[key]) end
    profile.powerSummary=(#details>0 and table.concat(details,", ") or "no distinctive power").."; #"..tostring(index).." "..tostring(entry and entry.source or "unknown")
  end
  return runtime
end
promptUi.selectOwner=function(player)
  if promptUi.open or promptUi.pending or next(creator.requests) then
    local owner=creator.player(creator.owner); if owner then creator.handoff(owner) end
    return
  end
  if player then creator.handoff(player) end
  if not creator.owner then
    for p=0,Game():GetNumPlayers()-1 do local candidate=Isaac.GetPlayer(p); if creator.count(candidate)>0 then creator.handoff(candidate); break end end
  end
  local owner=creator.player(creator.owner); if owner then creator.handoff(owner) end
end
local function capacity()
  if blocked then return blocked end
  if not running then return "Start or continue a run before generating." end
  if not selectedSaveSlot then return "Save-slot identity unavailable. Select a save slot and fully restart Isaac." end
  if #records>=GENERATED_ITEM_CAPACITY then return "Item limit reached: "..GENERATED_ITEM_CAPACITY.."/"..GENERATED_ITEM_CAPACITY..". Finish this run to free item slots." end
  local count=0
  for _ in pairs(usedArt) do count=count+1 end
  if count>=GENERATED_ITEM_CAPACITY then return "Artwork limit reached: "..GENERATED_ITEM_CAPACITY.."/"..GENERATED_ITEM_CAPACITY..". Restart Isaac; continued-run artwork stays reserved." end
  for _,id in ipairs(ids) do if id<=0 then return "Generated IDs missing. Install updated mod and restart Isaac." end end
end
local function context()
  local slots={}
  for slot=0,GENERATED_ITEM_CAPACITY-1 do if usedArt[slot] then slots[#slots+1]=slot end end
  local runSlots={}
  for _,record in ipairs(records) do runSlots[#runSlots+1]=tonumber(record.sprite_sheet:match("generated_slot_(%d+)")) end
  local pending={}
  local activeCount,activeAvailable=0,true
  for _,record in ipairs(records) do if record.active then activeCount=activeCount+1 end end
  for _,id in ipairs(creator.activeIds) do if id<=0 then activeAvailable=false end end
  if promptUi.pendingKind=="generate" then pending[#pending+1]=promptUi.pending end
  for id in pairs(creator.requests) do if id~=promptUi.pending then pending[#pending+1]=id end end
  return {session=session,run=runToken,used=slots,run_used=runSlots,count=#records,blocked=capacity(),runtime_contract=18,power_ledger=combat.powerLedger.snapshot(combat.powerRecords()),save_slot=selectedSaveSlot,fresh_run=freshRun,ended_run=endedRun,pending=pending,blanks=creator.count(creator.player(creator.owner)),active_count=activeCount,active_available=activeAvailable,art_count=creator.globalArtUsed}
end
promptUi.getContext=context
local function publishState()
  if not running then return end
  Isaac.DebugString("[NebiusBridge] state "..bridgeJson.encode(context()))
  lastStateTime=Isaac.GetTime()
end
function creator.startGenerator(player, quality, itemType, collectible)
  if not running or blocked or not player or creator.generatorIds[quality]~=collectible then return end
  if itemType~="passive" and itemType~="active" then itemType="passive" end
  if promptUi.pending or next(creator.requests) then
    if #creator.generatorQueue>=16 then showStatus("Generator queue is full."); return end
    creator.generatorQueue[#creator.generatorQueue+1]={owner=tostring(player.InitSeed),quality=quality,itemType=itemType,collectible=collectible}
    saveRun()
    return
  end
  creator.handoff(player)
  promptUi.sequence=(promptUi.sequence or 0)+1
  local owner=tostring(player.InitSeed)
  local id=tostring(runToken).."_"..tostring(Random()).."_"..tostring(promptUi.sequence)
  creator.requests[id]={mode="generator",owner=owner,itemType=itemType,quality=quality,collectible=collectible}
  promptUi.pending,promptUi.pendingKind,promptUi.started=id,"generate",Isaac.GetTime()
  promptUi.phase,promptUi.status,promptUi.quality,promptUi.itemType,promptUi.suppressOpen="generating","Inventing an idea...",quality,itemType,true
  promptUi.requested=false
  if not saveRun() then
    creator.requests[id]=nil
    promptUi.pending,promptUi.pendingKind,promptUi.suppressOpen=nil,nil,false
    return
  end
  local payload={id=id,auto=true,quality=quality,item_type=itemType,delivery={mode="generator",owner=owner,quality=quality}}
  publishState()
  Isaac.DebugString("[NebiusBridge] generate "..bridgeJson.encode(payload))
end
function creator.serviceGenerators()
  if not running or blocked or promptUi.pending or next(creator.requests) or #creator.generatorQueue==0 then return end
  local nextRequest=table.remove(creator.generatorQueue,1)
  local player=creator.player(nextRequest.owner)
  if not player or not player.GetCollectibleNum or player:GetCollectibleNum(nextRequest.collectible)<1 then saveRun(); return end
  creator.startGenerator(player,nextRequest.quality,nextRequest.itemType,nextRequest.collectible)
end
local function reject(id,message)
  if text(id,1,100) then Isaac.DebugString("[NebiusBridge] rejected "..bridgeJson.encode({id=id,reason=tostring(message):sub(1,500)})) end
  promptUi:receive(id,"error",message); showStatus(message)
end
local function pollNativeProfile(allowApply)
  if not running or type(NebiusBridge)~="table" then return end
  local envelope=pendingProfileEnvelope
  if envelope then
    if not allowApply then return end
    pendingProfileEnvelope=nil
  else
    if Isaac.GetTime()-lastPollTime<33 then return end
    lastPollTime=Isaac.GetTime()
    local ok,raw=pcall(NebiusBridge.Poll)
    if not ok or not raw then return end
    local decoded
    ok,decoded=pcall(bridgeJson.decode,raw)
    if not ok or type(decoded)~="table" then return end
    envelope=decoded
  end
  if envelope.type=="hello" then return end
  if envelope.type=="status" then
    if envelope.status=="capacity" and envelope.id==runToken.."_capacity" and number(tonumber(envelope.detail),0,GENERATED_ITEM_CAPACITY,true) then creator.globalArtUsed=tonumber(envelope.detail); return end
    if envelope.status=="error" and creator.requests[envelope.id] then
      local request=creator.requests[envelope.id]
      creator.cancelled[envelope.id]=true; creator.requests[envelope.id]=nil; saveRun()
      if request.mode=="generator" then
        if promptUi.pending==envelope.id then
          promptUi.pending,promptUi.pendingKind,promptUi.suppressOpen,promptUi.requested=nil,nil,false,false
          promptUi.phase,promptUi.status="editing","Generator kept."
        end
        pcall(NebiusBridge.Ack,envelope.id)
        return
      end
    end
    if text(envelope.id,1,100) and text(envelope.detail,1,500) then promptUi:receive(envelope.id,envelope.status,envelope.detail,envelope.error_code) end
    if envelope.status=="error" and text(envelope.id,1,100) then pcall(NebiusBridge.Ack,envelope.id) end
    return
  end
  if not allowedKeys(envelope,{version=true,type=true,id=true,profile=true,delivery=true}) or envelope.version~=1 or envelope.type~="profile" or not text(envelope.id,1,100) then return end
  if creator.recoveryBlocked then reject(envelope.id,blocked); return end
  if creator.cancelled[envelope.id] then reject(envelope.id,"Request was cancelled locally."); return end
  if accepted[envelope.id] then pcall(NebiusBridge.Ack,envelope.id); return end
  if envelope.id:sub(1,#runToken+1)~=runToken.."_" then reject(envelope.id,"Rejected item from another run."); return end
  local valid,reason=validateProfile(envelope.profile, envelope.id)
  if not valid then reject(envelope.id,"Profile rejected: "..reason); return end
  if not allowApply then pendingProfileEnvelope=envelope; return end
  local full=capacity()
  if full then reject(envelope.id,full); return end
  local slot=tonumber(envelope.profile.sprite_sheet:match("generated_slot_(%d+)"))
  if not slot or slot>=GENERATED_ITEM_CAPACITY or usedArt[slot] then reject(envelope.id,"Artwork slot invalid or reserved."); return end
  local index=#records+1
  if not creator.assignShell(index,envelope.profile) then reject(envelope.id,"Active shell limit reached ("..GENERATED_ACTIVE_CAPACITY.."), or generated shell missing."); return end
  local player=Isaac.GetPlayer(0)
  local request=creator.requests[envelope.id]
  local activeSlot=0
  local token=creator.blank
  if envelope.delivery or request then
    if request and request.mode=="generator" then
      if not allowedKeys(envelope.delivery,{mode=true,owner=true,quality=true}) or envelope.delivery.mode~="generator" or envelope.delivery.owner~=request.owner or envelope.delivery.quality~=request.quality or request.collectible~=creator.generatorIds[request.quality] then reject(envelope.id,"Generator request identity mismatch."); return end
      token=request.collectible
    elseif request and request.mode=="singularity" then
      if not allowedKeys(envelope.delivery,{mode=true,owner=true,quality=true}) or envelope.delivery.mode~="singularity" or envelope.delivery.owner~=request.owner or envelope.delivery.quality~=request.quality or envelope.profile.active~=nil then reject(envelope.id,"Singularity request identity mismatch."); return end
    elseif not request or not allowedKeys(envelope.delivery,{mode=true,owner=true}) or envelope.delivery.mode~="blank" or envelope.delivery.owner~=request.owner then reject(envelope.id,"Blank request identity mismatch."); return end
    if request.mode~="singularity" and (envelope.profile.active~=nil)~=((request.itemType or "passive")=="active") then reject(envelope.id,"Item type differs from the saved request."); return end
    player=creator.player(request.owner)
    local held=player and player.GetCollectibleNum and player:GetCollectibleNum(token) or 0
    if request.mode=="singularity" then
      if not player or not player.AddCollectible then reject(envelope.id,"The Singularity owner is unavailable."); return end
    elseif held<1 or not player.AddCollectible or not player.RemoveCollectible then reject(envelope.id,request.mode=="generator" and "The requesting player needs their Generator." or "The requesting player needs their AI Item."); return end
    if envelope.profile.active then
      if not player.GetActiveItem then reject(envelope.id,"Active inventory is unavailable."); return end
      if player:GetActiveItem(0)~=0 then
        if CollectibleType and CollectibleType.COLLECTIBLE_SCHOOLBAG and player:HasCollectible(CollectibleType.COLLECTIBLE_SCHOOLBAG) and player:GetActiveItem(1)==0 then activeSlot=1
        else reject(envelope.id,"Free an active slot before requesting an active AI Item."); return end
      end
    end
  end
  local pickup
  if not request then
    local position=Game():GetRoom():FindFreePickupSpawnPosition(player.Position+Vector(80,0),0,true)
    local entity=Isaac.Spawn(EntityType.ENTITY_PICKUP,PickupVariant.PICKUP_COLLECTIBLE,ids[index],position,Vector.Zero,nil)
    pickup=entity and entity:ToPickup()
    if not pickup then reject(envelope.id,"Could not spawn item."); return end
  end
  records[index],runtime[index]=envelope.profile,makeProfile(envelope.profile)
  applyIdentity(index, runtime[index])
  rebuildSystems()
  usedArt[slot]=true
  if request then
    local before=player:GetCollectibleNum(token)
    local generatedBefore=player:GetCollectibleNum(ids[index])
    local label=request.mode=="generator" and "Generator" or request.mode=="singularity" and "Singularity Terminal" or "AI Item"
    local singularity=request.mode=="singularity"
    local receipt={phase="prepared",owner=request.owner,index=index,shell=ids[index],slot=activeSlot,active=envelope.profile.active~=nil,collectible=token,beforeBlank=before,afterBlank=singularity and before or before-1,beforeShell=generatedBefore,afterShell=generatedBefore+1,beforeActive=envelope.profile.active and player:GetActiveItem(activeSlot) or 0,witnessBlank=before,witnessShell=generatedBefore,witnessActive=envelope.profile.active and player:GetActiveItem(activeSlot) or 0}
    creator.deliveries[envelope.id]=receipt
    if not saveRun() then
      creator.deliveries[envelope.id]=nil
      records[index],runtime[index],usedArt[slot]=nil,nil,nil; rebuildSystems()
      reject(envelope.id,blocked); return
    end
    creator.exchanging=true
    local ok=pcall(function() if not singularity then player:RemoveCollectible(token) end; player:AddCollectible(ids[index],0,true,activeSlot) end)
    creator.exchanging=false
    if not ok or player:GetCollectibleNum(token)~=receipt.afterBlank or player:GetCollectibleNum(ids[index])~=generatedBefore+1 or (envelope.profile.active and player:GetActiveItem(activeSlot)~=ids[index]) then
      creator.exchanging=true
      if player:GetCollectibleNum(ids[index])>generatedBefore then pcall(player.RemoveCollectible,player,ids[index]) end
      if not singularity and player:GetCollectibleNum(token)<before then pcall(player.AddCollectible,player,token,0,false) end
      creator.exchanging=false
      if player:GetCollectibleNum(token)~=before or player:GetCollectibleNum(ids[index])~=generatedBefore or (receipt.active and player:GetActiveItem(activeSlot)~=receipt.beforeActive) then
        blocked=label.." exchange rollback is ambiguous. Continue with the saved transaction before retrying."; creator.recoveryBlocked=true
        reject(envelope.id,blocked); return
      end
      creator.deliveries[envelope.id]=nil
      records[index],runtime[index],usedArt[slot]=nil,nil,nil; rebuildSystems()
      saveRun()
      reject(envelope.id,"Could not exchange the "..label..". Retry after checking inventory."); return
    end
    receipt.phase="committed"
    creator.requests[envelope.id]=nil
    creator.noticed[request.owner]=0
    if request.mode=="generator" then promptUi.suppressOpen,promptUi.requested=false,false end
  end
  if not saveRun() then
    if pickup and pickup.Remove then pickup:Remove() end
    if request then creator.exchanging=true; player:RemoveCollectible(ids[index]); player:AddCollectible(token,0,false); creator.exchanging=false; creator.requests[envelope.id]=request; creator.deliveries[envelope.id]=nil end
    records[index],runtime[index],usedArt[slot]=nil,nil,nil; rebuildSystems(); refreshStats(player)
    reject(envelope.id,blocked); return
  end
  accepted[envelope.id]=true
  promptUi.details=runtime[index].name..": "..runtime[index].summary
  if request then Demo:onPostAddCollectible(ids[index],nil,true,nil,nil,player) end
  promptUi:receive(envelope.id,"accepted","Accepted: "..runtime[index].name.." ("..#records.."/"..GENERATED_ITEM_CAPACITY..")")
  local ackOk,queued=pcall(NebiusBridge.Ack,envelope.id)
  Isaac.DebugString("[Live Sprite Swap Demo] PROFILE ACCEPTED: "..runtime[index].name.."; "..(ackOk and queued and "ACK queued" or "ACK unavailable"))
  publishState()
end
local function restoreRoomStats(saved)
  if saved == nil then return true end
  if not allowedKeys(saved,{room=true,grants=true}) or not text(saved.room,1,100) or not array(saved.grants,0,1536) then return false end
  local seen = {}
  for _, grant in ipairs(saved.grants) do
    if not allowedKeys(grant,{index=true,player=true,stat=true,amount=true,effect=true,remaining=true}) or not number(grant.index,1,#records,true) or not text(grant.player,1,40) or not roomStatNames[grant.stat] or not number(grant.amount,1,16,true) then return false end
    if grant.effect~=nil and not text(grant.effect,1,40) then return false end
    local key=grant.index .. ":" .. grant.player .. ":" .. grant.stat .. ":" .. (grant.effect or "legacy")
    if seen[key] then return false end
    seen[key]=true
    -- A saved bonus must correspond to an action on its item.
    local record=records[grant.index]
    local matches=false
    local function check(entry,prefix)
      for actionIndex, action in ipairs(entry and entry.actions or {}) do
        local effect=(action.duration~=nil or action.stack_limit~=nil) and (prefix..":"..actionIndex) or nil
        if action.type=="grant_stat" and action.stat==grant.stat and effect==grant.effect and grant.amount>=action.amount and grant.amount<=action.amount*(action.stack_limit or 1) and grant.amount%action.amount==0 then
          if action.duration then matches=number(grant.remaining,0,action.duration,true)
          else matches=grant.remaining==nil end
        end
      end
    end
    for ruleIndex, rule in ipairs(record.rules) do check(rule,"rule:"..ruleIndex) end
    for _,name in ipairs({"on_kill","tear_impact","collision"}) do check(record[name],name) end
    if not matches then return false end
    if grant.remaining~=nil then grant.expires=Game():GetFrameCount()+grant.remaining; grant.remaining=nil end
  end
  if saved.room==roomStamp() then roomStatGrants=saved.grants end
  return true
end
function Demo:onGameStarted(isContinued)
  if combat.pickupCapture then combat.pickupCapture:stop("game_started") end
  combat.expandedEffects:cleanup()
  combat.expandedActive=false
  combat.nativeSecondaryActive=false
  for index,id in ipairs(ids) do slotById[id]=nil; ids[index]=creator.passiveIds[index]; slotById[ids[index]]=index end
  combat.childProfiles,combat.childCount={},0
  freshRun,endedRun=not isContinued,false
  records,runtime,accepted={},{},{}
  roomStatGrants={}
  promptUi:reset()
  creator.requests,creator.cancelled,creator.deliveries,creator.noticed,creator.replacements,creator.generatorQueue,creator.touch,creator.owner={},{},{},{},{},{},{},nil
  creator.recoveryBlocked=false
  if self:HasData() then
    local ok,prior=pcall(function() return bridgeJson.decode(self:LoadData()) end)
    if ok and type(prior)=="table" and type(prior.settings)=="table" then
      local settings=prior.settings
      if type(settings.hotkey)=="string" and Keyboard[settings.hotkey] then creator.settings.hotkey=settings.hotkey end
      creator.settings.replacePassives=settings.replacePassives==true
    end
  end
  pendingProfileEnvelope,blocked,pendingBanner,pendingStatPlayer=nil,nil,nil,nil
  serial=serial+1; runToken=session.."_"..serial; running=true
  if isContinued then
    local ok,saved=pcall(function()
      if not self:HasData() then error("Missing save") end
      return bridgeJson.decode(self:LoadData())
    end)
    if not ok or type(saved)~="table" or (saved.version~=2 and saved.version~=3) or not array(saved.records,0,GENERATED_ITEM_CAPACITY) or type(saved.ruleStates)~="table" or (saved.version==3 and type(saved.cooldowns)~="table") then
      blocked="Generated-item save missing or invalid. Generation blocked to protect this run."
    else
      if saved.saveSlot~=nil and saved.saveSlot~=selectedSaveSlot then blocked="Generated-item save belongs to another save slot." end
      if not creator.restore(saved.creator,saved.runId) then blocked="Invalid saved creator state." end
      if saved.runId~=nil then
        if text(saved.runId,1,80) and saved.runId:match("^[%w_-]+$") then runToken=saved.runId
        else blocked="Invalid saved run identity." end
      end
      local restored={}
      for index,record in ipairs(saved.records) do
        local valid,reason=false,"record must be a table"
        if type(record)=="table" then valid,reason=validateProfile(record,record.bridge_request_id) end
        if not valid then
          local identity=type(record)=="table" and tostring(record.bridge_request_id) or "unknown"
          local diagnostic="Saved generated item #"..index.." ["..identity.."] rejected: "..tostring(reason)
          Isaac.DebugString("[Live Sprite Swap Demo] "..diagnostic)
          blocked="Saved generated item #"..index.." is incompatible. Generation blocked; see log. Original save preserved."
          break
        end
        local slot=valid and tonumber(record.sprite_sheet:match("generated_slot_(%d+)"))
        local state=saved.ruleStates[index] or {}
        if not valid or not slot or slot>=GENERATED_ITEM_CAPACITY or restored[slot] or type(state)~="table" then blocked="Invalid generated-item save."; break end
        for key,value in pairs(state) do if not text(key,1,200) or value~=true then blocked="Invalid saved rule state."; break end end
        if blocked then break end
        restored[slot],usedArt[slot]=true,true
        records[index],runtime[index]=record,makeProfile(record)
        if not creator.assignShell(index,record) then blocked="Saved active shell unavailable."; break end
        runtime[index].ruleState=state; accepted[record.bridge_request_id]=true
        local cooldowns=saved.cooldowns and saved.cooldowns[index] or {}
        if type(cooldowns)~="table" then blocked="Invalid saved cooldowns."; break end
        local count=0
        for key,remaining in pairs(cooldowns) do
          count=count+1
          if count>256 or not text(key,1,100) or not number(remaining,1,1800,true) then blocked="Invalid saved cooldowns."; break end
          runtime[index].cooldowns[key]=Game():GetFrameCount()+remaining
          if key:sub(1,5)=="aura:" then runtime[index].auraOwners[key:sub(6)]=true end
        end
        if blocked then break end
        applyIdentity(index, runtime[index])
      end
      if not blocked and not restoreRoomStats(saved.roomStats) then blocked="Invalid saved room stats." end
      if not blocked then
        local expanded=saved.expandedCooldowns
        if expanded==nil then expanded={} end
        if not combat.expandedEffects:restore(expanded,function(seed) return creator.player(tostring(seed)) end) then blocked="Invalid saved expanded-effect cooldowns. Original save preserved." end
      end
    end
  else saveRun() end
  if not blocked and isContinued and not creator.reconcile() then creator.recoveryBlocked=true; blocked="Delivery inventory does not match the saved receipt. Generation blocked; restore matching engine/mod saves before continuing. No items granted." end
  if not blocked and isContinued then
    if promptUi.pending and accepted[promptUi.pending] then promptUi:receive(promptUi.pending,"accepted","Item already applied.") end
    saveRun()
  end
  if blocked then
    combat.expandedEffects:cleanup()
    if not creator.recoveryBlocked then records,runtime,accepted={},{},{}; roomStatGrants={} end
    showStatus(blocked)
  end
  rebuildSystems()
  for p=0,Game():GetNumPlayers()-1 do refreshStats(Isaac.GetPlayer(p)) end
  if freshRun and creator.singularity>0 then
    for p=0,Game():GetNumPlayers()-1 do
      local player=Isaac.GetPlayer(p)
      if creator.isAIsaac(player) and player.GetActiveItem and player.AddCollectible and player:GetActiveItem(0)~=creator.singularity then
        pcall(player.AddCollectible,player,creator.singularity,12,true,0)
      end
      if creator.isAIsaac(player) and player.GetActiveItem and player.SetActiveCharge and player:GetActiveItem(0)==creator.singularity then
        player:SetActiveCharge(12,0)
        Isaac.DebugString("[Live Sprite Swap Demo] granted fully charged Singularity Terminal to AIsaac")
      end
    end
  elseif freshRun then
    Isaac.DebugString("[Live Sprite Swap Demo] Singularity Terminal ID is unavailable; restart Isaac after syncing items.xml")
  end
  local owner=creator.player(creator.owner); if owner then creator.handoff(owner) end
  for playerIndex=0,Game():GetNumPlayers()-1 do creator.applyAIsaac(Isaac.GetPlayer(playerIndex)) end
  creator.serviceBlanks()
  creator.serviceGenerators()
  publishState()
end
function Demo:onPreGameExit(shouldSave)
  if combat.pickupCapture then combat.pickupCapture:stop("game_exit") end
  if shouldSave and running then saveRun() end
  combat.expandedEffects:cleanup()
  endedRun=not shouldSave and running or false
  running=false; pendingProfileEnvelope=nil
  promptUi:reset()
  Isaac.DebugString("[NebiusBridge] state "..bridgeJson.encode(context()))
end
function Demo:onSaveSlotLoaded(saveSlot,isSelected,rawSlot)
  if isSelected then
    if combat.pickupCapture then combat.pickupCapture:stop("save_slot_changed") end
    selectedSaveSlot=number(saveSlot,1,3,true) and number(rawSlot,1,3,true) and saveSlot or nil
  end
end
function Demo:onPostUpdate()
  if combat.pickupCapture and combat.pickupCapture:enabled() then combat.pickupCapture:tick(self:pickupProbeContext()) end
  combat.expandedEffects:tick()
  if running and not blocked then pruneRoomStats() end
  if running and not blocked and combat.pruneChildren then combat.pruneChildren() end
  if pendingStatPlayer then
    local player = pendingStatPlayer
    pendingStatPlayer = nil
    refreshStats(player)
  end
  if pendingBanner and Game():GetFrameCount() > pendingBanner.frame and Game():GetFrameCount() <= pendingBanner.frame + 2 then
    showBanner(pendingBanner.name, pendingBanner.summary)
  elseif pendingBanner and Game():GetFrameCount() > pendingBanner.frame + 2 then
    pendingBanner = nil
  end
  creator.serviceBlanks()
  creator.serviceGenerators()
  promptUi:updateInput(); pollNativeProfile(true); self:updatePassiveEffects()
  if running and Isaac.GetTime()-lastStateTime>1000 then publishState() end
end
function Demo:onPreUpdate()
  -- REPENTOGON skips the room update while leaving rendering and ImGui alive.
  return promptUi:shouldPause()
end
local function entityAlive(entity)
  if not entity then return false end
  if entity.Exists then local ok,value=pcall(entity.Exists,entity); if ok then return value end end
  return true
end
local function nearestEnemy(position, radius)
  if not Isaac.FindInRadius or not EntityPartition then return nil end
  local ok,entities=pcall(Isaac.FindInRadius,position,radius,EntityPartition.ENEMY)
  if not ok or type(entities)~="table" then return nil end
  local nearest,distance
  for _,entity in ipairs(entities) do
    local enemy=entity
    if enemy and ((enemy.IsVulnerableEnemy and not enemy:IsVulnerableEnemy()) or (enemy.IsDead and enemy:IsDead()) or (EntityFlag and EntityFlag.FLAG_FRIENDLY and enemy.HasEntityFlags and enemy:HasEntityFlags(EntityFlag.FLAG_FRIENDLY))) then enemy=nil end
    if enemy and enemy.Position then
      local dx,dy=enemy.Position.X-position.X,enemy.Position.Y-position.Y
      local squared=dx*dx+dy*dy
      if squared<=radius*radius and (not distance or squared<distance) then nearest,distance=enemy,squared end
    end
  end
  return nearest
end
local function hurtEnemy(entity, amount, source)
  if entity and entity.TakeDamage then local ok,result=pcall(entity.TakeDamage,entity,amount,0,EntityRef(source),0); return ok and result~=false end
  return false
end
function combat.pruneChildren()
  if not next(combat.childProfiles) then return end
  local players={}
  for playerIndex=0,Game():GetNumPlayers()-1 do local player=Isaac.GetPlayer(playerIndex); players[tostring(player.InitSeed)]=player end
  local count=0
  for index in pairs(combat.childProfiles) do
    local profile=runtime[index]
    if profile then
      for key,child in pairs(profile.ownedChildren) do
        if not entityAlive(child.entity) or not owned(players[child.owner],index) then
          if entityAlive(child.entity) and child.entity.Remove then child.entity:Remove() end
          profile.ownedChildren[key]=nil
        else count=count+1 end
      end
    end
    if not profile or not next(profile.ownedChildren) then combat.childProfiles[index]=nil end
  end
  combat.childCount=count
end
function combat.owner(entity,inspectGuarded)
  if inspectGuarded then
    if combat.expandedEffects:suppressed(entity,true) then return nil end
  elseif combat.secondary(entity) then return nil end
  local seen={}
  for depth=1,8 do
    if not entity or seen[entity] then return nil end
    seen[entity]=true
    local player=entity.ToPlayer and entity:ToPlayer()
    if player then return player end
    local familiar=entity.ToFamiliar and entity:ToFamiliar()
    if familiar and familiar.Player then return familiar.Player end
    local data=entity.GetData and entity:GetData()
    if data and data.nebiusFriendlyOwner then return data.nebiusFriendlyOwner end
    entity=entity.SpawnerEntity or entity.Parent
  end
end
function combat.enemy(entity)
  local enemy=entity and entity.ToNPC and entity:ToNPC()
  if not enemy or (enemy.IsVulnerableEnemy and not enemy:IsVulnerableEnemy()) or (enemy.IsDead and enemy:IsDead()) then return nil end
  if EntityFlag and EntityFlag.FLAG_FRIENDLY and enemy.HasEntityFlags and enemy:HasEntityFlags(EntityFlag.FLAG_FRIENDLY) then return nil end
  return enemy
end
function combat.damage(entity,amount,player)
  local enemy=combat.enemy(entity)
  if not enemy then return end
  if enemy.GetData then enemy:GetData().generatedDamageOwner=nil end
  combat.depth=combat.depth+1
  local applied=hurtEnemy(enemy,amount,player)
  combat.depth=combat.depth-1
  return applied
end
function combat.attacker(entity)
  local seen={}
  for depth=1,8 do
    if not entity or seen[entity] then return end
    seen[entity]=true
    local enemy=combat.enemy(entity)
    if enemy then return enemy end
    if entity.ToPlayer and entity:ToPlayer() then return end
    entity=entity.SpawnerEntity or entity.Parent
  end
end
local function applyStatus(enemy, player, status, duration, amount)
  if not enemy then return end
  local ref = EntityRef(player)
  if status=="slow" and enemy.AddSlowing then enemy:AddSlowing(ref, duration, 0.5, Color(0.5,0.7,1,1))
  elseif status=="burn" and enemy.AddBurn then enemy:AddBurn(ref, duration, amount)
  elseif status=="poison" and enemy.AddPoison then enemy:AddPoison(ref, duration, amount)
  elseif status=="fear" and enemy.AddFear then enemy:AddFear(ref, duration)
  elseif status=="charm" and enemy.AddCharmed then enemy:AddCharmed(ref, duration)
  elseif status=="confusion" and enemy.AddConfusion then enemy:AddConfusion(ref, duration, false)
  elseif status=="freeze" and enemy.AddFreeze then enemy:AddFreeze(ref, duration)
  else return false end
  return true
end
function combat.apply(action,player,event)
  if not event or event.owner~=player or combat.depth>0 then return end
  local enemy=combat.enemy(event.target)
  local succeeded=false
  if action.type=="damage_burst" then
    if not event.position or not Isaac.FindInRadius or not EntityPartition then return end
    local targets=Isaac.FindInRadius(event.position,action.radius,EntityPartition.ENEMY)
    local count=0
    for _,target in ipairs(targets or {}) do
      if target~=event.target and combat.enemy(target) then
        if combat.damage(target,action.amount,player) then succeeded=true end
        count=count+1
        if count>=8 then break end
      end
    end
  elseif action.type=="retaliate" then
    if action.target_mode=="nearby" then
      if not ((event.trigger=="player_hurt" and event.confirmed) or event.trigger=="collision") or not player.Position or not number(action.radius,40,120,false) or not Isaac.FindInRadius or not EntityPartition then return end
      local targets=Isaac.FindInRadius(player.Position,action.radius,EntityPartition.ENEMY)
      local count,seen=0,{}
      for _,target in ipairs(targets or {}) do
        local position=target.Position
        if position and not seen[target] and combat.enemy(target) then
          local horizontal,vertical=position.X-player.Position.X,position.Y-player.Position.Y
          if horizontal*horizontal+vertical*vertical<=action.radius*action.radius then
            seen[target]=true
            if combat.damage(target,action.amount,player) then succeeded=true end
            count=count+1
            if count>=8 then break end
          end
        end
      end
    elseif event.trigger=="collision" then succeeded=combat.damage(event.target,action.amount,player)==true
    else succeeded=combat.damage(combat.attacker(event.target),action.amount,player)==true end
  elseif action.type=="apply_status" and enemy then
    combat.depth=combat.depth+1
    local ok,applied=pcall(applyStatus,enemy,player,action.status,action.duration,action.amount)
    combat.depth=combat.depth-1
    succeeded=ok and applied==true
  end
  return succeeded
end
function combat.convert(player,action)
  local input,output=combat.resources[action.input_resource],combat.resources[action.output_resource]
  if not player[input.read] or not player[input.write] or not player[output.read] or not player[output.write] then return false end
  local inputBefore,outputBefore=player[input.read](player),player[output.read](player)
  if inputBefore<action.cost then return false end
  local ok=pcall(function()
    player[input.write](player,-action.cost)
    if player[input.read](player)~=inputBefore-action.cost then error("Resource spend refused") end
    player[output.write](player,action.amount)
  end)
  local inputAfter,outputAfter=player[input.read](player),player[output.read](player)
  if not ok or inputAfter~=inputBefore-action.cost or outputAfter~=outputBefore+action.amount then
    pcall(player[input.write],player,inputBefore-inputAfter)
    pcall(player[output.write],player,outputBefore-outputAfter)
    return false
  end
  return true
end
local function withinDistance(origin, target, radius)
  if not origin or not target then return false end
  local dx,dy=(target.X or 0)-(origin.X or 0),(target.Y or 0)-(origin.Y or 0)
  return dx*dx+dy*dy<=radius*radius
end
local function namedVariant(name)
  if not Isaac.GetEntityVariantByName then return nil end
  local ok, variant = pcall(Isaac.GetEntityVariantByName, name)
  if ok and type(variant) == "number" and variant > 0 then return variant end
end
local function bodyVariant(kind)
  local customName = { normal = "Generated Follower", sentry = "Generated Orbital", melee = "Generated Chaser", shield = "Generated Shield", orbit_contact = "Generated Orbital" }
  local custom = namedVariant(customName[kind])
  if custom then return custom end
  local vanilla = {
    normal = FamiliarVariant and FamiliarVariant.BROTHER_BOBBY,
    sentry = FamiliarVariant and (FamiliarVariant.SACRIFICIAL_DAGGER or FamiliarVariant.CUBE_OF_MEAT),
    melee = FamiliarVariant and FamiliarVariant.LEECH,
    shield = FamiliarVariant and FamiliarVariant.DRY_BABY,
    orbit_contact = FamiliarVariant and (FamiliarVariant.SACRIFICIAL_DAGGER or FamiliarVariant.CUBE_OF_MEAT),
  }
  return vanilla[kind] or (FamiliarVariant and FamiliarVariant.PUNCHING_BAG) or 0
end
local function playerAnchor(player)
  return player.Position + (player.Velocity or Vector.Zero)
end
local function quietBody(familiar)
  familiar.CollisionDamage = 0
  if familiar.FireCooldown ~= nil then familiar.FireCooldown = 90 end
end
local familiarClip = { normal = "Float", sentry = "Spin", melee = "Hop", shield = "Idle" }
local function applyFamiliarSprite(familiar, profile)
  if not familiar.GetSprite or not profile.familiarAnimation or not profile.familiarAnimationSheet then return false end
  local ok, sprite = pcall(familiar.GetSprite, familiar)
  if not ok or not sprite or not sprite.Load then return false end
  local clip = familiarClip[profile.familiar.type] or "Idle"
  local loaded = pcall(function()
    sprite:Load(profile.familiarAnimation, true)
    sprite:ReplaceSpritesheet(0, profile.familiarAnimationSheet)
    sprite:LoadGraphics()
    sprite:Play(clip, true)
  end)
  if not loaded then return false end
  familiar:GetData().generatedSprite = true
  familiar.Visible = true
  return true
end
local function moveFollower(familiar, player)
  familiar.Player = player
  local data = familiar:GetData()
  if familiar.AddToFollowers and not data.joinedFollowers then
    pcall(familiar.AddToFollowers, familiar)
    data.joinedFollowers = true
  end
  if familiar.FollowParent then pcall(familiar.FollowParent, familiar) end
end
local function moveOrbit(familiar, player, index, layer, distance)
  familiar.Player = player
  local data = familiar:GetData()
  if familiar.AddToOrbit and not data.joinedOrbit then
    pcall(familiar.AddToOrbit, familiar, layer)
    data.joinedOrbit = true
  end
  familiar.OrbitDistance = Vector(distance, distance)
  familiar.OrbitSpeed = 0.04
  familiar.OrbitAngleOffset = (index - 1) * 1.57
  if not familiar.GetOrbitPosition then return end
  local ok, destination = pcall(familiar.GetOrbitPosition, familiar, playerAnchor(player))
  if ok and destination then familiar.Velocity = destination - familiar.Position end
end
local function moveChaser(familiar, player, profile)
  familiar.Player = player
  local quarry = nearestEnemy(player.Position, profile.familiar.range)
  if quarry and quarry.Position and familiar.FollowPosition then
    pcall(familiar.FollowPosition, familiar, quarry.Position)
    return
  end
  if familiar.FollowParent then pcall(familiar.FollowParent, familiar) end
end
local function blockShots(familiar)
  if not Isaac.FindByType or not EntityType or not EntityType.ENTITY_PROJECTILE then return end
  local ok,found=pcall(Isaac.FindByType, EntityType.ENTITY_PROJECTILE, -1, -1, false, false)
  if not ok or type(found)~="table" then return end
  for _,shot in ipairs(found) do
    if shot and shot.Type==EntityType.ENTITY_PROJECTILE and shot.Position and shot.Remove and withinDistance(familiar.Position, shot.Position, 20) then
      pcall(shot.Remove, shot)
    end
  end
end
local function contactStrike(familiar, profile, player)
  local hit=nearestEnemy(familiar.Position, 24)
  if withinDistance(familiar.Position, hit and hit.Position, 24) then hurtEnemy(hit, profile.familiar.damage, player) end
end
local function readyShield(player, frame)
  if #members.familiar == 0 then return end
  local key=tostring(player.InitSeed)
  local found
  eachOwned(members.familiar, player, function(_, profile)
    if not found and profile.familiar and profile.familiar.type=="shield" then
      local familiar=profile.familiarEntities[key]
      if entityAlive(familiar) and frame>=(familiar:GetData().shieldReadyFrame or 0) then found=profile end
    end
  end)
  return found
end
local function clampNumber(value, minimum, maximum)
  if value<minimum then return minimum end
  if value>maximum then return maximum end
  return value
end
local function spawnFamiliarTear(familiar, dirX, dirY, attack, shot)
  if not TearVariant or not TearVariant.BLUE then return nil end
  local origin=familiar.Position
  local ok,spawned=pcall(Isaac.Spawn,EntityType.ENTITY_TEAR,TearVariant.BLUE,0,origin,Vector(dirX*shot.speed,dirY*shot.speed),familiar)
  local tear=ok and spawned and spawned:ToTear() or nil
  if not tear then return nil end
  tear.CollisionDamage=shot.damage
  local flags=0
  for _,name in ipairs(attack.flags or {}) do flags=flags|flagFromName(name) end
  tear.TearFlags=(tear.TearFlags or 0)|flags
  local color=attack.color
  tear.Color=Color(color.r,color.g,color.b,color.a,0,0,0)
  tear.Scale=shot.scale
  if shot.falling then tear.FallingSpeed,tear.FallingAcceleration=shot.falling,shot.falling end
  local data=tear:GetData(); data.generatedFamiliar,data.familiarPattern=true,shot.pattern
  return tear
end
local function rotate(x, y, radians)
  local cosine,sine=math.cos(radians),math.sin(radians)
  return x*cosine-y*sine, x*sine+y*cosine
end
local function resolveAttack(attack, damage)
  if attack.pattern=="varied" then
    local roll=math.random(1,4)
    if roll==2 then return { pattern="single", damage=damage, scale=clampNumber(attack.scale*0.8,0.5,2), speed=clampNumber(attack.speed*1.35,4,12) }
    elseif roll==3 then return { pattern="fan", damage=damage*0.7, scale=attack.scale, speed=attack.speed }
    elseif roll==4 then return { pattern="lob", damage=damage*1.25, scale=clampNumber(attack.scale*1.15,0.5,2), speed=attack.speed, falling=0.8 } end
    return { pattern="single", damage=damage, scale=attack.scale, speed=attack.speed }
  end
  if attack.pattern=="fan" then return { pattern="fan", damage=damage*0.7, scale=attack.scale, speed=attack.speed } end
  if attack.pattern=="lob" then return { pattern="lob", damage=damage*1.25, scale=attack.scale, speed=attack.speed, falling=0.8 } end
  return { pattern="single", damage=damage, scale=attack.scale, speed=attack.speed }
end
local function fireRangedVolley(familiar, target, profile)
  if not target or not target.Position then return false end
  local attack=profile.familiar.attack
  if not attack then return false end
  local origin=familiar.Position
  local dx,dy=(target.Position.X or 0)-(origin.X or 0),(target.Position.Y or 0)-(origin.Y or 0)
  local length=math.sqrt(dx*dx+dy*dy)
  if length<0.01 then return false end
  local shot=resolveAttack(attack, profile.familiar.damage)
  local dirX,dirY=dx/length,dy/length
  if shot.pattern=="fan" then
    local spawnedAny=false
    for step=0,2 do
      local aimX,aimY=rotate(dirX,dirY,(step-1)*0.22)
      if spawnFamiliarTear(familiar,aimX,aimY,attack,shot) then spawnedAny=true end
    end
    return spawnedAny
  end
  return spawnFamiliarTear(familiar,dirX,dirY,attack,shot)~=nil
end
local familiarPlace = {
  sentry = function(familiar, _, player, index)
    moveOrbit(familiar, player, index, 1, 40)
  end,
  melee = function(familiar, profile, player)
    moveChaser(familiar, player, profile)
  end,
  shield = function(familiar, _, player, index)
    moveOrbit(familiar, player, index, 2, 24)
    blockShots(familiar)
  end,
  normal = function(familiar, _, player)
    moveFollower(familiar, player)
  end,
}
familiarPlace.orbit_contact = familiarPlace.sentry
local familiarAct = {
  sentry = function(familiar, profile, player)
    local target=nearestEnemy(familiar.Position,profile.familiar.range)
    if not fireRangedVolley(familiar,target,profile) then hurtEnemy(target,profile.familiar.damage,player) end
  end,
  melee = function(familiar, profile, player) contactStrike(familiar,profile,player) end,
  shield = function(familiar, profile, player) contactStrike(familiar,profile,player) end,
  orbit_contact = function(familiar, profile, player) contactStrike(familiar,profile,player) end,
}
familiarAct.normal = familiarAct.sentry
local function tickFamiliar(familiar, profile, player, index, frame, key)
  if not owned(player,index) then
    profile.familiarEntities[key]=nil
    if familiar.Remove then familiar:Remove() end
    return
  end
  local data=familiar:GetData()
  if data.tickedFrame==frame then return end
  data.tickedFrame=frame
  local mode=profile.familiar.type
  local place=familiarPlace[mode] or familiarPlace.normal
  place(familiar, profile, player, index, frame, key)
  if frame%(profile.familiar.cooldown or 30)==0 then
    local act=familiarAct[mode] or familiarAct.normal
    act(familiar, profile, player)
  end
end
function Demo:onFamiliarUpdate(familiar)
  if not running or blocked or not familiar or not familiar.GetData then return end
  local index=familiar:GetData().generatedFamiliarIndex
  local profile=index and runtime[index]
  if not profile or not profile.familiar then
    if index and familiar.Remove then familiar:Remove() end
    return
  end
  local player=familiar.Player
  if not player then if familiar.Remove then familiar:Remove() end; return end
  local key=tostring(player.InitSeed)
  if profile.familiarEntities[key]~=familiar then if familiar.Remove then familiar:Remove() end; return end
  tickFamiliar(familiar, profile, player, index, Game():GetFrameCount(), key)
end
function Demo:updatePassiveEffects()
  if not running or blocked then return end
  if #members.familiar == 0 and #members.aura == 0 then return end
  local frame=Game():GetFrameCount()
  local players={}
  for playerIndex=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(playerIndex)
    players[tostring(player.InitSeed)]=player
  end
  for _,index in ipairs(members.familiar) do
    local profile=runtime[index]
    for key,familiar in pairs(profile.familiarEntities) do
      if not entityAlive(familiar) or not owned(players[key],index) then
        profile.familiarEntities[key]=nil
        if entityAlive(familiar) and familiar.Remove then familiar:Remove() end
      end
    end
  end
  for _,index in ipairs(members.aura) do
    local profile=runtime[index]
    for key in pairs(profile.auraOwners) do
      if not owned(players[key],index) or frame>=(profile.cooldowns["aura:"..key] or 0) then profile.cooldowns["aura:"..key]=nil; profile.auraOwners[key]=nil end
    end
  end
  for p=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(p); local key=tostring(player.InitSeed)
    for _,index in ipairs(members.aura) do
      if not owned(player,index) then runtime[index].cooldowns["aura:"..key]=nil end
    end
    eachOwned(members.familiar, player, function(index, profile)
      local familiar=profile.familiarEntities[key]
      if not entityAlive(familiar) then
        local ok,spawned=pcall(Isaac.Spawn,EntityType.ENTITY_FAMILIAR,bodyVariant(profile.familiar.type),0,player.Position,Vector.Zero,player)
        familiar=ok and spawned and spawned:ToFamiliar() or nil
        if familiar then
          familiar.Player = player
          quietBody(familiar)
          if not applyFamiliarSprite(familiar, profile) then familiar.Visible = profile.familiarImage == nil end
          familiar:GetData().generatedFamiliarIndex=index
          profile.familiarEntities[key]=familiar
        end
      end
      if not familiar then return end
      tickFamiliar(familiar, profile, player, index, frame, key)
    end)
    eachOwned(members.aura, player, function(_, profile)
      if profile.aura.triggered and frame>=(profile.cooldowns["aura:"..key] or 0) then return end
      if frame%(profile.aura.cooldown or 30)==0 and Isaac.FindInRadius and EntityPartition then
        local ok,entities=pcall(Isaac.FindInRadius,player.Position,profile.aura.radius,EntityPartition.ENEMY)
        if ok and type(entities)=="table" then
          for _,enemy in ipairs(entities) do
            local aura=profile.aura
            if aura.type=="damage" or withinDistance(player.Position,enemy.Position,aura.radius) then
              if aura.type=="damage" then
                hurtEnemy(enemy,aura.damage,player)
                if enemy.SetColor and Color then pcall(enemy.SetColor, enemy, Color(1, 0.45, 0.2, 1, 0.5, 0.1, 0), 10, 1, true, false) end
              elseif (not enemy.IsVulnerableEnemy or enemy:IsVulnerableEnemy()) and (not enemy.IsDead or not enemy:IsDead()) then
                if aura.type=="slow" or aura.type=="burn" or aura.type=="fear" or aura.type=="charm" or aura.type=="poison" or aura.type=="confusion" then
                  applyStatus(enemy, player, aura.type, aura.duration, aura.damage)
                end
              end
            end
          end
        end
      end
    end)
  end
end
local cacheApply = {
  [CacheFlag.CACHE_DAMAGE] = function(player, total) player.Damage=(player.Damage+total.damage)*total.damageMultiplier end,
  [CacheFlag.CACHE_FIREDELAY] = function(player, total) player.MaxFireDelay=math.max(0.5,player.MaxFireDelay+total.fireDelay) end,
  [CacheFlag.CACHE_RANGE] = function(player, total) player.TearRange=player.TearRange+total.range end,
  [CacheFlag.CACHE_LUCK] = function(player, total) player.Luck=player.Luck+total.luck end,
  [CacheFlag.CACHE_SHOTSPEED] = function(player, total) player.ShotSpeed=player.ShotSpeed+total.shotSpeed end,
  [CacheFlag.CACHE_SPEED] = function(player, total) player.MoveSpeed=player.MoveSpeed+total.speed end,
}
if CacheFlag.CACHE_FLYING then
  cacheApply[CacheFlag.CACHE_FLYING] = function(player, total) if total.flying then player.CanFly = true end end
end
function Demo:onEvaluateCache(player,cacheFlag)
  local apply=cacheApply[cacheFlag]
  if not apply or (#members.stats==0 and #roomStatGrants==0) then return end
  local total={damage=0,damageMultiplier=1,fireDelay=0,range=0,luck=0,shotSpeed=0,speed=0,flying=false}
  eachOwned(members.stats, player, function(index, profile)
    local count = 1
    if player.GetCollectibleNum then
      local copies = player:GetCollectibleNum(ids[index])
      if type(copies) == "number" and copies >= 1 then count = copies end
    end
    for key in pairs(total) do
      if key == "flying" then if profile.flying then total.flying = true end
      elseif key == "damageMultiplier" then total.damageMultiplier=total.damageMultiplier*(profile.damageMultiplier ^ count)
      else total[key]=total[key]+profile[key]*count end
    end
  end)
  for _, grant in ipairs(roomStatGrants) do
    if grant.player==tostring(player.InitSeed) and owned(player,grant.index) and (not grant.expires or Game():GetFrameCount()<grant.expires) then
      if grant.stat=="tears" then total.fireDelay=total.fireDelay-grant.amount
      elseif grant.stat=="speed" then total.speed=total.speed+grant.amount*0.1
      elseif grant.stat=="shot_speed" then total.shotSpeed=total.shotSpeed+grant.amount*0.1
      elseif grant.stat=="range" then total.range=total.range+grant.amount
      else total[grant.stat]=total[grant.stat]+grant.amount end
    end
  end
  apply(player, total)
end
local function grantRoomStat(profile, player, action, effectKey)
  if action.type ~= "grant_stat" then return false end
  local index
  for i, candidate in ipairs(runtime) do if candidate==profile then index=i; break end end
  if not index then return true end
  local key=tostring(player.InitSeed)
  local effect=(action.duration~=nil or action.stack_limit~=nil) and effectKey or nil
  for _, grant in ipairs(roomStatGrants) do
    if grant.index==index and grant.player==key and grant.stat==action.stat and grant.effect==effect then
      local amount=effect and math.min(grant.amount+action.amount,action.amount*(action.stack_limit or 1)) or math.max(action.amount,grant.amount)
      if action.duration then grant.expires=Game():GetFrameCount()+action.duration end
      if amount~=grant.amount then grant.amount=amount; refreshStats(player) end
      return true
    end
  end
  if #roomStatGrants>=1536 then return true end
  roomStatGrants[#roomStatGrants+1]={index=index,player=key,stat=action.stat,amount=action.amount,effect=effect,expires=action.duration and (Game():GetFrameCount()+action.duration) or nil}
  refreshStats(player)
  return true
end
local function conditionCount(player, getter, slot)
  if not player or type(player[getter])~="function" then return nil end
  local ok,count=pcall(player[getter],player,slot)
  if not ok or type(count)~="number" or count~=count or count<0 or count>=math.huge or count%1~=0 then return nil end
  return count
end
local conditionActiveSlots={primary=0,secondary=1,pocket=2,pocket2=3}
local conditionHandlers = {
  first_visit = function(condition,context)
    return combat.conditionQueries.handlers.first_visit(condition,context)
  end,
  room_clear_state = function(condition,context)
    return combat.conditionQueries.handlers.room_clear_state(condition,context)
  end,
  stage_at_most = function(condition,context)
    return combat.conditionQueries.handlers.stage_at_most(condition,context)
  end,
  stage_at_least = function(condition,context)
    return combat.conditionQueries.handlers.stage_at_least(condition,context)
  end,
  difficulty_kind = function(condition,context)
    return combat.conditionQueries.handlers.difficulty_kind(condition,context)
  end,
  curse_active = function(condition,context)
    return combat.conditionQueries.handlers.curse_active(condition,context)
  end,
  while_moving = function(condition,context)
    return combat.conditionQueries.handlers.while_moving(condition,context)
  end,
  while_firing = function(condition,context)
    return combat.conditionQueries.handlers.while_firing(condition,context)
  end,
  while_grounded = function(condition,context)
    return combat.conditionQueries.handlers.while_grounded(condition,context)
  end,
  character_kind = function(condition,context)
    return combat.conditionQueries.handlers.character_kind(condition,context)
  end,
  has_collectible = function(condition,context)
    return combat.conditionQueries.handlers.has_collectible(condition,context)
  end,
  has_familiar = function(condition,context)
    return combat.conditionQueries.handlers.has_familiar(condition,context)
  end,
  target_is_boss = function(condition,context)
    return combat.conditionQueries.handlers.target_is_boss(condition,context)
  end,
  target_is_champion = function(condition,context)
    return combat.conditionQueries.handlers.target_is_champion(condition,context)
  end,
  target_health_at_most = function(condition,context)
    return combat.conditionQueries.handlers.target_health_at_most(condition,context)
  end,
  target_health_at_least = function(condition,context)
    return combat.conditionQueries.handlers.target_health_at_least(condition,context)
  end,
  target_has_status = function(condition,context)
    return combat.conditionQueries.handlers.target_has_status(condition,context)
  end,
  damage_at_least = function(condition,context)
    return combat.conditionQueries.handlers.damage_at_least(condition,context)
  end,
  weapon_kind = function(condition,context)
    return combat.conditionQueries.handlers.weapon_kind(condition,context)
  end,
  chance = function(condition)
    return number(condition.chance,0,1,false) and math.random()<=condition.chance
  end,
  luck_chance = function(condition,context)
    if not number(condition.chance,0,1,false) or not number(condition.luck_scale,0,0.25,false) then return false end
    return math.random()<=math.max(0,math.min(1,condition.chance+condition.luck_scale*(context.player.Luck or 0)))
  end,
  once_per_room = function(_,context)
    return true,context.prefix.."room:"..tostring(context.roomIndex)
  end,
  once_per_floor = function(_,context)
    return true,context.prefix.."floor"
  end,
  once_per_run = function(_,context)
    return true,tostring(context.player.InitSeed)..":"..tostring(context.ruleIndex)..":run"
  end,
  once_per_target = function(_,context)
    local target=context.event and context.event.target
    if not target or target.InitSeed==nil then return false end
    return true,tostring(context.player.InitSeed)..":"..tostring(context.ruleIndex)..":target:"..tostring(target.InitSeed)
  end,
  hearts_at_most = function(condition,context)
    local player=context.player
    return ((player.GetHearts and player:GetHearts() or 0)+(player.GetSoulHearts and player:GetSoulHearts() or 0))<=condition.amount
  end,
  hearts_at_least = function(condition,context)
    local player=context.player
    return ((player.GetHearts and player:GetHearts() or 0)+(player.GetSoulHearts and player:GetSoulHearts() or 0))>=condition.amount
  end,
  red_hearts_at_most = function(condition,context)
    local count=conditionCount(context.player,"GetHearts")
    return count~=nil and count<=condition.amount
  end,
  red_hearts_at_least = function(condition,context)
    local count=conditionCount(context.player,"GetHearts")
    return count~=nil and count>=condition.amount
  end,
  soul_hearts_at_most = function(condition,context)
    local count=conditionCount(context.player,"GetSoulHearts")
    return count~=nil and count<=condition.amount
  end,
  soul_hearts_at_least = function(condition,context)
    local count=conditionCount(context.player,"GetSoulHearts")
    return count~=nil and count>=condition.amount
  end,
  empty_red_hearts_at_least = function(condition,context)
    local capacity=conditionCount(context.player,"GetEffectiveMaxHearts")
    local filled=conditionCount(context.player,"GetHearts")
    return capacity~=nil and filled~=nil and math.max(0,capacity-filled)>=condition.amount
  end,
  active_charge_at_least = function(condition,context)
    local slot=conditionActiveSlots[condition.slot]
    if slot==nil then return false end
    local item=conditionCount(context.player,"GetActiveItem",slot)
    if not item or item==0 then return false end
    local normal=conditionCount(context.player,"GetActiveCharge",slot)
    local battery=conditionCount(context.player,"GetBatteryCharge",slot)
    return normal~=nil and battery~=nil and normal+battery>=condition.amount
  end,
  room_kind = function(condition)
    local room=Game():GetRoom()
    return room and room.GetType and room:GetType()==roomKinds[condition.room] or false
  end,
  resource_at_most = function(condition,context)
    local resource=combat.resources[condition.resource]
    if not resource or not context.player[resource.read] then return false end
    local count=context.player[resource.read](context.player)
    return type(count)=="number" and count<=condition.amount
  end,
  resource_at_least = function(condition,context)
    local resource=combat.resources[condition.resource]
    if not resource or not context.player[resource.read] then return false end
    local count=context.player[resource.read](context.player)
    return type(count)=="number" and count>=condition.amount
  end,
  while_flying = function(_,context)
    local player=context.player
    return player.CanFly==true or (player.IsFlying and player:IsFlying()) or false
  end,
}
for name in pairs(conditionCatalog.conditions) do assert(conditionHandlers[name],"Missing condition handler: "..name) end
for name in pairs(conditionHandlers) do assert(conditionCatalog.conditions[name],"Unregistered condition handler: "..name) end

local function ruleMayRun(profile, rule, ruleIndex, player, cooldownIdentity, event, reservedStateKey, deferCommit)
  local needs={}
  local effectPrefix=type(ruleIndex)=="number" and "rule:"..ruleIndex or tostring(ruleIndex)
  for actionIndex,action in ipairs(rule.actions or {}) do
    if action.type=="convert_resource" then needs[action.input_resource]=(needs[action.input_resource] or 0)+action.cost end
    if action.type=="coins_to_charge" then needs.coin=(needs.coin or 0)+action.cost end
    if combat.expandedCatalog.actions[action.type] and not combat.expandedEffects.canRun(profile,player,action,effectPrefix..":"..actionIndex,combat.expandedEvent(action,player,event)) then return false end
  end
  for resource,cost in pairs(needs) do
    local read=combat.resources[resource].read
    if not player[read] or player[read](player)<cost then return false end
  end
  local roomIndex = Game():GetLevel():GetCurrentRoomIndex()
  local floorIndex = Game():GetLevel():GetAbsoluteStage()
  profile.ruleState = profile.ruleState or {}
  profile.cooldowns=profile.cooldowns or {}
  local cooldownKey=tostring(player.InitSeed)..":"..tostring(cooldownIdentity or ruleIndex)
  local frame=Game():GetFrameCount()
  if profile.cooldowns[cooldownKey] and frame<profile.cooldowns[cooldownKey] then return false end
  if rule.cooldown then
    local count=0
    for key,ready in pairs(profile.cooldowns) do if ready<=frame then profile.cooldowns[key]=nil else count=count+1 end end
    if count>=256 then return false end
  end
  local prefix = tostring(player.InitSeed) .. ":" .. tostring(ruleIndex) .. ":" .. tostring(floorIndex) .. ":"
  local pendingKeys = {}
  local pendingKeySet={}
  if reservedStateKey then pendingKeys[#pendingKeys+1]=reservedStateKey; pendingKeySet[reservedStateKey]=true end
  local context={player=player,event=event,prefix=prefix,roomIndex=roomIndex,ruleIndex=ruleIndex}
  local ordered={}
  for _,condition in ipairs(rule.conditions or {}) do
    if not conditionCatalog.conditions[condition.type] or not conditionHandlers[condition.type] then return false end
    ordered[#ordered+1]=condition
  end
  table.sort(ordered,function(left,right)
    if left.type~=right.type then return left.type<right.type end
    if left.chance~=right.chance then return (left.chance or 0)<(right.chance or 0) end
    return (left.luck_scale or 0)<(right.luck_scale or 0)
  end)
  for _,category in ipairs({"pure","latch"}) do
    for _,condition in ipairs(ordered) do
      if conditionCatalog.conditions[condition.type].category==category then
        local passed,key=conditionHandlers[condition.type](condition,context)
        if not passed or (key and profile.ruleState[key]) then return false end
        if key and not pendingKeySet[key] then pendingKeys[#pendingKeys+1]=key; pendingKeySet[key]=true end
      end
    end
  end
  if #pendingKeys>0 then
    local count=0; for _ in pairs(profile.ruleState) do count=count+1 end
    if count+#pendingKeys>4096 then return false end
  end
  for _,condition in ipairs(ordered) do
    if conditionCatalog.conditions[condition.type].category=="probability" and not conditionHandlers[condition.type](condition,context) then return false end
  end
  local function commit()
    for _, key in ipairs(pendingKeys) do profile.ruleState[key] = true end
    if rule.cooldown then profile.cooldowns[cooldownKey]=frame+rule.cooldown end
  end
  if deferCommit then return commit end
  commit()
  return true
end

local pickupVariants = {
  coin = PickupVariant.PICKUP_COIN, key = PickupVariant.PICKUP_KEY,
  bomb = PickupVariant.PICKUP_BOMB, heart = PickupVariant.PICKUP_HEART,
  pill = PickupVariant.PICKUP_PILL, card = PickupVariant.PICKUP_TAROTCARD,
  battery = PickupVariant.PICKUP_LIL_BATTERY, trinket = PickupVariant.PICKUP_TRINKET,
  chest = PickupVariant.PICKUP_CHEST, sack = PickupVariant.PICKUP_GRAB_BAG,
}
local friendlyTypes = {
  attack_fly = EntityType.ENTITY_ATTACKFLY, spider = EntityType.ENTITY_SPIDER, pooter = EntityType.ENTITY_POOTER,
}
local function runLegacyAction(profile, player, action, effectKey, event)
  if event and event.trigger=="player_death" and not deathActions[action.type] then return end
  if action.type=="convert_resource" then return combat.convert(player,action) end
  if action.type=="activate_aura" then local key=tostring(player.InitSeed); profile.cooldowns["aura:"..key]=Game():GetFrameCount()+action.duration; profile.auraOwners[key]=true; return true end
  if combat.effects[action.type] then return combat.apply(action,player,event) end
  if action.type=="refill_charge" then
    if not player.GetActiveItem or not player.SetActiveCharge then return end
    local slot = ActiveSlot and ActiveSlot.SLOT_PRIMARY or 0
    if player:GetActiveItem(slot)==0 then return end
    local current = player.GetActiveCharge and player:GetActiveCharge(slot) or 0
    player:SetActiveCharge(current + action.amount, slot)
    return not player.GetActiveCharge or player:GetActiveCharge(slot)>current
  end
  if action.type=="spawn_creep" then
    local variant = creepVariants[action.creep]
    if not variant then return end
    local effectType = EntityType.ENTITY_EFFECT or 1000
    local token = (profile.friendlyToken or "creep")..":"..tostring(player.InitSeed)..":creep"
    local live = 0
    local found = Isaac.FindByType(effectType, variant)
    if type(found)=="table" then
      for _, entity in ipairs(found) do
        local data = entity.GetData and entity:GetData()
        if data and data.nebiusCreep==token and (not entity.Exists or entity:Exists()) then live=live+1 end
      end
    end
    local room = Game():GetRoom()
    local before=live
    for _ = 1, action.amount or 1 do
      if live>=4 then break end
      local position = room and room.FindFreePickupSpawnPosition and room:FindFreePickupSpawnPosition(player.Position, 0, true) or player.Position
      local entity = Isaac.Spawn(effectType, variant, 0, position, Vector.Zero, player)
      local creep = entity and entity.ToEffect and entity:ToEffect()
      if creep then
        combat.nativeSecondaryActive=true
        if creep.GetData then creep:GetData().nebiusCreep=token end
        creep:SetTimeout(action.duration)
        creep.LifeSpan=action.duration
        creep.CollisionDamage=action.creep=="black" and 0 or 1
        creep.Scale=action.radius/40
        live=live+1
      elseif entity and entity.Remove then entity:Remove()
      end
    end
    return live>before
  end
  if grantRoomStat(profile, player, action, effectKey) or grantHeartReward(player, action) then return true end
  if action.type == "spawn_pickup" then
    local variant = pickupVariants[action.pickup_type]
    if not variant then return end
    local succeeded=false
    for _ = 1, action.amount or 1 do
      local position = Game():GetRoom():FindFreePickupSpawnPosition(player.Position, 0, true)
      local subtype=action.pickup_subtype and pickupSubtypes[action.pickup_type][action.pickup_subtype] or 0
      if Isaac.Spawn(EntityType.ENTITY_PICKUP,variant,subtype,position,Vector.Zero,player) then succeeded=true end
    end
    return succeeded
  elseif action.type == "spawn_friendly" then
    local spec = friendlySpawn[action.friendly_type]
    local named = ({ pooter = EntityType.ENTITY_POOTER, dip = EntityType.ENTITY_DIP })[action.friendly_type]
    local entityType = (type(named)=="number" and named>0) and named or (spec and spec.type) or friendlyTypes[action.friendly_type]
    local variant = spec and spec.variant or 0
    local owner=tostring(player.InitSeed)
    local token=profile.friendlyToken..":"..owner
    combat.pruneChildren()
    local ownerCount=0
    for _,child in pairs(profile.ownedChildren) do if child.owner==owner then ownerCount=ownerCount+1 end end
    if ownerCount>=32 then return end
    if not entityType or combat.childCount>=256 then return end
    local position = Game():GetRoom():FindFreePickupSpawnPosition(player.Position, 40, true)
    local npc = Isaac.Spawn(entityType, variant, 0, position, Vector.Zero, player)
    if not npc then return end
    if spec and spec.kind=="familiar" then
      local familiar=npc.ToFamiliar and npc:ToFamiliar()
      if not familiar then if npc.Remove then npc:Remove() end; return end
      familiar.Player=player
    end
    if npc.GetData then npc:GetData().nebiusFriendlyItem=token; npc:GetData().nebiusFriendlyOwner=player end
    combat.nativeSecondaryActive=true
    profile.childSequence=(profile.childSequence or 0)+1
    local childKey=owner..":"..profile.childSequence
    profile.ownedChildren[childKey]={entity=npc,owner=owner}
    combat.childProfiles[profile.index]=true
    combat.childCount=combat.childCount+1
    if (not spec or spec.kind=="npc") and npc.AddCharmed then npc:AddCharmed(EntityRef(player), -1) end
    return true
  end
end
local function runAction(profile,player,action,effectKey,event,strictSuccess)
  if combat.expandedCatalog.actions[action.type] then
    combat.expandedActive=true
    return combat.expandedEffects:run(profile,player,action,effectKey,combat.expandedEvent(action,player,event))
  end
  local result=runLegacyAction(profile,player,action,effectKey,event)
  return not strictSuccess or result==true
end
local function runOneRuleSet(triggerName, player, profile, event)
  local succeeded=false
  for ruleIndex, rule in ipairs(profile.rules or {}) do
    local eligible=true
    local strictSuccess=false
    for _,action in ipairs(rule.actions or {}) do if combat.expandedCatalog.actions[action.type] then strictSuccess=true end end
    local requiresDamage=false
    for _,condition in ipairs(rule.conditions or {}) do if condition.type=="damage_at_least" then requiresDamage=true end end
    if triggerName=="player_hurt" then
      local hasCombat=false
      for _,action in ipairs(rule.actions or {}) do if combat.effects[action.type] or action.type=="block_projectiles" or action.type=="reflect_projectiles" then hasCombat=true end end
      eligible=(hasCombat or requiresDamage)==(event and event.confirmed==true or false)
    elseif triggerName=="enemy_hit" then
      local execution=false
      for _,action in ipairs(rule.actions or {}) do if action.type=="execute_enemy" then execution=true end end
      eligible=(requiresDamage or execution)==(event and event.confirmed==true or false)
    end
    if eligible and rule.trigger == triggerName then
      local commit=ruleMayRun(profile, rule, ruleIndex, player, nil, event, nil, true)
      if commit then
        local applied=false
        for actionIndex, action in ipairs(rule.actions or {}) do if runAction(profile,player,action,"rule:"..ruleIndex..":"..actionIndex,event,strictSuccess) then applied=true end end
        if applied then commit(); succeeded=true; playProfileSound(profile,0.45) end
      end
    end
  end
  return succeeded
end


local function runActions(profile, player, list, effectPrefix, event)
  local succeeded=false
  local strictSuccess=false
  for _,action in ipairs(list or {}) do if combat.expandedCatalog.actions[action.type] then strictSuccess=true end end
  for actionIndex, action in ipairs(list or {}) do if runAction(profile,player,action,(effectPrefix or "proc")..":"..actionIndex,event,strictSuccess) then succeeded=true end end
  if succeeded then playProfileSound(profile,0.45) end
  return succeeded
end
local function runProfileRules(trigger,player,event)
  if not running or blocked then return end
  event=event or {owner=player,position=player.Position}
  event.trigger=trigger
  local succeeded=false
  eachOwned(byTrigger[trigger], player, function(_,profile) if runOneRuleSet(trigger,player,profile,event) then succeeded=true end end)
  return succeeded
end
local function runSystemProc(systemName, player, latchKey, event, onlyIndex)
  if not running or blocked then return end
  local succeeded=false
  if event then event.trigger=systemName end
  eachOwned(members[systemName], player, function(index, profile)
    if onlyIndex and index~=onlyIndex then return end
    local proc = profile[systemName]
    if not proc then return end
    local hasReward,hasCombat=false,false
    for _,action in ipairs(proc.actions) do
      if combat.effects[action.type] then hasCombat=true else hasReward=true end
    end
    if hasCombat and not hasReward and (not event or event.owner~=player) then return end
    profile.ruleState = profile.ruleState or {}
    local latchTable,pendingLatch
    if latchKey and not (systemName=="collision" and hasCombat) then
      local playerLatch=tostring(player.InitSeed)..":"..latchKey
      if profile.ruleState[playerLatch] then return end
      if event and event.latches then
        local key=tostring(index)..":"..playerLatch
        if event.latches[key] then return end
        latchTable,pendingLatch=event.latches,key
      else
        local count=0; for _ in pairs(profile.ruleState) do count=count+1 end
        if count>=4096 then return end
        latchTable,pendingLatch=profile.ruleState,playerLatch
      end
    end
    local cooldownIdentity=systemName
    if systemName=="collision" and hasCombat and event and event.target then cooldownIdentity="contact:"..roomStamp()..":"..tostring(event.target.InitSeed or 0) end
    local commit=ruleMayRun(profile,proc,systemName,player,cooldownIdentity,event,latchTable==profile.ruleState and pendingLatch or nil,true)
    if commit and runActions(profile,player,proc.actions,systemName,event) then
      commit()
      if latchTable then latchTable[pendingLatch]=true end
      succeeded=true
    end
  end)
  return succeeded
end
local function isEnemy(entity)
  if not entity or (entity.ToPlayer and entity:ToPlayer()) then return false end
  if not entity.ToNPC then return false end
  local npc = entity:ToNPC()
  if not npc then return false end
  if npc.IsEnemy then return npc:IsEnemy() end
  return true
end
function Demo:onPostFireTear(tear)
  if combat.secondary(tear) then return end
  local player=tear.SpawnerEntity and tear.SpawnerEntity:ToPlayer()
  if not player then return end
  if #members.tears == 0 and #members.tear_update == 0 and not byTrigger.tear_fire then return end
  if #members.tears > 0 then
    local scale=1
    eachOwned(members.tears, player, function(_, profile)
      tear.Color=profile.tearColor
      scale=scale*profile.tearScale
      applyTearFlags(tear, profile)
    end)
    tear.Scale=tear.Scale*math.max(0.5,math.min(2,scale))
  end
  if tear.GetData then
    local data = tear:GetData()
    data.generatedTearOwner = player
    data.generatedTearSources={}
    data.generatedBaseScale=tear.Scale or 1
    data.generatedTearStart=Game():GetFrameCount()
    eachOwned(members.tear_update, player, function(index, profile)
      if profile.tear_update then data.generatedTearSources[index] = profile.tear_update end
    end)
  end
  runProfileRules("tear_fire",player,{owner=player,source=tear,velocity=tear.Velocity,position=tear.Position,weapon_kind=combat.eventContext.weapon(tear)})
end
local function forPlayers(trigger)
  for p=0,Game():GetNumPlayers()-1 do runProfileRules(trigger,Isaac.GetPlayer(p)) end
end
function Demo:onPostNewRoom()
  if combat.pickupCapture then combat.pickupCapture:stop("new_room") end
  combat.expandedEffects:clearActors()
  for _,profile in ipairs(runtime) do for key in pairs(profile.cooldowns) do if key:sub(1,5)=="aura:" then profile.cooldowns[key]=nil end end end
  local hadGrants=#roomStatGrants>0
  roomStatGrants={}
  playerDeathSeen={}
  if hadGrants then for p=0,Game():GetNumPlayers()-1 do refreshStats(Isaac.GetPlayer(p)) end end
  forPlayers("room_enter")
  if running then saveRun() end
end
function Demo:onPreSpawnCleanAward() forPlayers("room_clear") end
function Demo:onPostNewLevel() forPlayers("new_floor") end
function Demo:onEntityTakeDamage(entity,amount,flags,source,_,extraSource)
  if combat.nativeSecondaryActive and entity and entity.ToPlayer and entity:ToPlayer()
    and combat.nativeSecondary(extraSource and extraSource.Entity or source and source.Entity,true) then return false end
  if (#members.stats>0 or #members.tears>0 or #members.familiar>0) and DamageFlag and type(DamageFlag.DAMAGE_EXPLOSION)=="number" and type(flags)=="number"
    and math.type(flags)=="integer" and (flags & DamageFlag.DAMAGE_EXPLOSION)~=0 then
    local player=entity and entity.ToPlayer and entity:ToPlayer()
    if player then
      local protected=false
      for _,list in ipairs({members.stats,members.tears,members.familiar}) do
        eachOwned(list,player,function(_,profile) if profile.explosionImmune then protected=true end end)
      end
      if protected then return false end
    end
  end
  if combat.secondary(extraSource and extraSource.Entity or source and source.Entity) then
    if entity and entity.GetData then entity:GetData().generatedDamageOwner=nil;entity:GetData().generatedSecondaryDamage=true end
    return
  end
  if combat.depth>0 or (#members.familiar==0 and #members.on_kill==0 and not byTrigger.player_hurt and not byTrigger.enemy_hit) then return end
  local player=entity:ToPlayer()
  if player then
    local frame=Game():GetFrameCount()
    local shield=readyShield(player, frame)
    if shield then
      shield.familiarEntities[tostring(player.InitSeed)]:GetData().shieldReadyFrame=frame+(shield.familiar.cooldown or 30)
      return false
    end
    runProfileRules("player_hurt",player,{owner=player,target=source and source.Entity,position=player.Position})
    return
  end
  if #members.on_kill==0 and not byTrigger.enemy_hit then return end
  local owner=combat.owner(source and source.Entity)
  if entity.GetData and (#members.on_kill>0 or #members.on_hit>0) then
    entity:GetData().generatedDamageOwner=owner
    entity:GetData().generatedSecondaryDamage=nil
    entity:GetData().generatedDamageFrame=Game():GetFrameCount()
  end
  if owner then runProfileRules("enemy_hit",owner,{owner=owner,target=entity,position=entity.Position,weapon_kind=combat.eventContext.weapon(extraSource and extraSource.Entity or source and source.Entity)}) end
end
function Demo:onPostEntityTakeDamage(entity,amount,flags,source,_,extraSource)
  if combat.secondary(extraSource and extraSource.Entity or source and source.Entity) then return end
  if combat.depth>0 then return end
  local player=entity and entity.ToPlayer and entity:ToPlayer()
  if player then
    if byTrigger.player_hurt then runProfileRules("player_hurt",player,{owner=player,target=source and source.Entity,position=player.Position,confirmed=true,damage=combat.eventContext.damage(amount,flags)}) end
  elseif byTrigger.enemy_hit then
    local owner=combat.owner(source and source.Entity)
    if owner then runProfileRules("enemy_hit",owner,{owner=owner,target=entity,position=entity.Position,confirmed=true,damage=combat.eventContext.damage(amount,flags),weapon_kind=combat.eventContext.weapon(extraSource and extraSource.Entity or source and source.Entity)}) end
  end
end
local function runPlayerDeath(player)
  if not player then return end
  local key=tostring(player.InitSeed)
  if playerDeathSeen[key] then return end
  playerDeathSeen[key]=true
  runProfileRules("player_death", player, {owner=player, target=player, position=player.Position})
end
function Demo:onPostPlayerDeath(player)
  runPlayerDeath(player and player.ToPlayer and player:ToPlayer() or player)
end
function Demo:onPostEntityKill(entity,killSource)
  if combat.secondary(killSource and killSource.Entity) then return end
  local player=entity and entity.ToPlayer and entity:ToPlayer()
  if player then runPlayerDeath(player); return end
  if not isEnemy(entity) then return end
  local boss=entity.IsBoss and entity:IsBoss()
  if #members.on_kill==0 and not (boss and byTrigger.boss_kill) then return end
  local latch="on_kill:" .. tostring(Game():GetLevel():GetCurrentRoomIndex()) .. ":" .. tostring(entity.InitSeed or 0)
  local data=entity.GetData and entity:GetData()
  if not killSource and data and data.generatedSecondaryDamage then return end
  local owner=data and data.generatedDamageOwner
  if data and data.generatedDamageFrame and Game():GetFrameCount()-data.generatedDamageFrame>300 then owner=nil end
  if killSource then owner=combat.owner(killSource.Entity) end
  if combat.depth>0 then owner=nil end
  if data then data.generatedProcLatches=data.generatedProcLatches or {} end
  local event={owner=owner,target=entity,position=entity.Position,latches=data and data.generatedProcLatches,weapon_kind=combat.eventContext.weapon(killSource and killSource.Entity)}
  if #members.on_kill>0 then for p=0,Game():GetNumPlayers()-1 do runSystemProc("on_kill", Isaac.GetPlayer(p), latch,event) end end
  if boss and owner then runProfileRules("boss_kill", owner, {owner=owner, target=entity, position=entity.Position,weapon_kind=event.weapon_kind}) end
end
function Demo:onPreTearCollision(tear, collider)
  if combat.secondary(tear) then return end
  if #members.tear_impact == 0 or not isEnemy(collider) then return end
  local player=combat.owner(tear)
  if not player or not tear.GetData then return end
  local data=tear:GetData()
  data.impacted=data.impacted or {}
  eachOwned(members.tear_impact, player, function(index)
    if data.impacted[index] then return end
    if runSystemProc("tear_impact", player, nil,{owner=player,target=collider,position=collider.Position,weapon_kind=combat.eventContext.weapon(tear)},index) then data.impacted[index]=true end
  end)
end
function Demo:onPrePlayerCollision(player, collider)
  if #members.collision == 0 or not isEnemy(collider) then return end
  player=player and player.ToPlayer and player:ToPlayer()
  if not player then return end
  local latch="collision:" .. tostring(Game():GetLevel():GetCurrentRoomIndex()) .. ":" .. tostring(collider.InitSeed or 0)
  local data=collider.GetData and collider:GetData()
  if data then data.generatedProcLatches=data.generatedProcLatches or {} end
  runSystemProc("collision", player, latch,{owner=player,target=collider,position=collider.Position,latches=data and data.generatedProcLatches})
end
function Demo:onPostTearUpdate(tear)
  if combat.secondary(tear) then return end
  if #members.tears==0 and #members.tear_update==0 then return end
  if not tear or not tear.GetData then return end
  local data = tear:GetData()
  local owner = data.generatedTearOwner
  if owner and #members.tears > 0 then
    eachOwned(members.tears, owner, function(_, profile)
      tear.Color = profile.tearColor
      applyTearFlags(tear, profile)
    end)
  end
  if not data.generatedTearSources or not next(data.generatedTearSources) or not owner then return end
  local strengths={home=0,pulse=0,shrink=0,spiral=0,accelerate=0}
  for index,spec in pairs(data.generatedTearSources) do
    if owned(owner,index) then
      strengths[spec.behavior]=(strengths[spec.behavior] or 0)+spec.strength
      strengths[spec.behavior]=math.min(2,strengths[spec.behavior])
    end
  end
  if strengths.home>0 then
    local enemy = nearestEnemy(tear.Position or Vector(0, 0), 240)
    if enemy and enemy.Position and tear.Velocity then
      local dx, dy = enemy.Position.X - tear.Position.X, enemy.Position.Y - tear.Position.Y
      local length = math.sqrt(dx * dx + dy * dy)
      if length > 0.01 then
        local pull = 0.15 * strengths.home
        tear.Velocity = tear.Velocity + Vector(dx / length * pull, dy / length * pull)
      end
    end
  end
  if strengths.pulse>0 or strengths.shrink>0 then
    data.generatedScaleModified=true
    local age=math.max(1,Game():GetFrameCount()-(data.generatedTearStart or 0)+1)
    local base=data.generatedBaseScale or 1
    local scale=math.max(0.5,base-0.02*strengths.shrink*age)
    if strengths.pulse>0 then scale=scale*(1+0.08*strengths.pulse*math.sin(Game():GetFrameCount()*0.3)) end
    tear.Scale=math.max(0.5,math.min(2,scale))
  elseif data.generatedScaleModified then tear.Scale=data.generatedBaseScale; data.generatedScaleModified=nil end
  if strengths.spiral>0 and tear.Velocity then
    local angle=0.08*strengths.spiral
    local cosine,sine=math.cos(angle),math.sin(angle)
    local vx,vy=tear.Velocity.X,tear.Velocity.Y
    tear.Velocity=Vector(vx*cosine-vy*sine, vx*sine+vy*cosine)
  end
  if strengths.accelerate>0 and tear.Velocity then
    local factor=1+0.02*strengths.accelerate
    local vx,vy=tear.Velocity.X*factor,tear.Velocity.Y*factor
    local speed=math.sqrt(vx*vx+vy*vy)
    if speed>20 then vx,vy=vx/speed*20,vy/speed*20 end
    tear.Velocity=Vector(vx,vy)
  end
end
function Demo:onPostFireBomb(bomb)
  if combat.secondary(bomb) then return end
  if #members.bomb == 0 or not bomb then return end
  if bomb.GetData and bomb:GetData().generatedBombApplied then return end
  local player = bomb.SpawnerEntity and bomb.SpawnerEntity.ToPlayer and bomb.SpawnerEntity:ToPlayer()
  if not player then return end
  local radius=bomb.Radius or 0
  local applied=false
  eachOwned(members.bomb, player, function(_, profile)
    if not profile.bomb then return end
    bomb.ExplosionDamage = (bomb.ExplosionDamage or 0) + profile.bomb.damage
    radius=math.max(radius,profile.bomb.radius)
    applied=true
    for _, flag in ipairs(profile.bomb.flags or {}) do
      local bits = flagFromName(flag)
      if bits ~= 0 and bomb.AddTearFlags then bomb:AddTearFlags(bits) end
    end
  end)
  if applied then
    bomb.Radius=radius
    if bomb.GetData then bomb:GetData().generatedBombApplied=true end
  end
end
local function addWeaponDamage(listName, field, entity)
  if combat.secondary(entity) then return end
  if #members[listName] == 0 or not entity or not entity.GetData then return end
  local data = entity:GetData()
  local spawner = entity.SpawnerEntity or entity.Parent
  local player = combat.owner(spawner)
  local added = 0
  local tint
  eachOwned(members[listName], player, function(_, profile)
    if profile[field] then added = added + profile[field].damage; tint=profile[field].color or tint end
  end)
  if tint and entity.SetColor then entity:SetColor(Color(tint.r,tint.g,tint.b,tint.a,0,0,0),2,1,false,false) end
  local current=entity.CollisionDamage or 0
  local previous=data.generatedWeapon
  local base=current
  if type(previous)=="table" and math.abs(current-(previous.base+previous.added))<0.000001 then base=previous.base end
  if added==0 and not previous then return end
  data.generatedWeapon={base=base,added=added}
  entity.CollisionDamage=base+added
end
function Demo:onPostLaserUpdate(laser) addWeaponDamage("laser", "laser", laser) end
function Demo:onPostKnifeUpdate(knife) addWeaponDamage("knife", "knife", knife) end
function Demo:onPreProjectileCollision(projectile, collider)
  if #members.familiar == 0 or not projectile then return end
  local familiar = collider and collider.ToFamiliar and collider:ToFamiliar()
  if familiar and familiar.GetData and familiar:GetData().generatedFamiliarIndex then
    local profile = runtime[familiar:GetData().generatedFamiliarIndex]
    local player=familiar.Player
    if profile and profile.familiar and profile.familiar.type == "shield" and owned(player,profile.index) and profile.familiarEntities[tostring(player.InitSeed)]==familiar then
      if projectile.Remove then projectile:Remove() end
      return false
    end
  end
  local player = collider and collider.ToPlayer and collider:ToPlayer()
  if not player or not projectile.Position then return end
  local blocked = false
  eachOwned(members.familiar, player, function(_, profile)
    if blocked or not profile.familiar or profile.familiar.type ~= "shield" then return end
    local shield = profile.familiarEntities[tostring(player.InitSeed)]
    if entityAlive(shield) and withinDistance(shield.Position, projectile.Position, 20) then blocked = true end
  end)
  if blocked then
    if projectile.Remove then projectile:Remove() end
    return false
  end
end
function Demo:onPostEntityRemove(entity)
  combat.expandedEffects:removeEntity(entity)
  if #members.familiar==0 then return end
  local familiar = entity and entity.ToFamiliar and entity:ToFamiliar()
  if not familiar or not familiar.GetData then return end
  local index = familiar:GetData().generatedFamiliarIndex
  local profile = index and runtime[index]
  if not profile or not profile.familiarEntities then return end
  for key, stored in pairs(profile.familiarEntities) do
    if stored == familiar then profile.familiarEntities[key] = nil end
  end
end
function Demo:onPostPlayerInit(player)
  creator.applyAIsaac(player)
end
function Demo:pickupProbeContext()
  if not running or blocked or (selectedSaveSlot~=2 and selectedSaveSlot~=3) then return nil end
  return {session=session,run=runToken,room=roomStamp(),frame=Game():GetFrameCount(),save_slot=selectedSaveSlot}
end
function Demo:onPostPickupCollision(pickup,collider)
  if combat.pickupCapture and combat.pickupCapture:enabled() then combat.pickupCapture:after(pickup,collider,self:pickupProbeContext()) end
end
function Demo:onPrePickupCollision(pickup,collider)
  if combat.pickupCapture and combat.pickupCapture:enabled() then combat.pickupCapture:before(pickup,collider,self:pickupProbeContext()) end
  if not pickup or pickup.Variant~=PickupVariant.PICKUP_COLLECTIBLE or not collider or not collider.ToPlayer then return end
  local player=collider:ToPlayer()
  if not player then return end
  if creator.anyAIsaac() then self:onPickupUpdate(pickup) end
  local quality=creator.generatorIdSet[pickup.SubType]
  if quality==nil then return end
  local data=pickup.GetData and pickup:GetData() or {}
  creator.touch[tostring(player.InitSeed)]={quality=data.nebiusGeneratorQuality or quality,itemType=data.nebiusGeneratorItemType or "passive",collectible=pickup.SubType}
end
function Demo:onPostAddCollectible(collectibleType,_,firstTime,_,_,player)
  local generatorQuality=creator.generatorIdSet[collectibleType]
  if generatorQuality~=nil and firstTime~=false and not creator.exchanging then
    local touch=creator.touch[tostring(player.InitSeed)]
    local itemType,quality="passive",generatorQuality
    if touch and touch.collectible==collectibleType then itemType,quality=touch.itemType or "passive",touch.quality or quality; creator.touch[tostring(player.InitSeed)]=nil end
    creator.pendingGenerator=nil
    creator.startGenerator(player,quality,itemType,collectibleType)
  end
  if collectibleType==creator.blank and not creator.isAIsaac(player) and firstTime~=false and not creator.exchanging and not promptUi.open and not promptUi.requested and not promptUi.pending and not next(creator.requests) then
    creator.handoff(player); creator.noticed[creator.owner]=creator.count(player); promptUi.requested=true
  end
  if creator.exchanging then return end
  if creator.isAIsaac(player) and firstTime~=false and collectibleType~=creator.singularity and generatorQuality==nil and not slotById[collectibleType] then
    local quest,quality,itemType=false,0,"passive"
    if Isaac.GetItemConfig and ItemConfig and ItemConfig.TAG_QUEST then
      local item=Isaac.GetItemConfig():GetCollectible(collectibleType)
      if item then
        if type(item.Tags)=="number" and (item.Tags & ItemConfig.TAG_QUEST)~=0 then quest=true end
        if type(item.Quality)=="number" then quality=math.max(0,math.min(4,math.floor(item.Quality))) end
        if ItemType and item.Type==ItemType.ITEM_ACTIVE then itemType="active" end
      end
    end
    local replacement=not quest and creator.generatorIds[quality] or nil
    if replacement and replacement>0 and player and player.RemoveCollectible and player.AddCollectible then
      creator.pendingGenerator={player=player,quality=quality,itemType=itemType,collectible=replacement}
      creator.exchanging=true
      pcall(function() player:RemoveCollectible(collectibleType); player:AddCollectible(replacement,0,false) end)
      creator.exchanging=false
      local pending=creator.pendingGenerator
      creator.pendingGenerator=nil
      if pending then creator.startGenerator(pending.player,pending.quality,pending.itemType,pending.collectible) end
      return
    end
  end
  local index=slotById[collectibleType]
  local profile=index and runtime[index]
  if not profile or firstTime==false then return end
  if profile.affectsStats then
    if profile.soulHearts>0 then player:AddSoulHearts(profile.soulHearts) end
    refreshStats(player)
    pendingStatPlayer = player
  end
  queueBanner(profile)
  runProfileRules("pickup",player)
end
function creator.activeReady(item,player,flags,slot)
  if not running or blocked or not player or not number(slot,0,3,true) or not player.GetActiveItem or player:GetActiveItem(slot)~=item then return end
  if UseFlag and UseFlag.USE_CARBATTERY and ((flags or 0) & UseFlag.USE_CARBATTERY)~=0 then return end
  local index=slotById[item]; local profile=index and runtime[index]
  if not profile or not profile.active or combat.depth>0 then return end
  local key="use:"..tostring(player.InitSeed)..":"..slot
  if (profile.cooldowns[key] or -1)>Game():GetFrameCount() then return end
  local minimum,maximum,total=6,6,nil
  if player.GetActiveMinUsableCharge and player.GetActiveMaxCharge and player.GetTotalActiveCharge then
    local okMin,minValue=pcall(player.GetActiveMinUsableCharge,player,slot)
    local okMax,maxValue=pcall(player.GetActiveMaxCharge,player,slot)
    local okTotal,totalValue=pcall(player.GetTotalActiveCharge,player,slot)
    if not okMin or not okMax or not okTotal or not number(minValue,0,1000000,false) or not number(maxValue,0,1000000,false) or not number(totalValue,0,1000000,false) or minValue>maxValue then return end
    minimum,maximum,total=minValue,maxValue,totalValue
  elseif player.GetActiveCharge then
    total=player:GetActiveCharge(slot)+(player.GetBatteryCharge and player:GetBatteryCharge(slot) or 0)
  end
  if total==nil or total<minimum or maximum<=0 then return end
  if not Isaac.FindInRadius or not EntityPartition then return end
  local ok,entities=pcall(Isaac.FindInRadius,player.Position,profile.active.radius,EntityPartition.ENEMY)
  if not ok or type(entities)~="table" then return end
  local targets={}
  for _,enemy in ipairs(entities) do
    if combat.enemy(enemy) and withinDistance(player.Position,enemy.Position,profile.active.radius) then targets[#targets+1]=enemy; if #targets>=8 then break end end
  end
  if #targets==0 then return end
  return profile,key,targets
end
function Demo:onPreUseItem(item,_,player,flags,slot)
  if item==creator.singularity then
    if not running or blocked or not creator.isAIsaac(player) or not player.GetActiveItem or player:GetActiveItem(slot)~=item or promptUi.pending or next(creator.requests) then return {Discharge=false} end
    local charge=player.GetActiveCharge and player:GetActiveCharge(slot) or 0
    local battery=player.GetBatteryCharge and player:GetBatteryCharge(slot) or 0
    if charge+battery<12 then return {Discharge=false} end
    return
  end
  if not creator.activeIdSet[item] then return end
  if not creator.activeReady(item,player,flags,slot) then return {Discharge=false} end
end
function Demo:onPostBombUpdate(bomb)
  if combat.secondary(bomb) then return end
  if not bomb or not bomb.GetData then return end
  local data=bomb:GetData()
  if data.nebiusBombProc then return end
  local exploding=(bomb.IsDead and bomb:IsDead()) or (bomb.GetExplosionCountdown and bomb:GetExplosionCountdown()==0)
  if not exploding then return end
  data.nebiusBombProc=true
  local owner=combat.owner(bomb.SpawnerEntity or bomb.Parent)
  if owner then runProfileRules("bomb_explode", owner, {owner=owner, target=bomb, position=bomb.Position,weapon_kind=combat.eventContext.weapon(bomb)}) end
end
function Demo:onUsePill(_, player)
  if player then runProfileRules("pill_use", player, {owner=player, position=player.Position}) end
end
function Demo:onUseCard(_, player)
  if player then runProfileRules("card_use", player, {owner=player, position=player.Position}) end
end
function Demo:onUseItem(item,_,player,flags,slot)
  if item==creator.singularity then
    if UseFlag and UseFlag.USE_CARBATTERY and ((flags or 0) & UseFlag.USE_CARBATTERY)~=0 then return {Discharge=false,ShowAnim=false,Remove=false} end
    local charge=player and player.GetActiveCharge and player:GetActiveCharge(slot) or 0
    local battery=player and player.GetBatteryCharge and player:GetBatteryCharge(slot) or 0
    if not creator.isAIsaac(player) or not player.GetActiveItem or player:GetActiveItem(slot)~=item or promptUi.pending or next(creator.requests) or charge+battery<12 then return {Discharge=false,ShowAnim=false,Remove=false} end
    if not creator.startSingularity(player,slot) then return {Discharge=false,ShowAnim=false,Remove=false} end
    return {Discharge=true,ShowAnim=true,Remove=false}
  end
  if not creator.activeIdSet[item] then
    if player then runProfileRules("active_use", player, {owner=player, position=player.Position}) end
    return
  end
  local profile,key,targets=creator.activeReady(item,player,flags,slot)
  if not profile then return {Discharge=false,ShowAnim=false,Remove=false} end
  local hits=0
  profile.cooldowns[key]=Game():GetFrameCount()+1
  for _,enemy in ipairs(targets) do if combat.damage(enemy,profile.active.damage,player) then hits=hits+1 end end
  if hits==0 then profile.cooldowns[key]=nil end
  return {Discharge=hits>0,ShowAnim=hits>0,Remove=false}
end
function Demo:onPickupInit(pickup)
  self:onPickupUpdate(pickup)
end
function creator.rollQuality()
  return Random() % 5
end
function creator.startSingularity(player,slot)
  if not running or blocked or not creator.isAIsaac(player) or creator.singularity<=0 or not player.GetActiveItem or player:GetActiveItem(slot)~=creator.singularity then return end
  if promptUi.pending or next(creator.requests) then return end
  creator.handoff(player)
  promptUi.sequence=(promptUi.sequence or 0)+1
  local id=tostring(runToken).."_singularity_"..tostring(Random()).."_"..tostring(promptUi.sequence)
  local quality=creator.rollQuality()
  creator.requests[id]={mode="singularity",owner=tostring(player.InitSeed),quality=quality,slot=slot}
  promptUi.pending,promptUi.pendingKind,promptUi.started=id,"generate",Isaac.GetTime()
  promptUi.phase,promptUi.status,promptUi.quality,promptUi.itemType,promptUi.suppressOpen="generating","Spinning the Singularity Terminal...",quality,"passive",true
  if not saveRun() then creator.requests[id]=nil; promptUi.pending,promptUi.pendingKind,promptUi.suppressOpen=nil,nil,false; return end
  Isaac.DebugString("[NebiusBridge] generate "..bridgeJson.encode({id=id,auto=true,quality=quality,item_type="passive",delivery={mode="singularity",owner=tostring(player.InitSeed),quality=quality}}))
  return true
end
function Demo:onPickupUpdate(pickup)
  if not pickup or pickup.Variant~=PickupVariant.PICKUP_COLLECTIBLE or not pickup.GetData then return end
  local aisaac=creator.anyAIsaac()
  if not aisaac then
    if not running or blocked then return end
    if creator.blank<=0 or not creator.settings.replacePassives then return end
    local character=false
    for p=0,Game():GetNumPlayers()-1 do if creator.isCharacter(Isaac.GetPlayer(p)) then character=true; break end end
    if not character then return end
  end
  local data=pickup:GetData()
  if data.nebiusMorphing then return end
  if not aisaac and data.nebiusReplaced then return end
  local identity=type(pickup.InitSeed)=="number" and roomStamp()..":"..tostring(pickup.InitSeed) or nil
  if not aisaac and identity and creator.replacements[identity] then return end
  if not aisaac and identity then
    local count=0; for _ in pairs(creator.replacements) do count=count+1 end
    if count>=2048 then return end
  end
  if not aisaac and pickup.GetCollectibleCycle then
    local ok,cycle=pcall(pickup.GetCollectibleCycle,pickup)
    if not ok or type(cycle)~="table" or #cycle>1 then return end
  end
  if not aisaac and pickup.HasFlipData then local ok,flip=pcall(pickup.HasFlipData,pickup); if not ok or flip then return end end
  if not aisaac and pickup.GetFlipCollectible then local ok,flip=pcall(pickup.GetFlipCollectible,pickup); if not ok or (flip~=nil and flip~=0) then return end end
  if not aisaac and data.nebiusCheckedSubtype==pickup.SubType then return end
  if not aisaac then data.nebiusCheckedSubtype=pickup.SubType end
  if pickup.SubType<=0 or pickup.SubType==creator.singularity or creator.generatorIdSet[pickup.SubType]~=nil or slotById[pickup.SubType] or not pickup.Morph then return end
  if not aisaac and (pickup.SubType==creator.blank or pickup.Touched or (pickup.VarData or 0)~=0) then return end
  if not aisaac and (pickup.Price or 0)<0 then return end
  if not Isaac.GetItemConfig or not ItemType or not ItemConfig or not ItemConfig.TAG_QUEST then return end
  local item=Isaac.GetItemConfig():GetCollectible(pickup.SubType)
  if not item or type(item.Tags)~="number" or (item.Tags & ItemConfig.TAG_QUEST)~=0 then return end
  local passive=item.Type==ItemType.ITEM_PASSIVE or item.Type==ItemType.ITEM_FAMILIAR
  local active=aisaac and item.Type==ItemType.ITEM_ACTIVE
  if not passive and not active then return end
  local quality=type(item.Quality)=="number" and math.max(0,math.min(4,math.floor(item.Quality))) or 0
  local target=aisaac and creator.generatorIds[quality] or creator.blank
  if not target or target<=0 then return end
  local price,shop,options,auto,wait=pickup.Price,pickup.ShopItemId,pickup.OptionsPickupIndex,pickup.AutoUpdatePrice,pickup.Wait
  data.nebiusMorphing=true
  pickup:Morph(EntityType.ENTITY_PICKUP,PickupVariant.PICKUP_COLLECTIBLE,target,true,true,true)
  data.nebiusMorphing=nil
  pickup.Price,pickup.ShopItemId,pickup.OptionsPickupIndex,pickup.AutoUpdatePrice,pickup.Wait=price,shop,options,auto,wait
  data.nebiusCheckedSubtype=target
  data.nebiusGeneratorQuality=quality
  data.nebiusGeneratorItemType=active and "active" or "passive"
  if pickup.SubType==target then
    data.nebiusReplaced=true
    if not aisaac and identity then creator.replacements[identity]=true; saveRun() end
  end
end
function Demo:onExecuteCmd(command,parameters)
  if command~="nebius" then return end
  local function probeStatus(message)
    showStatus(message)
    if Isaac.ConsoleOutput then Isaac.ConsoleOutput(message.."\n") end
  end
  if parameters=="probe pickups on" then
    local context=self:pickupProbeContext()
    if not context then probeStatus("Pickup capture requires an active run on Save File 2 or 3.");return end
    local available=type(ModCallbacks.MC_PRE_PICKUP_COLLISION)=="number" and type(ModCallbacks.MC_POST_PICKUP_COLLISION)=="number"
    if not available then probeStatus("Pickup pre/post collision callbacks are unavailable.");return end
    if not combat.pickupCapture then
      if type(pickupCaptureModule)~="table" or type(pickupCaptureModule.new)~="function"
        or type(pickupProbeModule)~="table" or type(pickupProbeModule.new)~="function" then
        probeStatus("Pickup capture modules unavailable. Restart Isaac after mod sync.");return
      end
      combat.pickupCapture=pickupCaptureModule.new(pickupProbeModule.new(),function(packet)
        Isaac.DebugString("[Pickup Probe] "..bridgeJson.encode(packet))
      end)
    end
    local _,message=combat.pickupCapture:start(context,available)
    probeStatus(message)
    return
  end
  if parameters=="probe pickups off" then
    if combat.pickupCapture then combat.pickupCapture:stop("operator") end
    probeStatus("Pickup capture disabled.");return
  end
  if parameters=="probe pickups status" then
    local status=combat.pickupCapture and combat.pickupCapture:status() or {enabled=false,recorded=0,recordLimit=128}
    probeStatus(status.enabled and "Pickup capture active: "..tostring(status.recorded).."/128 records." or "Pickup capture disabled.")
    return
  end
  if parameters=="audit vanilla" then
    local snapshot=vanillaAudit.capture({
      gameVersion="J273",
      runtimeVersion="REPENTOGON dev v1.9.7.12",
      capturedAt=os.date("!%Y-%m-%dT%H:%M:%SZ"),
      environmentNotes="Live Sprite Swap Demo and External Item Descriptions enabled; capture from restarted REPENTOGON dev session"
    })
    Isaac.DebugString("[Vanilla Mechanic Audit] captured "..tostring(snapshot.counts.total).." items; automatic saving is disabled")
    showStatus("Vanilla audit captured; automatic saving is disabled.")
    return
  end
  local key=parameters:match("^hotkey (KEY_[A-Z0-9_]+)$")
  if key and Keyboard[key] then creator.settings.hotkey=key; saveRun(); showStatus("Creator hotkey: "..key); return end
  local replacement=parameters:match("^replace (on)$") or parameters:match("^replace (off)$")
  if replacement then creator.settings.replacePassives=replacement=="on"; saveRun(); showStatus("Creator passive replacement: "..replacement); return end
  if parameters=="cancel" then
    local kept=promptUi.suppressOpen and "Request cancelled. Generator kept." or "Request cancelled. AI Item kept."
    for _,request in pairs(creator.requests) do if request.mode=="generator" then kept="Request cancelled. Generator kept." end end
    for id in pairs(creator.requests) do creator.cancelled[id]=true; Isaac.DebugString("[NebiusBridge] cancel "..bridgeJson.encode({id=id})); creator.requests[id]=nil end
    if promptUi.pendingKind=="generate" then creator.cancelled[promptUi.pending]=true; Isaac.DebugString("[NebiusBridge] cancel "..bridgeJson.encode({id=promptUi.pending})) end
    promptUi.pending,promptUi.pendingKind,promptUi.suppressOpen,promptUi.requested=nil,nil,false,false
    promptUi.phase,promptUi.status="editing",kept
    saveRun(); return
  end
  showStatus("nebius hotkey KEY_8 | nebius replace on/off | nebius cancel | nebius audit vanilla")
end
function creator.loadItemArt(profile)
  if not profile then return false end
  local nativePedestalSheet=profile.spriteSheet
  if not profile.image and not profile.loadFailed and Renderer and SourceQuad then
    local ok,image=pcall(Renderer.LoadImage, nativePedestalSheet)
    local quadOk,quad=pcall(SourceQuad.NewFromRectangle, Vector(0, 0), 32, 32, false)
    if ok and image and quadOk and quad then
      profile.image,profile.quad=image,quad
      Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_ART_READY "..nativePedestalSheet)
    else profile.loadFailed=true; Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_ART_FALLBACK "..nativePedestalSheet) end
  end
  return profile.image~=nil and profile.quad~=nil
end
promptUi.renderItemArt=function(profile,position,size)
  if not DestinationQuad or not creator.loadItemArt(profile) then return false end
  local ok,destination=pcall(DestinationQuad.NewFromRectangle,position,size,size)
  if not ok or not destination then return false end
  return pcall(profile.image.Render,profile.image,profile.quad,destination,KColor(1,1,1,1))
end
function Demo:onPostRender()
  pollNativeProfile(false); promptUi:render()
  local hideOverlays=promptUi:shouldHideGameOverlays()
  for _,profile in ipairs(runtime) do
    if profile.familiar and not profile.familiarImage and not profile.familiarLoadFailed and Renderer and SourceQuad then
      local ok,image=pcall(Renderer.LoadImage,profile.familiarSpriteSheet)
      local quadOk,quad=pcall(SourceQuad.NewFromRectangle,Vector(0,0),32,32,false)
      if ok and image and quadOk and quad then profile.familiarImage,profile.familiarQuad=image,quad
      else profile.familiarLoadFailed=true; Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_FAMILIAR_ART_FALLBACK "..tostring(profile.familiarSpriteSheet)) end
    end
    if not hideOverlays and profile.familiarImage and DestinationQuad then
      for _,familiar in pairs(profile.familiarEntities or {}) do if entityAlive(familiar) then
        local data = familiar.GetData and familiar:GetData()
        if not (data and data.generatedSprite) then
          familiar.Visible = false
          local position=Isaac.WorldToScreen(familiar.Position+familiar.PositionOffset)+Vector(-8,-8)
          local ok,destination=pcall(DestinationQuad.NewFromRectangle,position,16,16)
          if ok and destination then pcall(function() profile.familiarImage:Render(profile.familiarQuad,destination,KColor(1,1,1,1)) end) end
        end
      end end
    end
  end
  if not hideOverlays and statusUntil>=Game():GetFrameCount() then
    local lines = wrapLines(statusText, 52)
    for index, line in ipairs(lines) do
      if index > 4 then break end
      Isaac.RenderText(line, 38, 26 + index * 12, 1, 0.85, 0.2, 1)
    end
  end
end
function Demo:onPickupRender(pickup)
  if promptUi:shouldHideGameOverlays() then return end
  local index=slotById[pickup.SubType]
  local profile=index and runtime[index]
  if not profile then return end
  creator.loadItemArt(profile)
  local bob=math.sin(Game():GetFrameCount()*0.2)*3
  local position=Isaac.WorldToScreen(pickup.Position+pickup.PositionOffset)+Vector(-16,-48+bob)
  if profile.image and DestinationQuad then
    local nativePedestalImage=profile.image
    local sprite=pickup:GetSprite()
    local ok,layer=pcall(sprite.GetLayer,sprite,1)
    if ok and layer then layer:SetVisible(false) end
    local size=profile.animation=="pulse" and (32+2*math.sin(Game():GetFrameCount()*0.15)) or 32
    local good,destination=pcall(DestinationQuad.NewFromRectangle,position+Vector((32-size)/2,(32-size)/2),size,size)
    if good and destination then pcall(function() nativePedestalImage:Render(profile.quad,destination,KColor(1,1,1,1)) end) end
  end
end
function Demo:onPreHistoryHudRender(history,position,mini)
  creator.hudArt={}
  if promptUi:shouldHideGameOverlays() or (Options and Options.ExtraHUDStyle==0) or not DestinationQuad then return end
  if not history or not history.GetCollectibles then return end
  local hidden,seen={},{}
  local size=(mini==true or (Options and Options.ExtraHUDStyle==2)) and 16 or 32
  for playerSlot=0,1 do
    local ok,items=pcall(history.GetCollectibles,history,playerSlot,ids,false)
    if ok and type(items)=="table" then
      for _,item in ipairs(items) do
        local itemId=item:GetItemID()
        local index=slotById[itemId]
        local profile=index and runtime[index]
        if profile and creator.loadItemArt(profile) then
          local offset=item:GetRenderOffset()
          local good,destination=pcall(DestinationQuad.NewFromRectangle,position+offset,size,size)
          if good and destination then
            creator.hudArt[#creator.hudArt+1]={profile=profile,destination=destination}
            if not seen[itemId] then hidden[#hidden+1]=itemId; seen[itemId]=true end
          end
        end
      end
    end
  end
  if #hidden>0 then return {HideCollectibles=hidden} end
end
function Demo:onPostHistoryHudRender()
  local entries=creator.hudArt or {}
  creator.hudArt={}
  if promptUi:shouldHideGameOverlays() or (Options and Options.ExtraHUDStyle==0) then return end
  for _,entry in ipairs(entries) do
    pcall(entry.profile.image.Render,entry.profile.image,entry.profile.quad,entry.destination,KColor(1,1,1,1))
  end
end
function Demo:onPostPauseScreenRender()
  promptUi:renderPauseScreen()
end
function Demo:onInputAction(_,hook,action)
  -- The library is drawn over Isaac's pause menu.  Consume menu *triggers*
  -- while it is open so the underlying pause screen cannot also navigate,
  -- confirm a selection, or close itself.  Held controller actions remain
  -- available to the library; only its physical keyboard keys are suppressed
  -- at the held-action layer.
  if not promptUi.pauseLibrary or not InputHook or not ButtonAction then return end
  local blocked={
    ButtonAction.ACTION_MENUUP,ButtonAction.ACTION_MENUDOWN,
    ButtonAction.ACTION_MENULEFT,ButtonAction.ACTION_MENURIGHT,
    ButtonAction.ACTION_MENUCONFIRM,ButtonAction.ACTION_MENUBACK,
    ButtonAction.ACTION_PAUSE,
  }
  for _,candidate in ipairs(blocked) do
    if candidate and action==candidate then
      if hook==InputHook.IS_ACTION_TRIGGERED then return false end
      if hook~=InputHook.IS_ACTION_PRESSED or not Keyboard or not Input or not Input.IsButtonPressed then return end
      local keys={
        [ButtonAction.ACTION_MENUUP]={"KEY_UP"},[ButtonAction.ACTION_MENUDOWN]={"KEY_DOWN"},
        [ButtonAction.ACTION_MENULEFT]={"KEY_LEFT"},[ButtonAction.ACTION_MENURIGHT]={"KEY_RIGHT"},
        [ButtonAction.ACTION_MENUCONFIRM]={"KEY_ENTER","KEY_KP_ENTER","KEY_SPACE"},
        [ButtonAction.ACTION_MENUBACK]={"KEY_ESCAPE"},[ButtonAction.ACTION_PAUSE]={"KEY_ESCAPE"},
      }
      for _,name in ipairs(keys[action] or {}) do
        local code=Keyboard[name]
        if code and Input.IsButtonPressed(code,0) then return false end
      end
      return
    end
  end
end
local callbacks={
 MC_POST_SAVESLOT_LOAD="onSaveSlotLoaded",
 MC_POST_GAME_STARTED="onGameStarted",MC_PRE_GAME_EXIT="onPreGameExit",MC_PRE_UPDATE="onPreUpdate",MC_POST_UPDATE="onPostUpdate",
 MC_EVALUATE_CACHE="onEvaluateCache",MC_POST_FIRE_TEAR="onPostFireTear",MC_POST_NEW_ROOM="onPostNewRoom",
 MC_PRE_SPAWN_CLEAN_AWARD="onPreSpawnCleanAward",MC_ENTITY_TAKE_DMG="onEntityTakeDamage",
 MC_POST_NEW_LEVEL="onPostNewLevel",MC_POST_ADD_COLLECTIBLE="onPostAddCollectible",MC_POST_RENDER="onPostRender",
 MC_PRE_HISTORYHUD_RENDER="onPreHistoryHudRender",MC_POST_HISTORYHUD_RENDER="onPostHistoryHudRender",MC_POST_ENTITY_KILL="onPostEntityKill",
  MC_POST_PAUSE_SCREEN_RENDER="onPostPauseScreenRender",
  MC_INPUT_ACTION="onInputAction",
 MC_PRE_TEAR_COLLISION="onPreTearCollision",MC_PRE_PLAYER_COLLISION="onPrePlayerCollision",
 MC_FAMILIAR_UPDATE="onFamiliarUpdate",MC_POST_TEAR_UPDATE="onPostTearUpdate",
 MC_POST_FIRE_BOMB="onPostFireBomb",MC_POST_LASER_UPDATE="onPostLaserUpdate",
 MC_POST_KNIFE_UPDATE="onPostKnifeUpdate",MC_PRE_PROJECTILE_COLLISION="onPreProjectileCollision",
 MC_POST_ENTITY_REMOVE="onPostEntityRemove",
 MC_POST_PICKUP_INIT="onPickupInit",MC_POST_PICKUP_UPDATE="onPickupUpdate",MC_EXECUTE_CMD="onExecuteCmd",
 MC_PRE_USE_ITEM="onPreUseItem",MC_USE_ITEM="onUseItem",
 MC_POST_ENTITY_TAKE_DMG="onPostEntityTakeDamage",
 MC_POST_BOMB_UPDATE="onPostBombUpdate",MC_USE_PILL="onUsePill",MC_USE_CARD="onUseCard",
 MC_POST_PLAYER_DEATH="onPostPlayerDeath",
 MC_POST_PLAYER_INIT="onPostPlayerInit",MC_PRE_PICKUP_COLLISION="onPrePickupCollision",
 MC_POST_PICKUP_COLLISION="onPostPickupCollision",
}
for callback,method in pairs(callbacks) do if ModCallbacks[callback] then Demo:AddCallback(ModCallbacks[callback],Demo[method]) end end
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_RENDER,Demo.onPickupRender,PickupVariant.PICKUP_COLLECTIBLE)
Isaac.DebugString("[Live Sprite Swap Demo] v1.14.1 loaded; AIsaac replaces non-quest collectibles with quality-matched Generators")

local Demo = RegisterMod("Live Sprite Swap Demo", 1)
local bridgeJson = require("json")
local promptUi = include("nebius_prompt").new(bridgeJson)
local ids, slotById = {}, {}
for slot = 0, 63 do
  local id = Isaac.GetItemIdByName(string.format("Generated Passive %02d", slot))
  ids[slot+1], slotById[id] = id, slot+1
end
local records, runtime, usedArt, accepted = {}, {}, {}, {}
local session = tostring(Random()) .. "_" .. tostring(Isaac.GetTime())
local serial, runToken, running, blocked = 0, nil, false, nil
local pendingProfileEnvelope, lastPollTime, lastStateTime = nil, -999, -999
local statusText, statusUntil = "", 0
local function playProfileSound() end
local function showStatus(message)
  statusText, statusUntil = message, Game():GetFrameCount()+240
  Isaac.DebugString("[Live Sprite Swap Demo] " .. message)
end
local function flagFromName(name)
  local flags = {
    homing = TearFlags.TEAR_HOMING, spectral = TearFlags.TEAR_SPECTRAL,
    piercing = TearFlags.TEAR_PIERCING, poison = TearFlags.TEAR_POISON,
    burn = TearFlags.TEAR_BURN, slow = TearFlags.TEAR_SLOW,
    fear = TearFlags.TEAR_FEAR, charm = TearFlags.TEAR_CHARM,
    bounce = TearFlags.TEAR_BOUNCE, split = TearFlags.TEAR_SPLIT,
    orbit = TearFlags.TEAR_ORBIT, glow = TearFlags.TEAR_GLOW,
  }
  return flags[name] or 0
end

-- The native bridge delivers JSON data only. This fixed validator deliberately
-- mirrors the Stage 2B contract; no model-provided Lua or paths are executed.
local triggers = { room_enter = true, room_clear = true, enemy_hit = true, player_hurt = true, pickup = true, new_floor = true, tear_fire = true }
local conditions = { chance = true, once_per_room = true, once_per_floor = true }
local actions = { spawn_pickup = true, grant_soul_hearts = true }
local pickups = { coin = true, key = true, bomb = true, heart = true }
local tearFlagsByName = { homing = true, spectral = true, piercing = true, poison = true, burn = true, slow = true, fear = true, charm = true, bounce = true, split = true, orbit = true, glow = true }
local familiarTypes = { sentry = true, melee = true, normal = true, shield = true }
local rangedFamiliars = { sentry = true, normal = true }
local familiarPatterns = { single = true, fan = true, lob = true, varied = true }
local statBounds = {
  damage = {-10, 15}, tears = {-5, 10}, shot_speed = {-1, 1.5}, range = {-10, 20},
  speed = {-1, 0.5}, luck = {-5, 10}, soul_hearts = {0, 4},
}

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

local function validateProfile(profile, id)
  if not text(id,1,100) then return false, "request identity" end
  if not allowedKeys(profile, { version = true, generated_at = true, bridge_request_id = true, metadata = true, stats = true, tear_profile = true, visuals = true, rules = true, familiar = true, aura = true, sprite_sheet = true, familiar_sprite_sheet = true }) then return false, "profile keys" end
  if profile.version ~= 1 or profile.bridge_request_id ~= id or not text(profile.generated_at, 1, 64) or not text(profile.sprite_sheet, 1, 256) or not profile.sprite_sheet:match("^gfx/items/collectibles/generated_slot_[0-9][0-9]%.png$") then return false, "profile identity" end
  local metadata = profile.metadata
  if not allowedKeys(metadata, { display_name = true, description = true, quality = true, theme = true, balance_note = true }) then return false, "metadata keys" end
  if not text(metadata.display_name, 1, 32) then return false, "metadata display name" end
  if not text(metadata.description, 1, 64) then return false, "metadata description" end
  if not number(metadata.quality, 0, 4, true) then return false, "metadata quality" end
  if not ({ cursed = true, angelic = true, tech = true, gross = true, cosmic = true, none = true })[metadata.theme] then return false, "metadata theme" end
  if not text(metadata.balance_note, 0, 256) then return false, "metadata balance note" end
  if not allowedKeys(profile.stats, { damage = true, tears = true, shot_speed = true, range = true, speed = true, luck = true, soul_hearts = true }) then return false, "stat keys" end
  for name, bounds in pairs(statBounds) do if not number(profile.stats[name], bounds[1], bounds[2], name == "soul_hearts") then return false, "stat " .. name end end
  local tear = profile.tear_profile
  if not allowedKeys(tear, { flags = true, color = true, scale = true }) or not array(tear.flags, 0, 3) or not number(tear.scale, 0.5, 2, false) then return false, "tear profile" end
  for _, flag in ipairs(tear.flags) do if not tearFlagsByName[flag] then return false, "tear flag" end end
  if not allowedKeys(tear.color, { r = true, g = true, b = true, a = true }) then return false, "tear color keys" end
  for _, channel in ipairs({ "r", "g", "b", "a" }) do if not number(tear.color[channel], 0, 1, false) then return false, "tear color" end end
  if not allowedKeys(profile.visuals, { pedestal_prompt = true }) or not text(profile.visuals.pedestal_prompt, 1, 500) or not array(profile.rules, 0, 2) then return false, "visuals or rules" end
  if profile.familiar~=nil then
    local familiar=profile.familiar
    if not allowedKeys(familiar,{type=true,damage=true,cooldown=true,range=true,sprite_prompt=true,attack=true}) or not familiarTypes[familiar.type] or not number(familiar.damage,0.5,3,false) or not number(familiar.cooldown,15,90,true) or not number(familiar.range,80,320,false) or not text(familiar.sprite_prompt,1,500) then return false,"familiar" end
    if rangedFamiliars[familiar.type] then
      if not validFamiliarAttack(familiar.attack) then return false,"familiar attack" end
    elseif familiar.attack~=nil then return false,"familiar attack" end
    if not text(profile.familiar_sprite_sheet,1,256) or not profile.familiar_sprite_sheet:match("^gfx/items/collectibles/generated_familiar_slot_[0-9][0-9]%.png$") then return false,"familiar sprite" end
  elseif profile.familiar_sprite_sheet~=nil then return false,"unexpected familiar sprite" end
  if profile.aura~=nil then
    local aura=profile.aura
    if not allowedKeys(aura,{type=true,damage=true,radius=true,cooldown=true}) or aura.type~="damage" or not number(aura.damage,0.25,2,false) or not number(aura.radius,50,180,false) or not number(aura.cooldown,15,90,true) then return false,"aura" end
  end
  for _, rule in ipairs(profile.rules) do
    if not allowedKeys(rule, { trigger = true, conditions = true, actions = true }) or not triggers[rule.trigger] or not array(rule.conditions, 0, 2) or not array(rule.actions, 1, 2) then return false, "rule" end
    for _, condition in ipairs(rule.conditions) do if not allowedKeys(condition, { type = true, chance = true }) or not conditions[condition.type] or (condition.type == "chance" and not number(condition.chance, 0, 1, false)) then return false, "condition" end end
    for _, action in ipairs(rule.actions) do if not allowedKeys(action, { type = true, amount = true, pickup_type = true }) or not actions[action.type] or not number(action.amount, 1, 4, true) or (action.type == "spawn_pickup" and not pickups[action.pickup_type]) then return false, "action" end end
  end
  return true
end


local function makeProfile(generated)
  local metadata, stats, tear = generated.metadata, generated.stats, generated.tear_profile
  local tearFlags = 0
  for _, name in ipairs(tear.flags or {}) do
    tearFlags = tearFlags | flagFromName(name)
  end
  local profiles = {}
  profiles[4] = {
    name = metadata.display_name or "Generated Item",
    description = metadata.description or "",
    spriteSheet = generated.sprite_sheet or "gfx/items/collectibles/generated_item.png",
    tearColor = Color((tear.color or {}).r or 1, (tear.color or {}).g or 1, (tear.color or {}).b or 1, (tear.color or {}).a or 1, 0, 0, 0),
    tearFlag = tearFlags, tearScale = tear.scale, soundName = "LIVE PROFILE EMBER",
    damage = stats.damage or 0, fireDelay = -(stats.tears or 0),
    range = stats.range or 0, luck = stats.luck or 0,
    shotSpeed = stats.shot_speed or 0, speed = stats.speed or 0,
    soulHearts = stats.soul_hearts or 0, rules = generated.rules or {}, familiar = generated.familiar, aura = generated.aura,
    familiarSpriteSheet = generated.familiar_sprite_sheet, familiarEntities = {}, ruleState = {},
  }
  return profiles[4]
end

local function owned(player,index)
  return player and ids[index]>0 and player:HasCollectible(ids[index])
end
local function saveRun()
  if blocked then return false end
  local states={}
  for index,profile in ipairs(runtime) do states[index]=profile.ruleState end
  local ok,err=pcall(function()
    Demo:SaveData(bridgeJson.encode({version=2,records=records,ruleStates=states}))
  end)
  if not ok then blocked="Could not save generated items: "..tostring(err); showStatus(blocked) end
  return ok
end
local function capacity()
  if blocked then return blocked end
  if not running then return "Start or continue a run before generating." end
  if #records>=64 then return "Item limit reached: 64/64. Finish this run to free item slots." end
  local count=0
  for _ in pairs(usedArt) do count=count+1 end
  if count>=64 then return "Artwork limit reached: 64/64. Restart Isaac; continued-run artwork stays reserved." end
  for _,id in ipairs(ids) do if id<=0 then return "Generated IDs missing. Install updated mod and restart Isaac." end end
end
local function context()
  local slots={}
  for slot=0,63 do if usedArt[slot] then slots[#slots+1]=slot end end
  return {session=session,run=runToken,used=slots,count=#records,blocked=capacity(),runtime_contract=6}
end
promptUi.getContext=context
local function publishState()
  if not running then return end
  Isaac.DebugString("[NebiusBridge] state "..bridgeJson.encode(context()))
  lastStateTime=Isaac.GetTime()
end
local function reject(id,message)
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
    if text(envelope.id,1,100) and text(envelope.detail,1,500) then promptUi:receive(envelope.id,envelope.status,envelope.detail) end
    return
  end
  if not allowedKeys(envelope,{version=true,type=true,id=true,profile=true}) or envelope.version~=1 or envelope.type~="profile" or not text(envelope.id,1,100) then return end
  if accepted[envelope.id] then pcall(NebiusBridge.Ack,envelope.id); return end
  if envelope.id:sub(1,#runToken+1)~=runToken.."_" then reject(envelope.id,"Rejected item from another run."); return end
  local valid,reason=validateProfile(envelope.profile, envelope.id)
  if not valid then reject(envelope.id,"Profile rejected: "..reason); return end
  if not allowApply then pendingProfileEnvelope=envelope; return end
  local full=capacity()
  if full then reject(envelope.id,full); return end
  local slot=tonumber(envelope.profile.sprite_sheet:match("generated_slot_(%d%d)"))
  if not slot or slot>=64 or usedArt[slot] then reject(envelope.id,"Artwork slot invalid or reserved."); return end
  local index=#records+1
  local player=Isaac.GetPlayer(0)
  local position=Game():GetRoom():FindFreePickupSpawnPosition(player.Position+Vector(80,0),0,true)
  local entity=Isaac.Spawn(EntityType.ENTITY_PICKUP,PickupVariant.PICKUP_COLLECTIBLE,ids[index],position,Vector.Zero,nil)
  local pickup=entity and entity:ToPickup()
  if not pickup then reject(envelope.id,"Could not spawn item."); return end
  records[index],runtime[index]=envelope.profile,makeProfile(envelope.profile)
  usedArt[slot]=true
  if not saveRun() then
    if pickup.Remove then pickup:Remove() end
    reject(envelope.id,blocked); return
  end
  accepted[envelope.id]=true
  promptUi:receive(envelope.id,"accepted","Accepted: "..runtime[index].name.." ("..#records.."/64)")
  local ackOk,queued=pcall(NebiusBridge.Ack,envelope.id)
  showStatus("PROFILE ACCEPTED: "..runtime[index].name.."; pedestal spawned; "..(ackOk and queued and "ACK queued" or "ACK unavailable"))
  publishState()
end
function Demo:onGameStarted(isContinued)
  records,runtime,accepted={},{},{}
  pendingProfileEnvelope,blocked,promptUi.pending=nil,nil,nil
  serial=serial+1; runToken=session.."_"..serial; running=true
  if isContinued then
    local ok,saved=pcall(function()
      if not self:HasData() then error("Missing save") end
      return bridgeJson.decode(self:LoadData())
    end)
    if not ok or type(saved)~="table" or saved.version~=2 or not array(saved.records,0,64) or type(saved.ruleStates)~="table" then
      blocked="Generated-item save missing or invalid. Generation blocked to protect this run."
    else
      local restored={}
      for index,record in ipairs(saved.records) do
        local valid=type(record)=="table" and validateProfile(record,record.bridge_request_id)
        local slot=valid and tonumber(record.sprite_sheet:match("generated_slot_(%d%d)"))
        local state=saved.ruleStates[index] or {}
        if not valid or not slot or slot>=64 or restored[slot] or type(state)~="table" then blocked="Invalid generated-item save."; break end
        for key,value in pairs(state) do if not text(key,1,200) or value~=true then blocked="Invalid saved rule state."; break end end
        if blocked then break end
        restored[slot],usedArt[slot]=true,true
        records[index],runtime[index]=record,makeProfile(record)
        runtime[index].ruleState=state; accepted[record.bridge_request_id]=true
      end
    end
  else saveRun() end
  if blocked then records,runtime,accepted={},{},{}; showStatus(blocked) end
  for p=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(p)
    player:AddCacheFlags(CacheFlag.CACHE_DAMAGE|CacheFlag.CACHE_FIREDELAY|CacheFlag.CACHE_RANGE|CacheFlag.CACHE_LUCK|CacheFlag.CACHE_SHOTSPEED|CacheFlag.CACHE_SPEED)
    player:EvaluateItems()
  end
  publishState()
end
function Demo:onPreGameExit(shouldSave)
  if shouldSave and running then saveRun() end
  running=false; pendingProfileEnvelope,promptUi.pending=nil,nil
  Isaac.DebugString("[NebiusBridge] state "..bridgeJson.encode(context()))
end
function Demo:onPostUpdate()
  promptUi:updateInput(); pollNativeProfile(true); self:updatePassiveEffects()
  if running and Isaac.GetTime()-lastStateTime>1000 then publishState() end
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
  return entities[1]
end
local function hurtEnemy(entity, amount, source)
  if entity and entity.TakeDamage then pcall(entity.TakeDamage,entity,amount,0,EntityRef(source),0) end
end
local function withinDistance(origin, target, radius)
  if not origin or not target then return false end
  local dx,dy=(target.X or 0)-(origin.X or 0),(target.Y or 0)-(origin.Y or 0)
  return dx*dx+dy*dy<=radius*radius
end
local function stepToward(familiar, target, speed, stopDistance)
  local dx,dy=target.X-familiar.Position.X,target.Y-familiar.Position.Y
  local length=math.sqrt(dx*dx+dy*dy)
  if length<=stopDistance or length<0.01 then return end
  local step=math.min(speed, length-stopDistance)
  familiar.Position=familiar.Position+Vector(dx/length*step,dy/length*step)
end
local function shieldPosition(player, profile, frame)
  local threat=nearestEnemy(player.Position, profile.familiar.range)
  local angle
  if threat and threat.Position then angle=math.atan(threat.Position.Y-player.Position.Y, threat.Position.X-player.Position.X)
  else angle=(frame%360)*math.pi/180 end
  return player.Position+Vector(math.cos(angle)*20, math.sin(angle)*20)
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
  local key=tostring(player.InitSeed)
  for index,profile in ipairs(runtime) do
    if owned(player,index) and profile.familiar and profile.familiar.type=="shield" then
      local familiar=profile.familiarEntities[key]
      if entityAlive(familiar) and frame>=(profile.shieldReadyFrame or 0) then return profile end
    end
  end
end
local function trailPosition(profile, key, player, index)
  profile.trails=profile.trails or {}
  local trail=profile.trails[key]
  if not trail then trail={}; profile.trails[key]=trail end
  trail[#trail+1]={X=player.Position.X,Y=player.Position.Y}
  local delay=10+(index-1)*8
  while #trail>delay do table.remove(trail,1) end
  local anchor=trail[1]
  return Vector(anchor.X, anchor.Y+20+(index-1)*10)
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
function Demo:updatePassiveEffects()
  if not running or blocked then return end
  local frame=Game():GetFrameCount()
  for p=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(p); local key=tostring(player.InitSeed)
    for index,profile in ipairs(runtime) do if owned(player,index) then
      if profile.familiar then
        local familiar=profile.familiarEntities[key]
        if not entityAlive(familiar) then
          local ok,spawned=pcall(Isaac.Spawn,EntityType.ENTITY_FAMILIAR,FamiliarVariant.PUNCHING_BAG,0,player.Position,Vector.Zero,player)
          familiar=ok and spawned and spawned:ToFamiliar() or nil
          if familiar then
            familiar.Visible=false; familiar:GetData().generatedFamiliarIndex=index; profile.familiarEntities[key]=familiar
          end
        end
        if familiar then
          local mode=profile.familiar.type
          local cooldown=profile.familiar.cooldown or 30
          if mode=="sentry" then
            local angle=(frame%360)*math.pi/180+index
            familiar.Position=player.Position+Vector(math.cos(angle)*28,math.sin(angle)*28)
          elseif mode=="melee" then
            local quarry=nearestEnemy(player.Position,profile.familiar.range)
            if quarry and quarry.Position then stepToward(familiar,quarry.Position,8,16)
            else familiar.Position=player.Position+Vector(16,12) end
          elseif mode=="shield" then
            familiar.Position=shieldPosition(player,profile,frame)
            blockShots(familiar)
          else
            familiar.Position=trailPosition(profile,key,player,index)
          end
          if frame%cooldown==0 then
            if mode=="melee" or mode=="shield" then contactStrike(familiar,profile,player)
            else
              local target=nearestEnemy(familiar.Position,profile.familiar.range)
              if not fireRangedVolley(familiar,target,profile) then hurtEnemy(target,profile.familiar.damage,player) end
            end
          end
        end
      end
      if profile.aura and frame%(profile.aura.cooldown or 30)==0 and Isaac.FindInRadius and EntityPartition then
        local ok,entities=pcall(Isaac.FindInRadius,player.Position,profile.aura.radius,EntityPartition.ENEMY)
        if ok and type(entities)=="table" then for _,enemy in ipairs(entities) do hurtEnemy(enemy,profile.aura.damage,player) end end
      end
    end end
  end
end
function Demo:onEvaluateCache(player,cacheFlag)
  local total={damage=0,fireDelay=0,range=0,luck=0,shotSpeed=0,speed=0}
  for index,profile in ipairs(runtime) do
    if owned(player,index) then
      local count=player.GetCollectibleNum and player:GetCollectibleNum(ids[index]) or 1
      for key in pairs(total) do total[key]=total[key]+profile[key]*count end
    end
  end
  if cacheFlag==CacheFlag.CACHE_DAMAGE then player.Damage=player.Damage+total.damage
  elseif cacheFlag==CacheFlag.CACHE_FIREDELAY then player.MaxFireDelay=math.max(0.5,player.MaxFireDelay+total.fireDelay)
  elseif cacheFlag==CacheFlag.CACHE_RANGE then player.TearRange=player.TearRange+total.range
  elseif cacheFlag==CacheFlag.CACHE_LUCK then player.Luck=player.Luck+total.luck
  elseif cacheFlag==CacheFlag.CACHE_SHOTSPEED then player.ShotSpeed=player.ShotSpeed+total.shotSpeed
  elseif cacheFlag==CacheFlag.CACHE_SPEED then player.MoveSpeed=player.MoveSpeed+total.speed end
end
local function ruleMayRun(profile, rule, ruleIndex, player)
  local roomIndex = Game():GetLevel():GetCurrentRoomIndex()
  local floorIndex = Game():GetLevel():GetAbsoluteStage()
  profile.ruleState = profile.ruleState or {}
  local prefix = tostring(player.InitSeed) .. ":" .. tostring(ruleIndex) .. ":" .. tostring(floorIndex) .. ":"
  local pendingKeys = {}
  for _, condition in ipairs(rule.conditions or {}) do
    if condition.type == "chance" and math.random() > (condition.chance or 0) then
      return false
    elseif condition.type == "once_per_room" then
      local key = prefix .. "room:" .. tostring(roomIndex)
      if profile.ruleState[key] then return false end
      pendingKeys[#pendingKeys + 1] = key
    elseif condition.type == "once_per_floor" then
      local key = prefix .. "floor"
      if profile.ruleState[key] then return false end
      pendingKeys[#pendingKeys + 1] = key
    end
  end
  for _, key in ipairs(pendingKeys) do profile.ruleState[key] = true end
  return true
end

local function runOneRuleSet(triggerName, player, profile)
  for ruleIndex, rule in ipairs(profile.rules or {}) do
    if rule.trigger == triggerName and ruleMayRun(profile, rule, ruleIndex, player) then
      for _, action in ipairs(rule.actions or {}) do
        if action.type == "grant_soul_hearts" then
          player:AddSoulHearts(action.amount or 1)
        elseif action.type == "spawn_pickup" then
          local variantByName = {
            coin = PickupVariant.PICKUP_COIN, key = PickupVariant.PICKUP_KEY,
            bomb = PickupVariant.PICKUP_BOMB, heart = PickupVariant.PICKUP_HEART,
          }
          local variant = variantByName[action.pickup_type]
          if variant then
            for count = 1, action.amount or 1 do
              local position = Game():GetRoom():FindFreePickupSpawnPosition(player.Position, 0, true)
              Isaac.Spawn(EntityType.ENTITY_PICKUP, variant, 0, position, Vector.Zero, player)
            end
          end
        end
      end
      playProfileSound(profile, 0.45)
    end
  end
end


local function runProfileRules(trigger,player)
  if not running or blocked then return end
  for index,profile in ipairs(runtime) do if owned(player,index) then runOneRuleSet(trigger,player,profile) end end
end
function Demo:onPostFireTear(tear)
  local player=tear.SpawnerEntity and tear.SpawnerEntity:ToPlayer()
  if not player then return end
  local scale=1
  for index,profile in ipairs(runtime) do
    if owned(player,index) then
      tear.TearFlags=tear.TearFlags|profile.tearFlag
      scale=scale*profile.tearScale; tear.Color=profile.tearColor
    end
  end
  tear.Scale=tear.Scale*math.max(0.5,math.min(2,scale))
  runProfileRules("tear_fire",player)
end
local function forPlayers(trigger)
  for p=0,Game():GetNumPlayers()-1 do runProfileRules(trigger,Isaac.GetPlayer(p)) end
end
function Demo:onPostNewRoom() forPlayers("room_enter"); if running then saveRun() end end
function Demo:onPreSpawnCleanAward() forPlayers("room_clear") end
function Demo:onPostNewLevel() forPlayers("new_floor") end
function Demo:onEntityTakeDamage(entity,_,_,source)
  local player=entity:ToPlayer()
  if player then
    local frame=Game():GetFrameCount()
    local shield=readyShield(player, frame)
    if shield then
      shield.shieldReadyFrame=frame+(shield.familiar.cooldown or 30)
      return false
    end
    runProfileRules("player_hurt",player)
    return
  end
  local tear=source and source.Entity and source.Entity:ToTear()
  local owner=tear and tear.SpawnerEntity and tear.SpawnerEntity:ToPlayer()
  if owner then runProfileRules("enemy_hit",owner) end
end
function Demo:onPostAddCollectible(collectibleType,_,firstTime,_,_,player)
  local index=slotById[collectibleType]
  local profile=index and runtime[index]
  if profile and firstTime~=false then player:AddSoulHearts(profile.soulHearts); runProfileRules("pickup",player) end
end
function Demo:onPostRender()
  pollNativeProfile(false); promptUi:render()
  for _,profile in ipairs(runtime) do
    local nativePedestalSheet=profile.spriteSheet
    if not profile.image and not profile.loadFailed and Renderer and SourceQuad then
      local ok,image=pcall(Renderer.LoadImage, nativePedestalSheet)
      local quadOk,quad=pcall(SourceQuad.NewFromRectangle, Vector(0, 0), 32, 32, false)
      if ok and image and quadOk and quad then
        profile.image,profile.quad=image,quad
        Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_ART_READY "..nativePedestalSheet)
      else profile.loadFailed=true; Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_ART_FALLBACK "..nativePedestalSheet) end
    end
    if profile.familiar and not profile.familiarImage and not profile.familiarLoadFailed and Renderer and SourceQuad then
      local ok,image=pcall(Renderer.LoadImage,profile.familiarSpriteSheet)
      local quadOk,quad=pcall(SourceQuad.NewFromRectangle,Vector(0,0),32,32,false)
      if ok and image and quadOk and quad then profile.familiarImage,profile.familiarQuad=image,quad
      else profile.familiarLoadFailed=true; Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_FAMILIAR_ART_FALLBACK "..tostring(profile.familiarSpriteSheet)) end
    end
    if profile.familiarImage and DestinationQuad then
      for _,familiar in pairs(profile.familiarEntities or {}) do if entityAlive(familiar) then
        local position=Isaac.WorldToScreen(familiar.Position+familiar.PositionOffset)+Vector(-4,-4)
        local ok,destination=pcall(DestinationQuad.NewFromRectangle,position,8,8)
        if ok and destination then pcall(function() profile.familiarImage:Render(profile.familiarQuad,destination,KColor(1,1,1,1)) end) end
      end end
    end
  end
  if statusUntil>=Game():GetFrameCount() then Isaac.RenderText(statusText,38,38,1,0.85,0.2,1) end
end
function Demo:onPickupRender(pickup)
  local index=slotById[pickup.SubType]
  local profile=index and runtime[index]
  if not profile or not profile.image or not DestinationQuad then return end
  local nativePedestalImage=profile.image
  local sprite=pickup:GetSprite()
  local ok,layer=pcall(sprite.GetLayer,sprite,1)
  if ok and layer then layer:SetVisible(false) end
  local bob=math.sin(Game():GetFrameCount()*0.2)*3
  local position=Isaac.WorldToScreen(pickup.Position+pickup.PositionOffset)+Vector(-16,-48+bob)
  local good,destination=pcall(DestinationQuad.NewFromRectangle,position,32,32)
  if good and destination then pcall(function() nativePedestalImage:Render(profile.quad,destination,KColor(1,1,1,1)) end) end
end
function Demo:onPostHudRender()
  local player=Isaac.GetPlayer(0)
  local count=0
  for index,profile in ipairs(runtime) do
    if owned(player,index) and profile.image and DestinationQuad then
      local position=Vector(Isaac.GetScreenWidth()-148+(count%8)*16,108+math.floor(count/8)*16)
      local ok,destination=pcall(DestinationQuad.NewFromRectangle,position,16,16)
      if ok and destination then pcall(function() profile.image:Render(profile.quad,destination,KColor(1,1,1,1)) end) end
      count=count+1
    end
  end
end
local callbacks={
 MC_POST_GAME_STARTED="onGameStarted",MC_PRE_GAME_EXIT="onPreGameExit",MC_POST_UPDATE="onPostUpdate",
 MC_EVALUATE_CACHE="onEvaluateCache",MC_POST_FIRE_TEAR="onPostFireTear",MC_POST_NEW_ROOM="onPostNewRoom",
 MC_PRE_SPAWN_CLEAN_AWARD="onPreSpawnCleanAward",MC_ENTITY_TAKE_DMG="onEntityTakeDamage",
 MC_POST_NEW_LEVEL="onPostNewLevel",MC_POST_ADD_COLLECTIBLE="onPostAddCollectible",MC_POST_RENDER="onPostRender",
 MC_POST_HUD_RENDER="onPostHudRender",
}
for callback,method in pairs(callbacks) do Demo:AddCallback(ModCallbacks[callback],Demo[method]) end
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_RENDER,Demo.onPickupRender,PickupVariant.PICKUP_COLLECTIBLE)
Isaac.DebugString("[Live Sprite Swap Demo] v1.9.0 loaded; 64 passive shells, composed familiar attacks")

local Demo = RegisterMod("Live Sprite Swap Demo", 1)

-- This ID is allocated once when content/items.xml is loaded at game startup.
-- Only its presentation and Lua-managed behavior change during a run.
local ITEM_NAME = "Live Profile Core"
local CUSTOM_ITEM_ID = Isaac.GetItemIdByName(ITEM_NAME)

local profiles = {
  {
    name = "Ember", spriteSheet = "gfx/items/collectibles/ember_orb.png",
    tearColor = Color(1, 0.35, 0.15, 1, 0, 0, 0),
    tearFlag = TearFlags.TEAR_BURN, soundName = "LIVE PROFILE EMBER",
    damage = 0.75, fireDelay = 0, range = 0, luck = 0, shotSpeed = 0, speed = 0, soulHearts = 0, rules = {}, ruleState = {},
  },
  {
    name = "Verdant", spriteSheet = "gfx/items/collectibles/verdant_orb.png",
    tearColor = Color(0.25, 1, 0.45, 1, 0, 0, 0),
    tearFlag = TearFlags.TEAR_POISON, soundName = "LIVE PROFILE VERDANT",
    damage = 0, fireDelay = -1, range = 0, luck = 0, shotSpeed = 0, speed = 0, soulHearts = 0, rules = {}, ruleState = {},
  },
  {
    name = "Void", spriteSheet = "gfx/items/collectibles/void_orb.png",
    tearColor = Color(0.65, 0.35, 1, 1, 0, 0, 0),
    tearFlag = TearFlags.TEAR_FEAR, soundName = "LIVE PROFILE VOID",
    damage = 0, fireDelay = 0, range = 40, luck = 2, shotSpeed = 0, speed = 0, soulHearts = 0, rules = {}, ruleState = {},
  },
}

local ALL_PROFILE_CACHE_FLAGS = CacheFlag.CACHE_DAMAGE
  | CacheFlag.CACHE_FIREDELAY
  | CacheFlag.CACHE_RANGE
  | CacheFlag.CACHE_LUCK
  | CacheFlag.CACHE_SHOTSPEED
  | CacheFlag.CACHE_SPEED

local activeProfileIndex = 1
local demoPickupStates = {}
local hudItemSprite = Sprite()
local hudProfileIndex = nil
local sfx = SFXManager()
local lastTearSoundFrame = -999
local statusText = "AGENT: native IPC ready - submit a profile with npm run ipc:generate"
local statusUntil = 0
local selectProfile
local runProfileRules
local showStatus
local bridgeJson = nil
local lastPollTime = -999
local pendingProfileEnvelope = nil
local nativePedestalImage = nil
local nativePedestalSheet = nil
local nativePedestalSourceQuad = nil
local nativePedestalLoadFailed = false

do
  local jsonOk, jsonModule = pcall(require, "json")
  if jsonOk then
    bridgeJson = jsonModule
  end
end

local promptUi = include("nebius_prompt").new(bridgeJson)

local function getActiveProfile()
  return profiles[activeProfileIndex]
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

local function validateProfile(profile, id)
  if not allowedKeys(profile, { version = true, generated_at = true, bridge_request_id = true, metadata = true, stats = true, tear_profile = true, visuals = true, rules = true, sprite_sheet = true }) then return false, "profile keys" end
  if profile.version ~= 1 or profile.bridge_request_id ~= id or not text(profile.generated_at, 1, 64) or not text(profile.sprite_sheet, 1, 256) or not profile.sprite_sheet:match("^gfx/items/collectibles/generated_slot_[0-9][0-9]%.png$") then return false, "profile identity" end
  local metadata = profile.metadata
  if not allowedKeys(metadata, { display_name = true, description = true, quality = true, theme = true, balance_note = true }) or not text(metadata.display_name, 1, 32) or not text(metadata.description, 1, 64) or not number(metadata.quality, 0, 4, true) or not ({ cursed = true, angelic = true, tech = true, gross = true, cosmic = true, none = true })[metadata.theme] or not text(metadata.balance_note, 0, 256) then return false, "metadata" end
  if not allowedKeys(profile.stats, { damage = true, tears = true, shot_speed = true, range = true, speed = true, luck = true, soul_hearts = true }) then return false, "stat keys" end
  for name, bounds in pairs(statBounds) do if not number(profile.stats[name], bounds[1], bounds[2], name == "soul_hearts") then return false, "stat " .. name end end
  local tear = profile.tear_profile
  if not allowedKeys(tear, { flags = true, color = true, scale = true }) or not array(tear.flags, 0, 3) or not number(tear.scale, 0.5, 2, false) then return false, "tear profile" end
  for _, flag in ipairs(tear.flags) do if not tearFlagsByName[flag] then return false, "tear flag" end end
  if not allowedKeys(tear.color, { r = true, g = true, b = true, a = true }) then return false, "tear color keys" end
  for _, channel in ipairs({ "r", "g", "b", "a" }) do if not number(tear.color[channel], 0, 1, false) then return false, "tear color" end end
  if not allowedKeys(profile.visuals, { pedestal_prompt = true }) or not text(profile.visuals.pedestal_prompt, 1, 500) or not array(profile.rules, 0, 2) then return false, "visuals or rules" end
  for _, rule in ipairs(profile.rules) do
    if not allowedKeys(rule, { trigger = true, conditions = true, actions = true }) or not triggers[rule.trigger] or not array(rule.conditions, 0, 2) or not array(rule.actions, 1, 2) then return false, "rule" end
    for _, condition in ipairs(rule.conditions) do if not allowedKeys(condition, { type = true, chance = true }) or not conditions[condition.type] or (condition.type == "chance" and not number(condition.chance, 0, 1, false)) then return false, "condition" end end
    for _, action in ipairs(rule.actions) do if not allowedKeys(action, { type = true, amount = true, pickup_type = true }) or not actions[action.type] or not number(action.amount, 1, 4, true) or (action.type == "spawn_pickup" and not pickups[action.pickup_type]) then return false, "action" end end
  end
  return true
end

local function applyGeneratedProfile(generated)
  local metadata, stats, tear = generated.metadata, generated.stats, generated.tear_profile
  local tearFlags = 0
  for _, name in ipairs(tear.flags or {}) do
    tearFlags = tearFlags | flagFromName(name)
  end
  profiles[4] = {
    name = metadata.display_name or "Generated Item",
    description = metadata.description or "",
    spriteSheet = generated.sprite_sheet or "gfx/items/collectibles/generated_item.png",
    tearColor = Color((tear.color or {}).r or 1, (tear.color or {}).g or 1, (tear.color or {}).b or 1, (tear.color or {}).a or 1, 0, 0, 0),
    tearFlag = tearFlags, tearScale = tear.scale, soundName = "LIVE PROFILE EMBER",
    damage = stats.damage or 0, fireDelay = -(stats.tears or 0),
    range = stats.range or 0, luck = stats.luck or 0,
    shotSpeed = stats.shot_speed or 0, speed = stats.speed or 0,
    soulHearts = stats.soul_hearts or 0, rules = generated.rules or {}, ruleState = {},
  }
  profiles[4].soundId = Isaac.GetSoundIdByName(profiles[4].soundName)
  nativePedestalImage, nativePedestalSourceQuad = nil, nil
  nativePedestalSheet, nativePedestalLoadFailed = profiles[4].spriteSheet, false
  hudProfileIndex = nil
  selectProfile(4)
  showStatus("AGENT: accepted " .. profiles[4].name)
  return true
end

showStatus = function(message)
  statusText = message
  statusUntil = Game():GetFrameCount() + 240
  Isaac.DebugString("[Live Sprite Swap Demo] " .. message)
end

local function queueSheetApply(pickup, profileIndex, delayFrames)
  local data = pickup:GetData()
  data.liveProfileDemo = true
  data.profileIndex = profileIndex
  data.appliedProfileIndex = nil
  data.spriteApplyFrame = Game():GetFrameCount() + delayFrames
end

-- The normal Isaac HUD does not list passive collectibles. Render the item
-- art ourselves immediately below the minimap, using only layer 1 of the
-- standard collectible animation (the art layer, without the pedestal).
local function configureHudItemSprite(profileIndex)
  if hudProfileIndex == profileIndex then
    return
  end

  hudItemSprite:Load("gfx/005.100_collectible.anm2", true)
  hudItemSprite:ReplaceSpritesheet(1, profiles[profileIndex].spriteSheet)
  hudItemSprite:LoadGraphics()
  hudItemSprite:Play("Idle", true)
  hudItemSprite.Scale = Vector(0.5, 0.5)
  hudProfileIndex = profileIndex
end

local function playerHasDemoItem(player)
  return CUSTOM_ITEM_ID > 0 and player:HasCollectible(CUSTOM_ITEM_ID)
end

local function playProfileSound(profile, volume)
  local soundId = profile.soundId
  if soundId and soundId > 0 then
    sfx:Play(soundId, volume or 0.65, 0, false, 1)
  end
end

local function refreshAllPlayerStats()
  for playerIndex = 0, Game():GetNumPlayers() - 1 do
    local player = Isaac.GetPlayer(playerIndex)
    if player and playerHasDemoItem(player) then
      player:AddCacheFlags(ALL_PROFILE_CACHE_FLAGS)
      player:EvaluateItems()
    end
  end
end

local function spawnCustomPedestal()
  if CUSTOM_ITEM_ID <= 0 then
    showStatus("AGENT: custom item ID missing; restart Isaac after installing v1.0")
    return false
  end

  local player = Isaac.GetPlayer(0)
  if player == nil then
    showStatus("AGENT: no player; spawn skipped")
    return false
  end

  local room = Game():GetRoom()
  local position = room:FindFreePickupSpawnPosition(player.Position + Vector(80, 0), 0, true)
  local pickup = Isaac.Spawn(
    EntityType.ENTITY_PICKUP,
    PickupVariant.PICKUP_COLLECTIBLE,
    CUSTOM_ITEM_ID,
    position,
    Vector.Zero,
    nil
  ):ToPickup()

  if pickup == nil then
    showStatus("AGENT: custom pedestal creation failed")
    return false
  end

  demoPickupStates[pickup.InitSeed] = { profileIndex = activeProfileIndex }
  queueSheetApply(pickup, activeProfileIndex, 10)
  showStatus("AGENT: " .. getActiveProfile().name .. " pedestal ready")
  return true
end

local function switchAllDemoPedestals(profileIndex)
  for _, entity in ipairs(Isaac.FindByType(EntityType.ENTITY_PICKUP, PickupVariant.PICKUP_COLLECTIBLE, -1, false, false)) do
    local pickup = entity:ToPickup()
    local state = pickup and demoPickupStates[pickup.InitSeed]
    if state then
      state.profileIndex = profileIndex
      queueSheetApply(pickup, profileIndex, 0)
    end
  end
end

selectProfile = function(profileIndex)
  if not profiles[profileIndex] then
    return false
  end

  activeProfileIndex = profileIndex
  switchAllDemoPedestals(profileIndex)
  configureHudItemSprite(profileIndex)
  refreshAllPlayerStats()
  playProfileSound(getActiveProfile(), 0.9)
  showStatus("AGENT: " .. getActiveProfile().name .. " profile active")
  return true
end

local function pollNativeProfile(allowApply)
  if type(NebiusBridge) ~= "table" or type(NebiusBridge.Poll) ~= "function" or type(NebiusBridge.Ack) ~= "function" or not bridgeJson then return end
  local envelope = pendingProfileEnvelope
  if envelope then
    if not allowApply then return end
    pendingProfileEnvelope = nil
  else
    if Isaac.GetTime() - lastPollTime < 33 then return end
    lastPollTime = Isaac.GetTime()
    local pollOk, raw = pcall(NebiusBridge.Poll)
    if not pollOk then Isaac.DebugString("[Live Sprite Swap Demo] native Poll failed: " .. tostring(raw)); return end
    if raw == nil then return end
    local decodeOk, decoded = pcall(bridgeJson.decode, raw)
    if not decodeOk or type(decoded) ~= "table" then showStatus("AGENT: rejected malformed native bridge data"); return end
    envelope = decoded
  end
  if envelope.type == "hello" then return end
  if envelope.type == "status" then
    if allowedKeys(envelope, { version = true, type = true, id = true, status = true, detail = true }) and envelope.version == 1 and text(envelope.id, 1, 100) and (envelope.status == "generating" or envelope.status == "error") and text(envelope.detail, 1, 500) then
      promptUi:receive(envelope.id, envelope.status, envelope.detail)
    end
    return
  end
  if not allowedKeys(envelope, { version = true, type = true, id = true, profile = true }) or envelope.version ~= 1 or envelope.type ~= "profile" or not text(envelope.id, 1, 100) then showStatus("AGENT: rejected native IPC envelope"); return end
  local valid, reason = validateProfile(envelope.profile, envelope.id)
  if not valid then promptUi:receive(envelope.id, "error", "Profile rejected: " .. reason); showStatus("AGENT: rejected profile (" .. reason .. ")"); return end
  if not allowApply then
    pendingProfileEnvelope = envelope
    promptUi:receive(envelope.id, "generating", "Profile ready. Close the generator to spawn its pedestal.")
    return
  end
  if not applyGeneratedProfile(envelope.profile) or not spawnCustomPedestal() then
    showStatus("AGENT: profile valid but could not be applied")
    promptUi:receive(envelope.id, "error", "Profile could not be applied; see Isaac log.")
    return
  end
  local ackOk, queued = pcall(NebiusBridge.Ack, envelope.id)
  promptUi:receive(envelope.id, "accepted", "Accepted: " .. getActiveProfile().name .. ". " .. getActiveProfile().description)
  if not ackOk or not queued then showStatus("AGENT: applied " .. getActiveProfile().name .. "; acknowledgement queue full"); return end
  showStatus("PROFILE ACCEPTED: " .. getActiveProfile().name .. "; pedestal spawned; ACK queued")
  Isaac.DebugString("[Live Sprite Swap Demo] PROFILE_ACCEPTED id=" .. envelope.id .. " name=" .. getActiveProfile().name)
end

function Demo.onExecuteCommand(_, command, parameters)
  Isaac.DebugString("[Live Sprite Swap Demo] console callback: command='" .. tostring(command) .. "' parameters='" .. tostring(parameters) .. "'")

  if string.lower(tostring(command)) ~= "agent" then
    return ""
  end

  local action, number = string.match(string.lower(tostring(parameters)), "^%s*(%S+)%s*(%d*)%s*$")
  if action == "ping" then
    showStatus("AGENT: COMMAND RECEIVED; custom item ID " .. tostring(CUSTOM_ITEM_ID))
    return "AGENT: COMMAND RECEIVED"
  end

  if action == "state" then
    local message = "AGENT: " .. getActiveProfile().name .. " active (item ID " .. tostring(CUSTOM_ITEM_ID) .. ")"
    showStatus(message)
    return message
  end

  local profileIndex = tonumber(number)
  if action == "switch" and profileIndex and selectProfile(profileIndex) then
    return "AGENT: " .. getActiveProfile().name .. " profile active"
  end

  showStatus("AGENT: use ping, state, or switch 1|2|3; native profiles arrive through IPC")
  return "AGENT: use ping, state, or switch 1|2|3"
end

function Demo.onInputAction(_, entity, inputHook, buttonAction)
  if buttonAction ~= ButtonAction.ACTION_CONSOLE then
    return nil
  end
  if inputHook == InputHook.IS_ACTION_TRIGGERED then
    return Input.IsButtonTriggered(Keyboard.KEY_BACKSLASH, 0)
  end
  if inputHook == InputHook.IS_ACTION_PRESSED then
    return Input.IsButtonPressed(Keyboard.KEY_BACKSLASH, 0)
  end
  return nil
end

function Demo:onGameStarted(isContinued)
  if not isContinued then
    activeProfileIndex = 1
    demoPickupStates = {}
  end
end

function Demo:onPostUpdate()
  promptUi:updateInput()
  pollNativeProfile(true)
end

function Demo:onPickupInit(pickup)
  local state = demoPickupStates[pickup.InitSeed]
  if state then
    queueSheetApply(pickup, state.profileIndex, 10)
  end
end

function Demo:onPickupUpdate(pickup)
  local state = demoPickupStates[pickup.InitSeed]
  if not state then
    return
  end

  local data = pickup:GetData()
  if not data.liveProfileDemo or data.profileIndex ~= state.profileIndex then
    queueSheetApply(pickup, state.profileIndex, 1)
  end
  if data.appliedProfileIndex == state.profileIndex or Game():GetFrameCount() < data.spriteApplyFrame then
    return
  end

  local sprite = pickup:GetSprite()
  sprite:ReplaceSpritesheet(1, profiles[state.profileIndex].spriteSheet)
  sprite:LoadGraphics()
  local layerOk, layer = pcall(sprite.GetLayer, sprite, 1)
  if layerOk and layer and type(layer.SetVisible) == "function" then
    layer:SetVisible(not (state.profileIndex == 4 and nativePedestalImage ~= nil))
  end
  data.appliedProfileIndex = state.profileIndex
end

function Demo:onEvaluateCache(player, cacheFlag)
  if not playerHasDemoItem(player) then
    return
  end

  local profile = getActiveProfile()
  if cacheFlag == CacheFlag.CACHE_DAMAGE then
    player.Damage = player.Damage + profile.damage
  elseif cacheFlag == CacheFlag.CACHE_FIREDELAY then
    player.MaxFireDelay = math.max(0.5, player.MaxFireDelay + profile.fireDelay)
  elseif cacheFlag == CacheFlag.CACHE_RANGE then
    player.TearRange = player.TearRange + profile.range
  elseif cacheFlag == CacheFlag.CACHE_LUCK then
    player.Luck = player.Luck + profile.luck
  elseif cacheFlag == CacheFlag.CACHE_SHOTSPEED then
    player.ShotSpeed = player.ShotSpeed + profile.shotSpeed
  elseif cacheFlag == CacheFlag.CACHE_SPEED then
    player.MoveSpeed = player.MoveSpeed + profile.speed
  end
end

function Demo:onPostFireTear(tear)
  local spawner = tear.SpawnerEntity
  local player = spawner and spawner:ToPlayer()
  if not player or not playerHasDemoItem(player) then
    return
  end

  -- Each fired tear snapshots the selected profile. Switching profiles changes
  -- only future tears, so entities already in flight remain stable.
  local profile = getActiveProfile()
  tear:GetData().liveProfileIndex = activeProfileIndex
  tear.TearFlags = tear.TearFlags | profile.tearFlag
  tear.Scale = tear.Scale * (profile.tearScale or 1)

  -- Retain Isaac's native animated tear sprite. Its Color property gives each
  -- profile a distinct single-tear appearance without breaking multi-frame
  -- animation layouts through a spritesheet replacement.
  tear.Color = profile.tearColor

  local frame = Game():GetFrameCount()
  if frame - lastTearSoundFrame >= 6 then
    playProfileSound(profile, 0.28)
    lastTearSoundFrame = frame
  end
  runProfileRules("tear_fire", player)
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

runProfileRules = function(triggerName, player)
  if not player or not playerHasDemoItem(player) then return end
  local profile = getActiveProfile()
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

function Demo:onPostNewRoom()
  runProfileRules("room_enter", Isaac.GetPlayer(0))
end

function Demo:onPreSpawnCleanAward()
  runProfileRules("room_clear", Isaac.GetPlayer(0))
end

function Demo:onEntityTakeDamage(entity, _, _, source, _)
  local player = entity:ToPlayer()
  if player then
    runProfileRules("player_hurt", player)
    return
  end
  local sourceEntity = source and source.Entity
  local tear = sourceEntity and sourceEntity:ToTear()
  local tearPlayer = tear and tear.SpawnerEntity and tear.SpawnerEntity:ToPlayer()
  if tearPlayer then runProfileRules("enemy_hit", tearPlayer) end
end

function Demo:onPostNewLevel()
  runProfileRules("new_floor", Isaac.GetPlayer(0))
end

function Demo:onPostAddCollectible(collectibleType, _, _, _, _, player)
  if collectibleType == CUSTOM_ITEM_ID then
    local profile = getActiveProfile()
    if profile.soulHearts and profile.soulHearts > 0 then player:AddSoulHearts(profile.soulHearts) end
    runProfileRules("pickup", player)
  end
end

function Demo:onPostRender()
  pollNativeProfile(false)
  promptUi:render()
  -- Native objects are created only from the fixed generated-art location and
  -- only from a render callback. The normal Sprite path remains visible until
  -- both objects have loaded, then serves as a fallback if native loading fails.
  if nativePedestalSheet and not nativePedestalImage and not nativePedestalLoadFailed and Renderer and type(Renderer.LoadImage) == "function" and SourceQuad and type(SourceQuad.NewFromRectangle) == "function" then
    local imageOk, image = pcall(Renderer.LoadImage, nativePedestalSheet)
    local quadOk, source = pcall(SourceQuad.NewFromRectangle, Vector(0, 0), 32, 32, false)
    if imageOk and image and quadOk and source then
      nativePedestalImage, nativePedestalSourceQuad = image, source
      Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_ART_READY path=" .. nativePedestalSheet)
    else
      nativePedestalLoadFailed = true
      Isaac.DebugString("[Live Sprite Swap Demo] NATIVE_ART_FALLBACK path=" .. nativePedestalSheet)
    end
  end
  if statusUntil >= Game():GetFrameCount() then
    Isaac.RenderText(statusText, 38, 38, 1, 0.85, 0.2, 1)
  end
end

function Demo:onPickupRender(pickup, _)
  if not nativePedestalImage or not nativePedestalSourceQuad or pickup.SubType ~= CUSTOM_ITEM_ID then return end
  local state = demoPickupStates[pickup.InitSeed]
  if not state or state.profileIndex ~= 4 or not DestinationQuad or type(DestinationQuad.NewFromRectangle) ~= "function" then return end
  -- Once native art is ready, suppress the anm2 art layer so this is a real
  -- replacement, not an alpha-stacked overlay. Keep the pedestal layer intact.
  local sprite = pickup:GetSprite()
  local layerOk, layer = pcall(sprite.GetLayer, sprite, 1)
  if layerOk and layer and type(layer.SetVisible) == "function" then layer:SetVisible(false) end
  local position = Isaac.WorldToScreen(pickup.Position + pickup.PositionOffset) + Vector(-16, -16)
  local destinationOk, destination = pcall(DestinationQuad.NewFromRectangle, position, 32, 32)
  if not destinationOk or not destination then return end
  pcall(function() nativePedestalImage:Render(nativePedestalSourceQuad, destination, KColor(1, 1, 1, 1)) end)
end

function Demo:onPostHudRender()
  local player = Isaac.GetPlayer(0)
  if not player or not playerHasDemoItem(player) then
    return
  end

  configureHudItemSprite(activeProfileIndex)
  local screenWidth = Isaac.GetScreenWidth()
  local iconPosition = Vector(screenWidth - 44, 108)
  hudItemSprite:RenderLayer(1, iconPosition)
  Isaac.RenderText("LIVE", screenWidth - 61, 121, 0.85, 0.85, 0.85, 1)
end

for _, profile in ipairs(profiles) do
  profile.soundId = Isaac.GetSoundIdByName(profile.soundName)
  Isaac.DebugString("[Live Sprite Swap Demo] sound " .. profile.name .. " ID " .. tostring(profile.soundId))
end

Isaac.DebugString("[Live Sprite Swap Demo] v1.5.0 loaded; custom item ID " .. tostring(CUSTOM_ITEM_ID) .. " prompt=KEY_8")

Demo:AddCallback(ModCallbacks.MC_EXECUTE_CMD, Demo.onExecuteCommand)
Demo:AddCallback(ModCallbacks.MC_INPUT_ACTION, Demo.onInputAction)
Demo:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, Demo.onGameStarted)
Demo:AddCallback(ModCallbacks.MC_POST_UPDATE, Demo.onPostUpdate)
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_INIT, Demo.onPickupInit, PickupVariant.PICKUP_COLLECTIBLE)
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_UPDATE, Demo.onPickupUpdate, PickupVariant.PICKUP_COLLECTIBLE)
Demo:AddCallback(ModCallbacks.MC_EVALUATE_CACHE, Demo.onEvaluateCache)
Demo:AddCallback(ModCallbacks.MC_POST_FIRE_TEAR, Demo.onPostFireTear)
Demo:AddCallback(ModCallbacks.MC_POST_NEW_ROOM, Demo.onPostNewRoom)
Demo:AddCallback(ModCallbacks.MC_PRE_SPAWN_CLEAN_AWARD, Demo.onPreSpawnCleanAward)
Demo:AddCallback(ModCallbacks.MC_ENTITY_TAKE_DMG, Demo.onEntityTakeDamage)
Demo:AddCallback(ModCallbacks.MC_POST_NEW_LEVEL, Demo.onPostNewLevel)
Demo:AddCallback(ModCallbacks.MC_POST_ADD_COLLECTIBLE, Demo.onPostAddCollectible)
Demo:AddCallback(ModCallbacks.MC_POST_RENDER, Demo.onPostRender)
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_RENDER, Demo.onPickupRender)
Demo:AddCallback(ModCallbacks.MC_POST_HUD_RENDER, Demo.onPostHudRender)

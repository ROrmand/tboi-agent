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
    damage = 0.75, fireDelay = 0, range = 0, luck = 0,
  },
  {
    name = "Verdant", spriteSheet = "gfx/items/collectibles/verdant_orb.png",
    tearColor = Color(0.25, 1, 0.45, 1, 0, 0, 0),
    tearFlag = TearFlags.TEAR_POISON, soundName = "LIVE PROFILE VERDANT",
    damage = 0, fireDelay = -1, range = 0, luck = 0,
  },
  {
    name = "Void", spriteSheet = "gfx/items/collectibles/void_orb.png",
    tearColor = Color(0.65, 0.35, 1, 1, 0, 0, 0),
    tearFlag = TearFlags.TEAR_FEAR, soundName = "LIVE PROFILE VOID",
    damage = 0, fireDelay = 0, range = 40, luck = 2,
  },
}

local ALL_PROFILE_CACHE_FLAGS = CacheFlag.CACHE_DAMAGE
  | CacheFlag.CACHE_FIREDELAY
  | CacheFlag.CACHE_RANGE
  | CacheFlag.CACHE_LUCK

local spawnPending = false
local spawnedForRun = false
local activeProfileIndex = 1
local demoPickupStates = {}
local hudItemSprite = Sprite()
local hudProfileIndex = nil
local sfx = SFXManager()
local lastTearSoundFrame = -999
local statusText = "AGENT: custom item armed - run agent ping"
local statusUntil = 0

local function getActiveProfile()
  return profiles[activeProfileIndex]
end

local function showStatus(message)
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
    return
  end

  local player = Isaac.GetPlayer(0)
  if player == nil then
    showStatus("AGENT: no player; spawn skipped")
    return
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
    return
  end

  demoPickupStates[pickup.InitSeed] = { profileIndex = activeProfileIndex }
  queueSheetApply(pickup, activeProfileIndex, 10)
  showStatus("AGENT: " .. getActiveProfile().name .. " pedestal ready; run agent ping")
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

local function selectProfile(profileIndex)
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

  showStatus("AGENT: use agent ping, agent state, or agent switch 1|2|3")
  return "AGENT: use agent ping, agent state, or agent switch 1|2|3"
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
    spawnPending = true
    spawnedForRun = false
  end
end

function Demo:onPostUpdate()
  if not spawnPending or spawnedForRun or Game():GetFrameCount() < 30 then
    return
  end
  spawnPending = false
  spawnedForRun = true
  spawnCustomPedestal()
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
    player.MaxFireDelay = player.MaxFireDelay + profile.fireDelay
  elseif cacheFlag == CacheFlag.CACHE_RANGE then
    player.TearRange = player.TearRange + profile.range
  elseif cacheFlag == CacheFlag.CACHE_LUCK then
    player.Luck = player.Luck + profile.luck
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

  -- Retain Isaac's native animated tear sprite. Its Color property gives each
  -- profile a distinct single-tear appearance without breaking multi-frame
  -- animation layouts through a spritesheet replacement.
  tear.Color = profile.tearColor

  local frame = Game():GetFrameCount()
  if frame - lastTearSoundFrame >= 6 then
    playProfileSound(profile, 0.28)
    lastTearSoundFrame = frame
  end
end

function Demo:onPostRender()
  if statusUntil >= Game():GetFrameCount() then
    Isaac.RenderText(statusText, 38, 38, 1, 0.85, 0.2, 1)
  end
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

Isaac.DebugString("[Live Sprite Swap Demo] v1.2.2 loaded; custom item ID " .. tostring(CUSTOM_ITEM_ID))

Demo:AddCallback(ModCallbacks.MC_EXECUTE_CMD, Demo.onExecuteCommand)
Demo:AddCallback(ModCallbacks.MC_INPUT_ACTION, Demo.onInputAction)
Demo:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, Demo.onGameStarted)
Demo:AddCallback(ModCallbacks.MC_POST_UPDATE, Demo.onPostUpdate)
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_INIT, Demo.onPickupInit, PickupVariant.PICKUP_COLLECTIBLE)
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_UPDATE, Demo.onPickupUpdate, PickupVariant.PICKUP_COLLECTIBLE)
Demo:AddCallback(ModCallbacks.MC_EVALUATE_CACHE, Demo.onEvaluateCache)
Demo:AddCallback(ModCallbacks.MC_POST_FIRE_TEAR, Demo.onPostFireTear)
Demo:AddCallback(ModCallbacks.MC_POST_RENDER, Demo.onPostRender)
Demo:AddCallback(ModCallbacks.MC_POST_HUD_RENDER, Demo.onPostHudRender)

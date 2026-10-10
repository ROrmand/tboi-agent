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
local statusText = "AGENT: custom item armed - run agent ping"
local statusUntil = 0
local selectProfile
local runProfileRules
local showStatus
local bridgeJson = nil
local bridgePrompt = ""
local bridgeJobId = nil
local bridgeRequestSequence = 0
local pollBridgeJob
local bridgeSubmittedFrame = nil
local bridgeFinishedTimerText = nil
local bridgeLastPollFrame = -999
local bridgeStatus = "Bridge idle"
local promptWindowReady = false
local bridgeLastObservedSnapshot = nil
local bridgePollSlot = 0

do
  local jsonOk, jsonModule = pcall(require, "json")
  if jsonOk then
    bridgeJson = jsonModule
  end
end

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

-- Isaac intentionally removes Lua's io library. `include()` is available,
-- but caches missing paths. The bridge therefore pre-publishes a sequence of
-- immutable modules; each poll consumes a never-before-included slot.
local function readBridgeModule(kind, requestId, slot)
  local ok, value = pcall(include, kind .. "_" .. requestId .. "_slot_" .. tostring(slot))
  if ok and type(value) == "table" then return value end
  return nil, ok and "bridge module was not a table" or tostring(value)
end

-- The bridge writes this declarative table after its schema validation. The
-- model never supplies Lua callbacks; the fixed handlers below interpret it.
local function loadGeneratedProfile(expectedRequestId, slot)
  local generated
  if expectedRequestId then
    generated = readBridgeModule("generated_profile", expectedRequestId, slot)
  else
    local ok
    ok, generated = pcall(include, "generated_profile")
    if not ok then generated = nil end
  end
  if type(generated) ~= "table" then
    showStatus("AGENT: no generated profile found; run npm generate first")
    return false
  end
  local metadata, stats, tear = generated.metadata, generated.stats, generated.tear_profile
  if type(metadata) ~= "table" or type(stats) ~= "table" or type(tear) ~= "table" then
    showStatus("AGENT: generated profile is invalid")
    return false
  end
  if expectedRequestId and generated.bridge_request_id ~= expectedRequestId then
    return false
  end
  local tearFlags = 0
  for _, name in ipairs(tear.flags or {}) do
    tearFlags = tearFlags | flagFromName(name)
  end
  profiles[4] = {
    name = metadata.display_name or "Generated Item",
    description = metadata.description or "",
    spriteSheet = generated.sprite_sheet or "gfx/items/collectibles/generated_item.png",
    tearColor = Color((tear.color or {}).r or 1, (tear.color or {}).g or 1, (tear.color or {}).b or 1, (tear.color or {}).a or 1, 0, 0, 0),
    tearFlag = tearFlags, soundName = "LIVE PROFILE EMBER",
    damage = stats.damage or 0, fireDelay = -(stats.tears or 0),
    range = stats.range or 0, luck = stats.luck or 0,
    shotSpeed = stats.shot_speed or 0, speed = stats.speed or 0,
    soulHearts = stats.soul_hearts or 0, rules = generated.rules or {}, ruleState = {},
  }
  profiles[4].soundId = Isaac.GetSoundIdByName(profiles[4].soundName)
  hudProfileIndex = nil
  selectProfile(4)
  showStatus("AGENT: loaded " .. profiles[4].name)
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

local function updatePromptWindowStatus()
  if promptWindowReady then
    ImGui.UpdateText("nebius_item_status", bridgeStatus)
    if bridgeSubmittedFrame then
      local elapsed = math.floor((Isaac.GetTime() - bridgeSubmittedFrame) / 1000)
      ImGui.UpdateText("nebius_item_elapsed", "Elapsed: " .. tostring(math.max(0, elapsed)) .. "s")
    elseif bridgeFinishedTimerText then
      ImGui.UpdateText("nebius_item_elapsed", bridgeFinishedTimerText)
    else
      ImGui.UpdateText("nebius_item_elapsed", "Elapsed: --")
    end
  end
end

local function submitPromptToBridge()
  if bridgeJobId then return end
  if #bridgePrompt > 2000 then
    bridgeStatus = "Please shorten your prompt to 2000 characters."
    updatePromptWindowStatus()
    return
  end
  if not bridgePrompt or bridgePrompt:match("^%s*$") then
    bridgeStatus = "Describe a passive item before generating."
    updatePromptWindowStatus()
    return
  end
  if not bridgeJson or not bridgeJson.encode or not bridgeJson.decode then
    bridgeStatus = "JSON support is unavailable."
    updatePromptWindowStatus()
    return
  end
  bridgeRequestSequence = bridgeRequestSequence + 1
  bridgeJobId = tostring(Random()) .. "_" .. tostring(bridgeRequestSequence)
  bridgeSubmittedFrame = Isaac.GetTime()
  bridgeFinishedTimerText = nil
  bridgeLastObservedSnapshot = nil
  bridgePollSlot = 0
  bridgeStatus = "Stage 1/4: Prompt written to Isaac's log. Waiting for the local bridge..."
  updatePromptWindowStatus()
  -- Isaac's mod sandbox cannot load native networking modules. DebugString is
  -- a supported game-to-local-process handoff; the bridge watches this line.
  Isaac.DebugString("[NebiusBridge] generate " .. bridgeJson.encode({ id = bridgeJobId, prompt = bridgePrompt }))
end

local function openPromptWindow()
  if not promptWindowReady then
    -- A linked menu entry remains available if the debug console is covering
    -- the window when the command is issued.
    ImGui.CreateMenu("nebius_generator_menu", "Nebius")
    ImGui.AddElement("nebius_generator_menu", "nebius_generator_menu_item", ImGuiElement.MenuItem, "Generate Passive Item")
    ImGui.CreateWindow("nebius_item_prompt", "Nebius Passive Item Generator")
    ImGui.LinkWindowToElement("nebius_item_prompt", "nebius_generator_menu_item")
    ImGui.SetWindowPosition("nebius_item_prompt", 48, 460)
    ImGui.SetWindowSize("nebius_item_prompt", 620, 390)
    ImGui.AddText("nebius_item_prompt", "Describe one passive item. The bridge validates it before Isaac loads it.", true)
    ImGui.AddInputTextMultiline("nebius_item_prompt", "nebius_item_text", "Item prompt", function(value)
      bridgePrompt = value
    end, "", 8)
    ImGui.AddElement("nebius_item_prompt", "nebius_item_submit", ImGuiElement.Button, "Generate Item")
    ImGui.AddCallback("nebius_item_submit", ImGuiCallback.Clicked, submitPromptToBridge)
    ImGui.AddCallback("nebius_item_prompt", ImGuiCallback.Render, function() pollBridgeJob() end)
    ImGui.AddText("nebius_item_prompt", "Bridge idle", true, "nebius_item_status")
    ImGui.AddText("nebius_item_prompt", "Elapsed: --", true, "nebius_item_elapsed")
    ImGui.AddText("nebius_item_prompt", "Progress: 1) log handoff  2) item profile  3) icon  4) load into Isaac", true)
    ImGui.AddText("nebius_item_prompt", "If Stage 1 lasts more than 5 seconds, keep `npm run bridge` open. If a generation fails, its reason appears above; edit the prompt and try again.", true)
    promptWindowReady = true
  end
  ImGui.SetVisible("nebius_item_prompt", true)
end

pollBridgeJob = function()
  if not bridgeJobId or Isaac.GetTime() - bridgeLastPollFrame < 1000 then return end
  bridgeLastPollFrame = Isaac.GetTime()
  bridgePollSlot = bridgePollSlot + 1
  updatePromptWindowStatus()
  local job, readError = readBridgeModule("bridge_status", bridgeJobId, bridgePollSlot)
  local ok = type(job) == "table" and job.id == bridgeJobId
  if ok and job.stage ~= bridgeLastObservedSnapshot then
    bridgeLastObservedSnapshot = job.stage
    Isaac.DebugString("[NebiusBridge] observed job " .. bridgeJobId .. " stage " .. tostring(job.stage or job.status))
  end
  if not ok then
    if Isaac.GetTime() - bridgeSubmittedFrame > 10000 then
      bridgeStatus = "Waiting for bridge acknowledgement. The local bridge is still preparing a response."
    end
  elseif job.status == "generating" then
    local stages = {
      text = "Stage 2/4: Designing and validating item stats...",
      repair = "Stage 2/4: Invalid model response; retrying once...",
      image = "Stage 3/4: Generating item artwork...",
      art = "Stage 3/4: Removing background and preparing 32x32 sprite...",
      publish = "Stage 4/4: Publishing validated item and artwork...",
    }
    bridgeStatus = stages[job.stage] or "Bridge received your prompt. Starting generation..."
  end
  if Isaac.GetTime() - bridgeSubmittedFrame > 370000 then
    local elapsed = math.floor((Isaac.GetTime() - bridgeSubmittedFrame) / 1000)
    bridgeJobId = nil
    bridgeSubmittedFrame = nil
    bridgeFinishedTimerText = "Stopped after " .. tostring(math.max(0, elapsed)) .. "s"
    bridgeStatus = "Timed out waiting for completion. Check the bridge terminal before retrying."
    updatePromptWindowStatus()
    return
  end
  if not ok then updatePromptWindowStatus(); return end
  if job.status == "ready" then
    local elapsed = math.floor((Isaac.GetTime() - bridgeSubmittedFrame) / 1000)
    bridgeJobId = nil
    bridgeSubmittedFrame = nil
    bridgeFinishedTimerText = "Completed in " .. tostring(math.max(0, elapsed)) .. "s"
    if loadGeneratedProfile(job.id, bridgePollSlot) then
      spawnCustomPedestal()
      bridgeStatus = "Loaded " .. getActiveProfile().name .. ". " .. (getActiveProfile().description or "")
    else
      bridgeStatus = "Generated, but Isaac could not load the profile."
    end
    updatePromptWindowStatus()
  elseif job.status == "error" then
    local elapsed = math.floor((Isaac.GetTime() - bridgeSubmittedFrame) / 1000)
    bridgeJobId = nil
    bridgeSubmittedFrame = nil
    bridgeFinishedTimerText = "Stopped after " .. tostring(math.max(0, elapsed)) .. "s"
    bridgeStatus = "Generation failed: " .. tostring(job.error or "unknown error")
    updatePromptWindowStatus()
  else
    updatePromptWindowStatus()
  end
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

  if action == "generated" then
    if loadGeneratedProfile() then
      return "AGENT: generated profile loaded"
    end
    return "AGENT: generated profile unavailable"
  end

  if action == "generate" then
    openPromptWindow()
    return "AGENT: item generator opened"
  end

  local profileIndex = tonumber(number)
  if action == "switch" and profileIndex and selectProfile(profileIndex) then
    return "AGENT: " .. getActiveProfile().name .. " profile active"
  end

  showStatus("AGENT: use generate, generated, ping, state, or switch 1|2|3")
  return "AGENT: use generate, generated, ping, state, or switch 1|2|3"
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
  pollBridgeJob()
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

local function ruleMayRun(profile, rule)
  local roomIndex = Game():GetLevel():GetCurrentRoomIndex()
  local floorIndex = Game():GetLevel():GetAbsoluteStage()
  profile.ruleState = profile.ruleState or {}
  for _, condition in ipairs(rule.conditions or {}) do
    if condition.type == "chance" and math.random() > (condition.chance or 0) then
      return false
    elseif condition.type == "once_per_room" then
      local key = "room:" .. tostring(roomIndex) .. ":" .. tostring(rule.trigger)
      if profile.ruleState[key] then return false end
      profile.ruleState[key] = true
    elseif condition.type == "once_per_floor" then
      local key = "floor:" .. tostring(floorIndex) .. ":" .. tostring(rule.trigger)
      if profile.ruleState[key] then return false end
      profile.ruleState[key] = true
    end
  end
  return true
end

runProfileRules = function(triggerName, player)
  if not player or not playerHasDemoItem(player) then return end
  local profile = getActiveProfile()
  for _, rule in ipairs(profile.rules or {}) do
    if rule.trigger == triggerName and ruleMayRun(profile, rule) then
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
    runProfileRules("pickup", player)
  end
end

function Demo:onPostRender()
  pollBridgeJob()
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

Isaac.DebugString("[Live Sprite Swap Demo] v1.3.0 loaded; custom item ID " .. tostring(CUSTOM_ITEM_ID))

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
Demo:AddCallback(ModCallbacks.MC_POST_HUD_RENDER, Demo.onPostHudRender)

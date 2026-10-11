local Probe = RegisterMod("Nebius IPC Stage 2B", 1)

local armed = false
local finished = false
local startedFrame = 0
local result = "Generate an item, then press or hold 8"
local json = nil

local triggers = { room_enter = true, room_clear = true, enemy_hit = true, player_hurt = true, pickup = true, new_floor = true, tear_fire = true }
local conditions = { chance = true, once_per_room = true, once_per_floor = true }
local actions = { spawn_pickup = true, grant_soul_hearts = true }
local pickups = { coin = true, key = true, bomb = true, heart = true }
local flags = { homing = true, spectral = true, piercing = true, poison = true, burn = true, slow = true, fear = true, charm = true, bounce = true, split = true, orbit = true, glow = true }
local statBounds = {
  damage = {-10, 15}, tears = {-5, 10}, shot_speed = {-1, 1.5}, range = {-10, 20},
  speed = {-1, 0.5}, luck = {-5, 10}, soul_hearts = {0, 4},
}

do
  local ok, module = pcall(require, "json")
  if ok and type(module) == "table" then json = module end
end

local function log(event, fields)
  Isaac.DebugString("[NebiusIPC][stage2b] " .. event .. " " .. fields)
end

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

local function validateProfile(profile, id)
  if not allowedKeys(profile, { version = true, generated_at = true, bridge_request_id = true, metadata = true, stats = true, tear_profile = true, visuals = true, rules = true, sprite_sheet = true }) then return false, "profile keys" end
  if profile.version ~= 1 or profile.bridge_request_id ~= id or not text(profile.generated_at, 1, 64) or not text(profile.sprite_sheet, 1, 256) then return false, "profile identity" end

  local metadata = profile.metadata
  if not allowedKeys(metadata, { display_name = true, description = true, quality = true, theme = true, balance_note = true })
    or not text(metadata.display_name, 1, 32) or not text(metadata.description, 1, 64) or not number(metadata.quality, 0, 4, true)
    or not ({ cursed = true, angelic = true, tech = true, gross = true, cosmic = true, none = true })[metadata.theme] or not text(metadata.balance_note, 0, 256) then return false, "metadata" end

  if not allowedKeys(profile.stats, { damage = true, tears = true, shot_speed = true, range = true, speed = true, luck = true, soul_hearts = true }) then return false, "stat keys" end
  for name, bounds in pairs(statBounds) do if not number(profile.stats[name], bounds[1], bounds[2], name == "soul_hearts") then return false, "stat " .. name end end

  local tear = profile.tear_profile
  if not allowedKeys(tear, { flags = true, color = true, scale = true }) or type(tear.flags) ~= "table" or #tear.flags > 3 or not number(tear.scale, 0.5, 2, false) then return false, "tear profile" end
  for _, flag in ipairs(tear.flags) do if not flags[flag] then return false, "tear flag" end end
  if not allowedKeys(tear.color, { r = true, g = true, b = true, a = true }) then return false, "tear color keys" end
  for _, channel in ipairs({ "r", "g", "b", "a" }) do if not number(tear.color[channel], 0, 1, false) then return false, "tear color" end end

  if not allowedKeys(profile.visuals, { pedestal_prompt = true }) or not text(profile.visuals.pedestal_prompt, 1, 500) or type(profile.rules) ~= "table" or #profile.rules > 2 then return false, "visuals or rules" end
  for _, rule in ipairs(profile.rules) do
    if not allowedKeys(rule, { trigger = true, conditions = true, actions = true }) or not triggers[rule.trigger] or type(rule.conditions) ~= "table" or #rule.conditions > 2 or type(rule.actions) ~= "table" or #rule.actions < 1 or #rule.actions > 2 then return false, "rule" end
    for _, condition in ipairs(rule.conditions) do
      if not allowedKeys(condition, { type = true, chance = true }) or not conditions[condition.type] or (condition.type == "chance" and not number(condition.chance, 0, 1, false)) then return false, "condition" end
    end
    for _, action in ipairs(rule.actions) do
      if not allowedKeys(action, { type = true, amount = true, pickup_type = true }) or not actions[action.type] or not number(action.amount, 1, 4, true) or (action.type == "spawn_pickup" and not pickups[action.pickup_type]) then return false, "action" end
    end
  end
  return true
end

function Probe:onGameStarted(isContinued)
  armed, finished, startedFrame = false, false, 0
  result = "Generate an item, then press or hold 8"
  log("RUN_STARTED", "continued=" .. tostring(isContinued) .. " awaiting=KEY_8|KEY_KP_8")
end

function Probe:onUpdate()
  if finished then return end
  if not armed then
    if Input.IsButtonPressed(Keyboard.KEY_8, 0) or Input.IsButtonPressed(Keyboard.KEY_KP_8, 0) then
      armed, startedFrame = true, Game():GetFrameCount()
      result = "Waiting for a generated profile (30 second timeout)"
      log("INPUT_DETECTED", "frame=" .. tostring(startedFrame))
    end
    return
  end
  if type(NebiusBridge) ~= "table" or type(NebiusBridge.Poll) ~= "function" or type(NebiusBridge.Ack) ~= "function" or not json then
    finished, result = true, "FAIL: bridge or JSON support unavailable"
    log("DEPENDENCY_UNAVAILABLE", "bridge=" .. tostring(type(NebiusBridge)) .. " json=" .. tostring(json ~= nil))
    return
  end
  local pollOk, raw = pcall(NebiusBridge.Poll)
  if not pollOk then finished, result = true, "FAIL: native Poll error; see log"; log("POLL_ERROR", tostring(raw)); return end
  if raw == nil then
    if Game():GetFrameCount() - startedFrame >= 900 then finished, result = true, "FAIL: profile timed out; generate a fresh item"; log("PROFILE_TIMEOUT", "frames=900") end
    return
  end
  local decodeOk, envelope = pcall(json.decode, raw)
  if not decodeOk or type(envelope) ~= "table" then finished, result = true, "FAIL: malformed bridge data"; log("DECODE_REJECTED", "raw_length=" .. tostring(#raw)); return end
  if envelope.type == "hello" then log("HELLO_IGNORED", "waiting_for=profile"); return end
  if not allowedKeys(envelope, { version = true, type = true, id = true, profile = true }) or envelope.version ~= 1 or envelope.type ~= "profile" or not text(envelope.id, 1, 100) then finished, result = true, "FAIL: rejected IPC envelope"; log("ENVELOPE_REJECTED", "type=" .. tostring(envelope.type)); return end
  local valid, reason = validateProfile(envelope.profile, envelope.id)
  if not valid then finished, result = true, "FAIL: profile rejected (" .. reason .. ")"; log("PROFILE_REJECTED", "id=" .. envelope.id .. " reason=" .. reason); return end
  if not NebiusBridge.Ack(envelope.id) then finished, result = true, "FAIL: acknowledgement queue full"; log("ACK_ERROR", "id=" .. envelope.id); return end
  finished, result = true, "PROFILE ACCEPTED: " .. envelope.profile.metadata.display_name .. "; ACK queued"
  log("PROFILE_ACCEPTED", "id=" .. envelope.id .. " name=" .. envelope.profile.metadata.display_name .. " applied=false")
end

Probe:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, Probe.onGameStarted)
Probe:AddCallback(ModCallbacks.MC_POST_UPDATE, Probe.onUpdate)
Probe:AddCallback(ModCallbacks.MC_POST_RENDER, function() Isaac.RenderText("Nebius IPC Stage 2B: " .. result, 20, 50, 1, 1, 1, 1) end)
log("LOADED", "operation=validated_profile_receipt_only control=KEY_8|KEY_KP_8")
return Probe

local Demo = RegisterMod("Live Sprite Swap Demo", 1)
local bridgeJson = require("json")
local promptUi = include("nebius_prompt").new(bridgeJson)
local ids, slotById = {}, {}
for slot = 0, 63 do
  local id = Isaac.GetItemIdByName(string.format("Generated Passive %02d", slot))
  ids[slot+1], slotById[id] = id, slot+1
end
local records, runtime, usedArt, accepted = {}, {}, {}, {}
local roomStatGrants = {}
local function roomStamp()
  local level = Game():GetLevel()
  return tostring(level:GetAbsoluteStage()) .. ":" .. tostring(level:GetCurrentRoomIndex())
end
local session = tostring(Random()) .. "_" .. tostring(Isaac.GetTime())
local serial, runToken, running, blocked = 0, nil, false, nil
local pendingProfileEnvelope, lastPollTime, lastStateTime = nil, -999, -999
local statusText, statusUntil = "", 0
local function playProfileSound() end
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
local triggers = { room_enter = true, room_clear = true, enemy_hit = true, player_hurt = true, pickup = true, new_floor = true, tear_fire = true }
local ruleTriggers = { room_enter = true, room_clear = true, pickup = true, new_floor = true, tear_fire = true }
local hitTriggers = { enemy_hit = true, player_hurt = true }
local systemNames = { stats = true, tears = true, rules = true, familiar = true, aura = true, on_hit = true, on_kill = true, tear_impact = true, collision = true, tear_update = true, bomb = true, laser = true, knife = true }
local tearUpdateBehaviors = { home = true, pulse = true, shrink = true }
local conditions = { chance = true, once_per_room = true, once_per_floor = true }
-- Fixed heart reward catalog: amount is an integer from 1 to 4.
local heartRewards = {
  grant_half_red_hearts = { handler = "AddHearts", units = 1, label = "half red heart" },
  grant_full_red_hearts = { handler = "AddHearts", units = 2, label = "full red heart" },
  grant_black_hearts = { handler = "AddBlackHearts", units = 2, label = "black heart" },
  grant_eternal_hearts = { handler = "AddEternalHearts", units = 1, label = "eternal heart" },
  grant_bone_hearts = { handler = "AddBoneHearts", units = 1, label = "bone heart" },
}
local actions = { spawn_pickup = true, spawn_friendly = true, grant_soul_hearts = true, grant_stat = true }
for name in pairs(heartRewards) do actions[name] = true end
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
local friendlies = { attack_fly = true, spider = true, pooter = true }
local tearFlagsByName = { homing = true, spectral = true, piercing = true, poison = true, burn = true, slow = true, fear = true, charm = true, bounce = true, split = true, orbit = true, glow = true, explosive = true, confusion = true, knockback = true, continuum = true, boomerang = true, grow = true, shrink = true, sticky = true, wiggle = true, slowing_creep = true }
local familiarTypes = { sentry = true, melee = true, normal = true, shield = true }
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
local heartWeights = { grant_half_red_hearts = 2, grant_full_red_hearts = 3, grant_soul_hearts = 8, grant_black_hearts = 4, grant_bone_hearts = 4, grant_eternal_hearts = 5 }
local friendlyWeights = { attack_fly = 2, spider = 2, pooter = 3 }
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

local roomStatNames = { damage = true, tears = true, luck = true }
local function validAction(action)
  if not allowedKeys(action, { type = true, amount = true, pickup_type = true, stat = true, friendly_type = true }) or not actions[action.type] or not number(action.amount, 1, 4, true) then return false end
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
  end
  for name, weight in pairs(systemWeights) do if marked(profile, name) then total = total + weight end end
  local roomStats = {}
  local function spend(action)
    if type(action) ~= "table" then return end
    if action.type == "spawn_pickup" then total = total + (pickupWeights[action.pickup_type] or 0) * (action.amount or 1)
    elseif action.type == "spawn_friendly" then total = total + (friendlyWeights[action.friendly_type] or 0) * (action.amount or 1)
    elseif heartWeights[action.type] then total = total + heartWeights[action.type] * (action.amount or 1)
    elseif action.type == "grant_stat" then roomStats[action.stat] = math.max(roomStats[action.stat] or 0, action.amount or 0) end
  end
  for _, rule in ipairs(profile.rules or {}) do for _, action in ipairs(rule.actions or {}) do spend(action) end end
  for _, name in ipairs({ "on_kill", "tear_impact", "collision" }) do
    local proc = profile[name]
    if type(proc) == "table" then for _, action in ipairs(proc.actions or {}) do spend(action) end end
  end
  for _, amount in pairs(roomStats) do total = total + amount end
  return total
end
local function validAura(aura)
  if not allowedKeys(aura, { type=true, damage=true, radius=true, cooldown=true, duration=true }) or not number(aura.radius,50,180,false) or not number(aura.cooldown,15,90,true) then return false end
  if aura.type == "damage" then return number(aura.damage,0.25,2,false) and aura.duration == nil end
  if not ({ slow=true, burn=true, fear=true })[aura.type] or not number(aura.duration,15,120,true) then return false end
  if aura.type == "burn" then return number(aura.damage,0.25,2,false) end
  return aura.damage == nil
end
local function validProc(proc)
  if not allowedKeys(proc, { conditions = true, actions = true }) or not array(proc.conditions, 0, 2) or not array(proc.actions, 1, 2) then return false end
  for _, condition in ipairs(proc.conditions) do if not allowedKeys(condition, { type = true, chance = true }) or not conditions[condition.type] or (condition.type == "chance" and not number(condition.chance, 0, 1, false)) then return false end end
  for _, action in ipairs(proc.actions) do if not validAction(action) then return false end end
  return true
end

local function validateProfile(profile, id)
  if not text(id,1,100) then return false, "request identity" end
  if not allowedKeys(profile, { version = true, generated_at = true, bridge_request_id = true, metadata = true, affects_stats = true, systems = true, stats = true, tear_profile = true, visuals = true, rules = true, familiar = true, aura = true, on_kill = true, tear_impact = true, collision = true, tear_update = true, bomb = true, laser = true, knife = true, sprite_sheet = true, familiar_sprite_sheet = true, familiar_animation = true, familiar_animation_sheet = true }) then return false, "profile keys" end
  if profile.version ~= 1 or profile.bridge_request_id ~= id or not text(profile.generated_at, 1, 64) or not text(profile.sprite_sheet, 1, 256) or not profile.sprite_sheet:match("^gfx/items/collectibles/generated_slot_[0-9][0-9]%.png$") then return false, "profile identity" end
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
  if profile.affects_stats ~= marked(profile, "stats") then return false, "affects_stats" end
  if marked(profile, "stats") then
    if not allowedKeys(profile.stats, { damage = true, damage_multiplier = true, tears = true, shot_speed = true, range = true, speed = true, luck = true, soul_hearts = true, flying = true }) then return false, "stat keys" end
    for name, bounds in pairs(statBounds) do if not number(profile.stats[name], bounds[1], bounds[2], name == "soul_hearts") then return false, "stat " .. name end end
    if profile.stats.damage_multiplier ~= nil and not number(profile.stats.damage_multiplier, 0.5, 2, false) then return false, "damage multiplier" end
    if profile.stats.flying ~= nil and type(profile.stats.flying) ~= "boolean" then return false, "flying" end
  elseif profile.stats ~= nil then return false, "stats" end
  local tear = profile.tear_profile
  if marked(profile, "tears") then
    if not allowedKeys(tear, { flags = true, color = true, scale = true }) or not array(tear.flags, 0, 3) or not number(tear.scale, 0.5, 2, false) then return false, "tear profile" end
    for _, flag in ipairs(tear.flags) do if not tearFlagsByName[flag] then return false, "tear flag" end end
    if not allowedKeys(tear.color, { r = true, g = true, b = true, a = true }) then return false, "tear color keys" end
    for _, channel in ipairs({ "r", "g", "b", "a" }) do if not number(tear.color[channel], 0, 1, false) then return false, "tear color" end end
  elseif tear ~= nil then return false, "tear profile" end
  if not allowedKeys(profile.visuals, { pedestal_prompt = true }) or not text(profile.visuals.pedestal_prompt, 1, 500) or not array(profile.rules, 0, 2) then return false, "visuals or rules" end
  if marked(profile, "familiar") then
    if profile.familiar == nil then return false, "familiar" end
  elseif profile.familiar ~= nil then return false, "familiar" end
  if profile.familiar~=nil then
    local familiar=profile.familiar
    if not allowedKeys(familiar,{type=true,damage=true,cooldown=true,range=true,sprite_prompt=true,attack=true}) or not familiarTypes[familiar.type] or not number(familiar.damage,0.5,3,false) or not number(familiar.cooldown,15,90,true) or not number(familiar.range,80,320,false) or not text(familiar.sprite_prompt,1,500) then return false,"familiar" end
    if rangedFamiliars[familiar.type] then
      if not validFamiliarAttack(familiar.attack) then return false,"familiar attack" end
    elseif familiar.attack~=nil then return false,"familiar attack" end
    if not text(profile.familiar_sprite_sheet,1,256) or not profile.familiar_sprite_sheet:match("^gfx/items/collectibles/generated_familiar_slot_[0-9][0-9]%.png$") then return false,"familiar sprite" end
    if not text(profile.familiar_animation,1,256) or not profile.familiar_animation:match("^gfx/familiars/generated_familiar_anim_[0-9][0-9]%.anm2$") then return false,"familiar animation" end
    if not text(profile.familiar_animation_sheet,1,256) or not profile.familiar_animation_sheet:match("^gfx/familiars/generated_familiar_sheet_[0-9][0-9]%.png$") then return false,"familiar animation sheet" end
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
      if not validProc(profile[name]) then return false, name end
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
      if not array(bomb.flags,0,1) then return false, "bomb flags" end
      for _, flag in ipairs(bomb.flags) do if flag ~= "poison" then return false, "bomb flag" end end
    end
  elseif profile.bomb ~= nil then return false, "bomb" end
  for _, name in ipairs({ "laser", "knife" }) do
    if marked(profile, name) then
      if not allowedKeys(profile[name], { damage = true }) or not number(profile[name].damage, 0.5, 3, false) then return false, name end
    elseif profile[name] ~= nil then return false, name end
  end
  local sawRule, sawHit = false, false
  for _, rule in ipairs(profile.rules) do
    if not allowedKeys(rule, { trigger = true, conditions = true, actions = true }) or not triggers[rule.trigger] or not array(rule.conditions, 0, 2) or not array(rule.actions, 1, 2) then return false, "rule" end
    if ruleTriggers[rule.trigger] then
      if not marked(profile, "rules") then return false, "rules" end
      sawRule = true
    elseif hitTriggers[rule.trigger] then
      if not marked(profile, "on_hit") then return false, "on_hit" end
      sawHit = true
    else return false, "rule" end
    for _, condition in ipairs(rule.conditions) do if not allowedKeys(condition, { type = true, chance = true }) or not conditions[condition.type] or (condition.type == "chance" and not number(condition.chance, 0, 1, false)) then return false, "condition" end end
    for _, action in ipairs(rule.actions) do if not validAction(action) then return false, "action" end end
  end
  if marked(profile, "rules") and not sawRule then return false, "rules" end
  if marked(profile, "on_hit") and not sawHit then return false, "on_hit" end
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
  if action.type == "grant_soul_hearts" then
    return lead .. "grants " .. (amount == 1 and "a soul heart" or (amount .. " soul hearts"))
  end
  if action.type == "grant_stat" then return lead .. "grants +" .. amount .. " " .. action.stat .. " for this room" end
  if action.type == "spawn_friendly" then
    local names = { attack_fly = "attack fly", spider = "spider", pooter = "pooter" }
    return lead .. "spawns a friendly " .. (names[action.friendly_type] or "enemy")
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
  for _, condition in ipairs(entry.conditions or {}) do
    if condition.type == "chance" and (condition.chance or 1) < 1 then chance = true end
  end
  local actions = {}
  for _, action in ipairs(entry.actions or {}) do actions[#actions + 1] = actionPhrase(action, chance) end
  local body = clauseList(actions)
  if not body then return nil end
  return body .. " " .. (whenText[trigger] or "sometimes")
end
local function effectSummary(generated)
  local parts = {}
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
    if hearts > 0 then parts[#parts + 1] = "grants " .. hearts .. " soul heart" .. (hearts == 1 and "" or "s") end
    if hearts < 0 then parts[#parts + 1] = "removes " .. -hearts .. " soul heart" .. (hearts == -1 and "" or "s") end
    if stats.flying == true then parts[#parts + 1] = "grants flight" end
  end
  local tear = generated.tear_profile
  if tear then
    local size = ""
    if (tear.scale or 1) >= 1.15 then size = "larger " elseif (tear.scale or 1) <= 0.85 then size = "smaller " end
    parts[#parts + 1] = flagClause(tear.flags, size)
  end
  for _, rule in ipairs(generated.rules or {}) do parts[#parts + 1] = timedClause(rule, rule.trigger) end
  for _, name in ipairs({ "on_kill", "tear_impact", "collision" }) do
    parts[#parts + 1] = timedClause(generated[name], name)
  end
  local familiar = generated.familiar
  if familiar then
    if familiar.type == "shield" then parts[#parts + 1] = "a shield familiar blocks a hit"
    elseif familiar.type == "melee" then parts[#parts + 1] = "a melee familiar strikes nearby enemies"
    else
      local lead = familiar.type == "sentry" and "an orbiting familiar fires" or "a familiar behind you fires"
      local flags = familiar.attack and familiar.attack.flags or {}
      parts[#parts + 1] = #flags > 0 and (lead .. " " .. flagClause(flags, "")) or (lead .. " tears")
    end
  end
  if generated.aura then
    local auraText = { damage="nearby enemies take damage", slow="nearby enemies are slowed", burn="nearby enemies burn", fear="nearby enemies flee" }
    parts[#parts + 1] = auraText[generated.aura.type]
  end
  local updateText = { home = "tears drift toward enemies", pulse = "tears pulse in size", shrink = "tears shrink as they fly" }
  if generated.tear_update then parts[#parts + 1] = updateText[generated.tear_update.behavior] end
  if generated.bomb then parts[#parts + 1] = generated.bomb.flags and #generated.bomb.flags > 0 and "stronger poison bombs" or "stronger bombs" end
  if generated.laser then parts[#parts + 1] = "stronger lasers" end
  if generated.knife then parts[#parts + 1] = "stronger knives" end
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
    summary = effectSummary(generated),
    spriteSheet = generated.sprite_sheet or "gfx/items/collectibles/generated_item.png",
    tearColor = Color(color.r or 1, color.g or 1, color.b or 1, color.a or 1, 0, 0, 0),
    tearFlag = tearFlags, tearFlagNames = tear and tear.flags or {}, tearScale = tear and tear.scale or 1, soundName = "LIVE PROFILE EMBER",
    affectsStats = generated.affects_stats == true,
    damage = stats.damage or 0, damageMultiplier = stats.damage_multiplier or 1, fireDelay = -(stats.tears or 0),
    range = stats.range or 0, luck = stats.luck or 0,
    shotSpeed = stats.shot_speed or 0, speed = stats.speed or 0,
    soulHearts = stats.soul_hearts or 0, flying = stats.flying == true, rules = generated.rules or {}, familiar = generated.familiar, aura = generated.aura,
    friendlyToken = generated.bridge_request_id,
    on_kill = generated.on_kill, tear_impact = generated.tear_impact, collision = generated.collision,
    tear_update = generated.tear_update, bomb = generated.bomb, laser = generated.laser, knife = generated.knife,
    familiarSpriteSheet = generated.familiar_sprite_sheet, familiarAnimation = generated.familiar_animation, familiarAnimationSheet = generated.familiar_animation_sheet, familiarEntities = {}, ruleState = {},
  }
end

local function applyIdentity(index, profile)
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
  pendingBanner = { name = profile.name, summary = profile.summary, frame = Game():GetFrameCount() }
  showBanner(profile.name, profile.summary)
  showStatus(profile.name .. ": " .. profile.summary)
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
local function saveRun()
  if blocked then return false end
  local states={}
  for index,profile in ipairs(runtime) do states[index]=profile.ruleState end
  local ok,err=pcall(function()
    local saved = {version=2,records=records,ruleStates=states}
    if #roomStatGrants > 0 then saved.roomStats = {room=roomStamp(),grants=roomStatGrants} end
    Demo:SaveData(bridgeJson.encode(saved))
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
  return {session=session,run=runToken,used=slots,count=#records,blocked=capacity(),runtime_contract=8}
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
  applyIdentity(index, runtime[index])
  rebuildSystems()
  usedArt[slot]=true
  if not saveRun() then
    if pickup.Remove then pickup:Remove() end
    reject(envelope.id,blocked); return
  end
  accepted[envelope.id]=true
  promptUi:receive(envelope.id,"accepted","Accepted: "..runtime[index].name.." ("..#records.."/64)")
  local ackOk,queued=pcall(NebiusBridge.Ack,envelope.id)
  showStatus(runtime[index].name..": "..runtime[index].summary)
  Isaac.DebugString("[Live Sprite Swap Demo] PROFILE ACCEPTED: "..runtime[index].name.."; "..(ackOk and queued and "ACK queued" or "ACK unavailable"))
  publishState()
end
local function restoreRoomStats(saved)
  if saved == nil then return true end
  if not allowedKeys(saved,{room=true,grants=true}) or not text(saved.room,1,100) or not array(saved.grants,0,1536) then return false end
  local seen = {}
  for _, grant in ipairs(saved.grants) do
    if not allowedKeys(grant,{index=true,player=true,stat=true,amount=true}) or not number(grant.index,1,#records,true) or not text(grant.player,1,40) or not roomStatNames[grant.stat] or not number(grant.amount,1,4,true) then return false end
    local key=grant.index .. ":" .. grant.player .. ":" .. grant.stat
    if seen[key] then return false end
    seen[key]=true
    -- A saved bonus must correspond to an action on its item.
    local record=records[grant.index]
    local matches=false
    local function check(entry)
      for _, action in ipairs(entry and entry.actions or {}) do
        if action.type=="grant_stat" and action.stat==grant.stat and action.amount==grant.amount then matches=true end
      end
    end
    for _, rule in ipairs(record.rules) do check(rule) end
    check(record.on_kill); check(record.tear_impact); check(record.collision)
    if not matches then return false end
  end
  if saved.room==roomStamp() then roomStatGrants=saved.grants end
  return true
end
function Demo:onGameStarted(isContinued)
  records,runtime,accepted={},{},{}
  roomStatGrants={}
  promptUi:reset()
  pendingProfileEnvelope,blocked,pendingBanner,pendingStatPlayer=nil,nil,nil,nil
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
        applyIdentity(index, runtime[index])
      end
      if not blocked and not restoreRoomStats(saved.roomStats) then blocked="Invalid saved room stats." end
    end
  else saveRun() end
  if blocked then records,runtime,accepted={},{},{}; roomStatGrants={}; showStatus(blocked) end
  rebuildSystems()
  for p=0,Game():GetNumPlayers()-1 do refreshStats(Isaac.GetPlayer(p)) end
  publishState()
end
function Demo:onPreGameExit(shouldSave)
  if shouldSave and running then saveRun() end
  running=false; pendingProfileEnvelope=nil
  promptUi:reset()
  Isaac.DebugString("[NebiusBridge] state "..bridgeJson.encode(context()))
end
function Demo:onPostUpdate()
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
local function namedVariant(name)
  if not Isaac.GetEntityVariantByName then return nil end
  local ok, variant = pcall(Isaac.GetEntityVariantByName, name)
  if ok and type(variant) == "number" and variant > 0 then return variant end
end
local function bodyVariant(kind)
  local customName = { normal = "Generated Follower", sentry = "Generated Orbital", melee = "Generated Chaser", shield = "Generated Shield" }
  local custom = namedVariant(customName[kind])
  if custom then return custom end
  local vanilla = {
    normal = FamiliarVariant and FamiliarVariant.BROTHER_BOBBY,
    sentry = FamiliarVariant and (FamiliarVariant.SACRIFICIAL_DAGGER or FamiliarVariant.CUBE_OF_MEAT),
    melee = FamiliarVariant and FamiliarVariant.LEECH,
    shield = FamiliarVariant and FamiliarVariant.DRY_BABY,
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
  if not ok or type(sprite) ~= "table" or not sprite.Load then return false end
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
      if entityAlive(familiar) and frame>=(profile.shieldReadyFrame or 0) then found=profile end
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
    if familiar.CanBlockProjectiles ~= nil then familiar.CanBlockProjectiles = true end
    blockShots(familiar)
  end,
  normal = function(familiar, _, player)
    moveFollower(familiar, player)
  end,
}
local familiarAct = {
  sentry = function(familiar, profile, player)
    local target=nearestEnemy(familiar.Position,profile.familiar.range)
    if not fireRangedVolley(familiar,target,profile) then hurtEnemy(target,profile.familiar.damage,player) end
  end,
  melee = function(familiar, profile, player) contactStrike(familiar,profile,player) end,
  shield = function(familiar, profile, player) contactStrike(familiar,profile,player) end,
}
familiarAct.normal = familiarAct.sentry
local function tickFamiliar(familiar, profile, player, index, frame, key)
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
  if not profile or not profile.familiar then return end
  local player=familiar.Player or Isaac.GetPlayer(0)
  if not player then return end
  tickFamiliar(familiar, profile, player, index, Game():GetFrameCount(), tostring(player.InitSeed))
end
function Demo:updatePassiveEffects()
  if not running or blocked then return end
  if #members.familiar == 0 and #members.aura == 0 then return end
  local frame=Game():GetFrameCount()
  for p=0,Game():GetNumPlayers()-1 do
    local player=Isaac.GetPlayer(p); local key=tostring(player.InitSeed)
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
                if aura.type=="slow" then enemy:AddSlowing(EntityRef(player),aura.duration,0.5,Color(0.5,0.7,1,1))
                elseif aura.type=="burn" then enemy:AddBurn(EntityRef(player),aura.duration,aura.damage)
                elseif aura.type=="fear" then enemy:AddFear(EntityRef(player),aura.duration) end
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
    if grant.player==tostring(player.InitSeed) and owned(player,grant.index) then
      if grant.stat=="tears" then total.fireDelay=total.fireDelay-grant.amount
      else total[grant.stat]=total[grant.stat]+grant.amount end
    end
  end
  apply(player, total)
end
local function grantRoomStat(profile, player, action)
  if action.type ~= "grant_stat" then return false end
  local index
  for i, candidate in ipairs(runtime) do if candidate==profile then index=i; break end end
  if not index then return true end
  local key=tostring(player.InitSeed)
  for _, grant in ipairs(roomStatGrants) do
    if grant.index==index and grant.player==key and grant.stat==action.stat then
      if action.amount>grant.amount then grant.amount=action.amount; refreshStats(player) end
      return true
    end
  end
  roomStatGrants[#roomStatGrants+1]={index=index,player=key,stat=action.stat,amount=action.amount}
  refreshStats(player)
  return true
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
local function friendlyAlive(token, entityType)
  local found = Isaac.FindByType(entityType)
  if type(found) ~= "table" then return false end
  for _, entity in ipairs(found) do
    local data = entity.GetData and entity:GetData()
    if data and data.nebiusFriendlyItem == token and (not entity.Exists or entity:Exists()) then return true end
  end
  return false
end
local function runAction(profile, player, action)
  if grantRoomStat(profile, player, action) or grantHeartReward(player, action) then return end
  if action.type == "spawn_pickup" then
    local variant = pickupVariants[action.pickup_type]
    if not variant then return end
    for _ = 1, action.amount or 1 do
      local position = Game():GetRoom():FindFreePickupSpawnPosition(player.Position, 0, true)
      Isaac.Spawn(EntityType.ENTITY_PICKUP, variant, 0, position, Vector.Zero, player)
    end
  elseif action.type == "spawn_friendly" then
    local entityType = friendlyTypes[action.friendly_type]
    if not entityType or friendlyAlive(profile.friendlyToken, entityType) then return end
    local position = Game():GetRoom():FindFreePickupSpawnPosition(player.Position, 40, true)
    local npc = Isaac.Spawn(entityType, 0, 0, position, Vector.Zero, player)
    if not npc then return end
    if npc.GetData then npc:GetData().nebiusFriendlyItem = profile.friendlyToken end
    if npc.AddCharmed then npc:AddCharmed(EntityRef(player), -1) end
  end
end
local function runOneRuleSet(triggerName, player, profile)
  for ruleIndex, rule in ipairs(profile.rules or {}) do
    if rule.trigger == triggerName and ruleMayRun(profile, rule, ruleIndex, player) then
      for _, action in ipairs(rule.actions or {}) do runAction(profile, player, action) end
      playProfileSound(profile, 0.45)
    end
  end
end


local function runActions(profile, player, list)
  for _, action in ipairs(list or {}) do runAction(profile, player, action) end
  playProfileSound(profile, 0.45)
end
local function runProfileRules(trigger,player)
  if not running or blocked then return end
  eachOwned(byTrigger[trigger], player, function(_, profile) runOneRuleSet(trigger, player, profile) end)
end
local function runSystemProc(systemName, player, latchKey)
  if not running or blocked then return end
  eachOwned(members[systemName], player, function(_, profile)
    local proc = profile[systemName]
    if not proc then return end
    profile.ruleState = profile.ruleState or {}
    if latchKey then
      if profile.ruleState[latchKey] then return end
      profile.ruleState[latchKey] = true
    end
    if ruleMayRun(profile, { conditions = proc.conditions }, systemName, player) then
      runActions(profile, player, proc.actions)
    end
  end)
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
    eachOwned(members.tear_update, player, function(_, profile)
      if profile.tear_update then data.generatedTearUpdate = profile.tear_update end
    end)
  end
  runProfileRules("tear_fire",player)
end
local function forPlayers(trigger)
  for p=0,Game():GetNumPlayers()-1 do runProfileRules(trigger,Isaac.GetPlayer(p)) end
end
function Demo:onPostNewRoom()
  local hadGrants=#roomStatGrants>0
  roomStatGrants={}
  if hadGrants then for p=0,Game():GetNumPlayers()-1 do refreshStats(Isaac.GetPlayer(p)) end end
  forPlayers("room_enter")
  if running then saveRun() end
end
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
function Demo:onPostEntityKill(entity)
  if #members.on_kill == 0 or not isEnemy(entity) then return end
  local latch="on_kill:" .. tostring(Game():GetLevel():GetCurrentRoomIndex()) .. ":" .. tostring(entity.InitSeed or 0)
  for p=0,Game():GetNumPlayers()-1 do runSystemProc("on_kill", Isaac.GetPlayer(p), latch) end
end
function Demo:onPreTearCollision(tear, collider)
  if #members.tear_impact == 0 or not isEnemy(collider) then return end
  local player=tear.SpawnerEntity and tear.SpawnerEntity.ToPlayer and tear.SpawnerEntity:ToPlayer()
  if not player and tear.GetData and tear:GetData().generatedFamiliar then
    local familiar=tear.SpawnerEntity and tear.SpawnerEntity.ToFamiliar and tear.SpawnerEntity:ToFamiliar()
    player=familiar and familiar.Player
  end
  if not player or not tear.GetData then return end
  local data=tear:GetData()
  data.impacted=data.impacted or {}
  local pending=false
  eachOwned(members.tear_impact, player, function(index)
    if data.impacted[index] then return end
    data.impacted[index]=true
    pending=true
  end)
  if pending then runSystemProc("tear_impact", player, nil) end
end
function Demo:onPrePlayerCollision(player, collider)
  if #members.collision == 0 or not isEnemy(collider) then return end
  player=player and player.ToPlayer and player:ToPlayer()
  if not player then return end
  local latch="collision:" .. tostring(Game():GetLevel():GetCurrentRoomIndex()) .. ":" .. tostring(collider.InitSeed or 0)
  runSystemProc("collision", player, latch)
end
function Demo:onPostTearUpdate(tear)
  if not tear or not tear.GetData then return end
  local data = tear:GetData()
  local owner = data.generatedTearOwner
  if owner and #members.tears > 0 then
    eachOwned(members.tears, owner, function(_, profile)
      tear.Color = profile.tearColor
      applyTearFlags(tear, profile)
    end)
  end
  local spec = data.generatedTearUpdate
  if not spec then return end
  if spec.behavior == "home" then
    local enemy = nearestEnemy(tear.Position or Vector(0, 0), 240)
    if enemy and enemy.Position and tear.Velocity then
      local dx, dy = enemy.Position.X - tear.Position.X, enemy.Position.Y - tear.Position.Y
      local length = math.sqrt(dx * dx + dy * dy)
      if length > 0.01 then
        local pull = 0.15 * spec.strength
        tear.Velocity = tear.Velocity + Vector(dx / length * pull, dy / length * pull)
      end
    end
  elseif spec.behavior == "pulse" then
    local base = tear:GetData().pulseBase or tear.Scale or 1
    tear:GetData().pulseBase = base
    tear.Scale = base * (1 + 0.08 * spec.strength * math.sin(Game():GetFrameCount() * 0.3))
  elseif spec.behavior == "shrink" then
    tear.Scale = math.max(0.5, (tear.Scale or 1) - 0.02 * spec.strength)
  end
end
function Demo:onPostFireBomb(bomb)
  if #members.bomb == 0 or not bomb then return end
  local player = bomb.SpawnerEntity and bomb.SpawnerEntity.ToPlayer and bomb.SpawnerEntity:ToPlayer()
  if not player then return end
  eachOwned(members.bomb, player, function(_, profile)
    if not profile.bomb then return end
    bomb.ExplosionDamage = (bomb.ExplosionDamage or 0) + profile.bomb.damage
    bomb.Radius = profile.bomb.radius
    for _, flag in ipairs(profile.bomb.flags or {}) do
      if flag == "poison" then bomb:AddTearFlags(TearFlags.TEAR_POISON) end
    end
  end)
end
local function addWeaponDamage(listName, field, entity)
  if #members[listName] == 0 or not entity or not entity.GetData then return end
  local data = entity:GetData()
  if data.generatedWeapon then return end
  local spawner = entity.SpawnerEntity or entity.Parent
  local player = spawner and spawner.ToPlayer and spawner:ToPlayer()
  if not player then return end
  local added = 0
  eachOwned(members[listName], player, function(_, profile)
    if profile[field] then added = added + profile[field].damage end
  end)
  if added == 0 then return end
  data.generatedWeapon = true
  entity.CollisionDamage = (entity.CollisionDamage or 0) + added
end
function Demo:onPostLaserUpdate(laser) addWeaponDamage("laser", "laser", laser) end
function Demo:onPostKnifeUpdate(knife) addWeaponDamage("knife", "knife", knife) end
function Demo:onPreProjectileCollision(projectile, collider)
  if #members.familiar == 0 or not projectile then return end
  local familiar = collider and collider.ToFamiliar and collider:ToFamiliar()
  if familiar and familiar.GetData and familiar:GetData().generatedFamiliarIndex then
    local profile = runtime[familiar:GetData().generatedFamiliarIndex]
    if profile and profile.familiar and profile.familiar.type == "shield" then
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
  local familiar = entity and entity.ToFamiliar and entity:ToFamiliar()
  if not familiar or not familiar.GetData then return end
  local index = familiar:GetData().generatedFamiliarIndex
  local profile = index and runtime[index]
  if not profile or not profile.familiarEntities then return end
  for key, stored in pairs(profile.familiarEntities) do
    if stored == familiar then profile.familiarEntities[key] = nil end
  end
end
function Demo:onPostAddCollectible(collectibleType,_,firstTime,_,_,player)
  local index=slotById[collectibleType]
  local profile=index and runtime[index]
  if not profile or firstTime==false then return end
  if profile.affectsStats then
    if profile.soulHearts~=0 then player:AddSoulHearts(profile.soulHearts) end
    refreshStats(player)
    pendingStatPlayer = player
  end
  queueBanner(profile)
  runProfileRules("pickup",player)
end
function Demo:onPostRender()
  pollNativeProfile(false); promptUi:render()
  local hideOverlays=promptUi:shouldHideGameOverlays()
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
  local bob=math.sin(Game():GetFrameCount()*0.2)*3
  local position=Isaac.WorldToScreen(pickup.Position+pickup.PositionOffset)+Vector(-16,-48+bob)
  if profile.image and DestinationQuad then
    local nativePedestalImage=profile.image
    local sprite=pickup:GetSprite()
    local ok,layer=pcall(sprite.GetLayer,sprite,1)
    if ok and layer then layer:SetVisible(false) end
    local good,destination=pcall(DestinationQuad.NewFromRectangle,position,32,32)
    if good and destination then pcall(function() nativePedestalImage:Render(profile.quad,destination,KColor(1,1,1,1)) end) end
  end
  Isaac.RenderText(profile.name, position.X, position.Y - 14, 1, 1, 1, 1)
  local lines = wrapLines(profile.summary, 32)
  for lineIndex, line in ipairs(lines) do
    if lineIndex > 3 then break end
    Isaac.RenderText(line, position.X - 8, position.Y + 34 + (lineIndex - 1) * 10, 0.9, 0.9, 0.75, 1)
  end
end
function Demo:onPostHudRender()
  if promptUi:shouldHideGameOverlays() then return end
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
 MC_POST_GAME_STARTED="onGameStarted",MC_PRE_GAME_EXIT="onPreGameExit",MC_PRE_UPDATE="onPreUpdate",MC_POST_UPDATE="onPostUpdate",
 MC_EVALUATE_CACHE="onEvaluateCache",MC_POST_FIRE_TEAR="onPostFireTear",MC_POST_NEW_ROOM="onPostNewRoom",
 MC_PRE_SPAWN_CLEAN_AWARD="onPreSpawnCleanAward",MC_ENTITY_TAKE_DMG="onEntityTakeDamage",
 MC_POST_NEW_LEVEL="onPostNewLevel",MC_POST_ADD_COLLECTIBLE="onPostAddCollectible",MC_POST_RENDER="onPostRender",
 MC_POST_HUD_RENDER="onPostHudRender",MC_POST_ENTITY_KILL="onPostEntityKill",
 MC_PRE_TEAR_COLLISION="onPreTearCollision",MC_PRE_PLAYER_COLLISION="onPrePlayerCollision",
 MC_FAMILIAR_UPDATE="onFamiliarUpdate",MC_POST_TEAR_UPDATE="onPostTearUpdate",
 MC_POST_FIRE_BOMB="onPostFireBomb",MC_POST_LASER_UPDATE="onPostLaserUpdate",
 MC_POST_KNIFE_UPDATE="onPostKnifeUpdate",MC_PRE_PROJECTILE_COLLISION="onPreProjectileCollision",
 MC_POST_ENTITY_REMOVE="onPostEntityRemove",
}
for callback,method in pairs(callbacks) do Demo:AddCallback(ModCallbacks[callback],Demo[method]) end
Demo:AddCallback(ModCallbacks.MC_POST_PICKUP_RENDER,Demo.onPickupRender,PickupVariant.PICKUP_COLLECTIBLE)
Isaac.DebugString("[Live Sprite Swap Demo] v1.13.2 loaded; familiar sprites draw at double size")

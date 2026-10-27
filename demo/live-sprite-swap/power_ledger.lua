local json = require("json")
local catalog = {["version"]=5,["singletons"]={[1]="power.flight"},["profile_sources"]={[1]={["system"]="stats",["path"]={[1]="stats",[2]="flying"},["equals"]=true,["powers"]={[1]="power.flight"}},[2]={["system"]="stats",["path"]={[1]="stats",[2]="explosion_immunity"},["equals"]=true,["powers"]={[1]="power.explosion_immunity"}},[3]={["system"]="tears",["path"]={[1]="tear_profile",[2]="flags"},["each"]=true,["values"]={["homing"]={[1]="power.homing"},["spectral"]={[1]="power.spectral"},["piercing"]={[1]="power.piercing"},["poison"]={[1]="power.poison"},["burn"]={[1]="power.burn"},["slow"]={[1]="power.slow"},["fear"]={[1]="power.fear"},["charm"]={[1]="power.charm"},["bounce"]={[1]="power.bounce"},["split"]={[1]="power.split"},["orbit"]={[1]="power.orbit"},["glow"]={[1]="power.glow"},["explosive"]={[1]="power.explosive",[2]="power.explosion_immunity"},["confusion"]={[1]="power.confusion"},["knockback"]={[1]="power.knockback"},["continuum"]={[1]="power.continuum"},["boomerang"]={[1]="power.boomerang"},["grow"]={[1]="power.grow"},["shrink"]={[1]="power.shrink"},["sticky"]={[1]="power.sticky"},["wiggle"]={[1]="power.wiggle"},["slowing_creep"]={[1]="power.slow"}}},[4]={["system"]="familiar",["path"]={[1]="familiar",[2]="attack",[3]="flags"},["each"]=true,["values"]={["homing"]={[1]="power.homing"},["spectral"]={[1]="power.spectral"},["piercing"]={[1]="power.piercing"},["poison"]={[1]="power.poison"},["burn"]={[1]="power.burn"},["slow"]={[1]="power.slow"},["fear"]={[1]="power.fear"},["charm"]={[1]="power.charm"},["bounce"]={[1]="power.bounce"},["split"]={[1]="power.split"},["orbit"]={[1]="power.orbit"},["glow"]={[1]="power.glow"},["explosive"]={[1]="power.explosive",[2]="power.explosion_immunity"},["confusion"]={[1]="power.confusion"},["knockback"]={[1]="power.knockback"},["continuum"]={[1]="power.continuum"},["boomerang"]={[1]="power.boomerang"},["grow"]={[1]="power.grow"},["shrink"]={[1]="power.shrink"},["sticky"]={[1]="power.sticky"},["wiggle"]={[1]="power.wiggle"},["slowing_creep"]={[1]="power.slow"}}},[5]={["system"]="familiar",["path"]={[1]="familiar",[2]="type"},["values"]={["sentry"]={[1]="power.familiar_shots"},["normal"]={[1]="power.familiar_shots"},["melee"]={[1]="power.contact_damage"},["orbit_contact"]={[1]="power.contact_damage"},["shield"]={[1]="power.contact_damage",[2]="power.projectile_blocking",[3]="power.shielding"}}},[6]={["system"]="tear_update",["path"]={[1]="tear_update",[2]="behavior"},["values"]={["home"]={[1]="power.homing"},["pulse"]={[1]="power.pulse"},["shrink"]={[1]="power.shrink"},["spiral"]={[1]="power.spiral"},["accelerate"]={[1]="power.acceleration"}}},[7]={["system"]="aura",["path"]={[1]="aura",[2]="type"},["values"]={["damage"]={[1]="power.damage_aura"},["slow"]={[1]="power.slow"},["burn"]={[1]="power.burn"},["fear"]={[1]="power.fear"},["charm"]={[1]="power.charm"},["poison"]={[1]="power.poison"},["confusion"]={[1]="power.confusion"}}},[8]={["system"]="bomb",["path"]={[1]="bomb"},["present"]=true,["powers"]={[1]="power.bomb_damage"}},[9]={["system"]="bomb",["path"]={[1]="bomb",[2]="flags"},["each"]=true,["values"]={["poison"]={[1]="power.poison"},["burn"]={[1]="power.burn"},["fear"]={[1]="power.fear"}}},[10]={["system"]="laser",["path"]={[1]="laser"},["present"]=true,["powers"]={[1]="power.laser_damage"}},[11]={["system"]="knife",["path"]={[1]="knife"},["present"]=true,["powers"]={[1]="power.knife_damage"}},[12]={["system"]="active",["path"]={[1]="active",[2]="effect"},["values"]={["radial_burst"]={[1]="power.damage_burst"}}}},["action_containers"]={[1]={["system"]="rules",["path"]={[1]="rules"},["each"]=true,["exclude_triggers"]={[1]="enemy_hit",[2]="player_hurt"}},[2]={["system"]="on_hit",["path"]={[1]="rules"},["each"]=true,["include_triggers"]={[1]="enemy_hit",[2]="player_hurt"}},[3]={["system"]="on_kill",["path"]={[1]="on_kill"}},[4]={["system"]="tear_impact",["path"]={[1]="tear_impact"}},[5]={["system"]="collision",["path"]={[1]="collision"}}},["action_sources"]={[1]={["type"]="apply_status",["field"]="status",["values"]={["slow"]={[1]="power.slow"},["burn"]={[1]="power.burn"},["fear"]={[1]="power.fear"},["poison"]={[1]="power.poison"},["charm"]={[1]="power.charm"},["confusion"]={[1]="power.confusion"},["freeze"]={[1]="power.freeze"}}},[2]={["type"]="spawn_creep",["field"]="creep",["values"]={["black"]={[1]="power.slow"},["red"]={[1]="power.creep_damage"},["green"]={[1]="power.creep_damage"},["yellow"]={[1]="power.creep_damage"}}},[3]={["type"]="spawn_friendly",["field"]="friendly_type",["values"]={["attack_fly"]={[1]="power.summon.attack_fly"},["spider"]={[1]="power.summon.spider"},["pooter"]={[1]="power.summon.pooter"},["dip"]={[1]="power.summon.dip"},["minisaac"]={[1]="power.summon.minisaac"}}},[4]={["type"]="damage_burst",["powers"]={[1]="power.damage_burst"}},[5]={["type"]="retaliate",["powers"]={[1]="power.retaliation"}},[6]={["type"]="extra_tears",["powers"]={[1]="power.extra_tears"}},[7]={["type"]="execute_enemy",["powers"]={[1]="power.execution"}},[8]={["type"]="target_impulse",["field"]="direction",["values"]={["push"]={[1]="power.knockback"},["pull"]={[1]="power.pull"}}},[9]={["type"]="block_projectiles",["powers"]={[1]="power.projectile_blocking"}},[10]={["type"]="reflect_projectiles",["powers"]={[1]="power.projectile_reflection"}},[11]={["type"]="dash",["powers"]={[1]="power.dash"}},[12]={["type"]="temporary_ally",["powers"]={[1]="power.summon.pooter"}}},["ignored_actions"]={[1]="spawn_pickup",[2]="grant_soul_hearts",[3]="grant_half_red_hearts",[4]="grant_full_red_hearts",[5]="grant_black_hearts",[6]="grant_eternal_hearts",[7]="grant_bone_hearts",[8]="grant_gold_hearts",[9]="grant_rotten_hearts",[10]="grant_heart_containers",[11]="grant_stat",[12]="convert_resource",[13]="refill_charge",[14]="activate_aura",[15]="coins_to_charge"}}
local M = {version=catalog.version,capacity=128}
local powerKeys = {[1]="power.acceleration",[2]="power.bomb_damage",[3]="power.boomerang",[4]="power.bounce",[5]="power.burn",[6]="power.charm",[7]="power.confusion",[8]="power.contact_damage",[9]="power.continuum",[10]="power.creep_damage",[11]="power.damage_aura",[12]="power.damage_burst",[13]="power.dash",[14]="power.execution",[15]="power.explosion_immunity",[16]="power.explosive",[17]="power.extra_tears",[18]="power.familiar_shots",[19]="power.fear",[20]="power.flight",[21]="power.freeze",[22]="power.glow",[23]="power.grow",[24]="power.homing",[25]="power.knife_damage",[26]="power.knockback",[27]="power.laser_damage",[28]="power.orbit",[29]="power.piercing",[30]="power.poison",[31]="power.projectile_blocking",[32]="power.projectile_reflection",[33]="power.pull",[34]="power.pulse",[35]="power.retaliation",[36]="power.shielding",[37]="power.shrink",[38]="power.slow",[39]="power.spectral",[40]="power.spiral",[41]="power.split",[42]="power.sticky",[43]="power.summon.attack_fly",[44]="power.summon.dip",[45]="power.summon.minisaac",[46]="power.summon.pooter",[47]="power.summon.spider",[48]="power.wiggle"}
local powerIndexes = {}
for index,power in ipairs(powerKeys) do powerIndexes[power]=index-1 end
local function at(value,path)
  for _,key in ipairs(path) do
    if type(value)~="table" then return nil end
    value=value[key]
  end
  return value
end
local function includes(values,value)
  for _,entry in ipairs(values or {}) do if entry==value then return true end end
  return false
end
local function add(result,values)
  for _,power in ipairs(values or {}) do result[power]=true end
end
function M.derive(profile)
  assert(type(profile)=="table","Power derivation requires a validated profile.")
  local result={}
  for _,source in ipairs(catalog.profile_sources) do
    if includes(profile.systems,source.system) then
      local value=at(profile,source.path)
      if source.present or source.equals~=nil then
        if (source.present and value~=nil) or (source.equals~=nil and source.equals==value) then add(result,source.powers) end
      elseif source.each then
        for _,entry in ipairs(value or {}) do add(result,source.values[entry]) end
      elseif value~=nil then add(result,source.values[value]) end
    end
  end
  for _,container in ipairs(catalog.action_containers) do
    if includes(profile.systems,container.system) then
      local value=at(profile,container.path)
      local entries=container.each and (value or {}) or (value and {value} or {})
      for _,entry in ipairs(entries) do
        if (not container.include_triggers or includes(container.include_triggers,entry.trigger)) and not includes(container.exclude_triggers,entry.trigger) then
          for _,action in ipairs(entry.actions or {}) do
            for _,source in ipairs(catalog.action_sources) do
              if source.type==action.type then
                add(result,source.powers or (action[source.field]~=nil and source.values[action[source.field]] or {}))
              end
            end
          end
        end
      end
    end
  end
  local keys={}
  for power in pairs(result) do keys[#keys+1]=power end
  table.sort(keys)
  return keys
end
function M.fingerprint(keys)
  local parts={}
  for _,power in ipairs(keys) do parts[#parts+1]='"'..power..'"' end
  return "["..table.concat(parts,",").."]"
end
function M.compact(keys)
  local mask=0
  for _,power in ipairs(keys) do
    local index=powerIndexes[power]
    assert(index~=nil,"Unknown semantic power.")
    mask=mask | (1 << index)
  end
  return string.format("%x",mask)
end
local function signature(value)
  if type(value)~="table" then return type(value)..":"..tostring(value) end
  local parts={}
  for key,entry in pairs(value) do parts[#parts+1]=signature(key).."="..signature(entry) end
  table.sort(parts)
  local framed={}
  for _,part in ipairs(parts) do framed[#framed+1]=#part..":"..part end
  return "{"..table.concat(framed).."}"
end
function M.details(records)
  assert(type(records)=="table","Accepted records must be an array.")
  local seen,usage,entries,recent,history={},{},{},{},{}
  for index,record in ipairs(records) do
    assert(type(record)=="table","Malformed accepted record.")
    if (record.status==nil or record.status=="accepted") and record.accepted~=false then
      local profile=record.profile or record
      local identity=record.id or profile.bridge_request_id
      assert(type(identity)=="string" and #identity>0 and #identity<=256,"Accepted record requires a stable identity.")
      assert(not record.id or not profile.bridge_request_id or record.id==profile.bridge_request_id,"Conflicting accepted identity.")
      local quality=profile.metadata and profile.metadata.quality
      assert(type(quality)=="number" and quality%1==0 and quality>=0 and quality<=4,"Accepted quality must be 0-4.")
      local source=record.source or profile.generation_source or "unknown"
      assert(includes({"Creator","Generator","Singularity","unknown"},source),"Unknown generation source.")
      local token=signature(profile)
      assert(not seen[identity] or seen[identity]==token,"Conflicting duplicate accepted identity: "..identity)
      if not seen[identity] then
        assert(#entries<M.capacity,"Accepted power ledger exceeds runtime capacity.")
        seen[identity]=token
        local powers=M.derive(profile)
        local fingerprint=M.fingerprint(powers)
        for _,power in ipairs(powers) do usage[power]=(usage[power] or 0)+1 end
        entries[#entries+1]={identity=identity,order=#entries+1,quality=quality,source=source,power_keys=powers,fingerprint=fingerprint}
        history[#history+1]=M.compact(powers)
        recent[#recent+1]=fingerprint
        if #recent>3 then table.remove(recent,1) end
      end
    end
  end
  if next(usage)==nil then usage=json.EMPTY_OBJECT end
  return {version=M.version,accepted_count=#entries,power_usage=usage,power_history=history,recent_power_fingerprints=recent,entries=entries}
end
function M.snapshot(records)
  local ledger=M.details(records)
  ledger.entries=nil
  return ledger
end
return M

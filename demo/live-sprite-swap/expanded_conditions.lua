local Expanded = {}

local function finite(value)
  return type(value)=="number" and value==value and value~=math.huge and value~=-math.huge
end

local function property(object,name)
  if object==nil then return nil end
  local succeeded,value=pcall(function() return object[name] end)
  if succeeded then return value end
end

local function call(object,method,...)
  local member=property(object,method)
  if type(member)~="function" then return nil end
  local succeeded,value=pcall(member,object,...)
  if succeeded then return value end
end

local function contains(values,wanted)
  for _,value in ipairs(values or {}) do if value==wanted then return true end end
  return false
end

local function parameters(condition,definition)
  if type(condition)~="table" or not definition then return false end
  for name in pairs(condition) do
    if name~="type" and not definition.params[name] then return false end
  end
  for name,specification in pairs(definition.params) do
    local value=condition[name]
    if value==nil and not specification.required then
    elseif specification.type=="string" then
      if type(value)~="string" or not contains(specification.enum,value) then return false end
    elseif not finite(value) or value<specification.minimum or value>specification.maximum
      or (specification.type=="integer" and value%1~=0) then return false end
  end
  return true
end

function Expanded.new(catalog,api)
  api=api or _G
  local definitions=assert(catalog.conditions or catalog.condition_registry,"expanded condition definitions required")
  local instance={handlers={}}
  local function enum(group,name) return property(property(api,group),name) end
  local function game()
    local constructor=property(api,"Game")
    if type(constructor)~="function" then return nil end
    local succeeded,value=pcall(constructor)
    if succeeded then return value end
  end
  local function room() return call(game(),"GetRoom") end
  local function level() return call(game(),"GetLevel") end
  local function flag(entity,name)
    local value=enum("EntityFlag",name)
    if value==nil then return nil end
    return call(entity,"HasEntityFlags",value)
  end
  local function eventFor(context)
    local event=context.event
    if type(event)~="table" or event.owner~=context.player then return nil end
    return event
  end
  local function target(context)
    local event=eventFor(context)
    local npc=event and call(event.target,"ToNPC")
    if call(npc,"IsEnemy")~=true or flag(npc,"FLAG_FRIENDLY")~=false then return nil end
    return npc
  end
  local function health(context)
    local npc=target(context)
    local current,maximum=property(npc,"HitPoints"),property(npc,"MaxHitPoints")
    if not finite(current) or not finite(maximum) or maximum<=0 or current>maximum then return nil end
    return math.max(0,current)/maximum
  end
  local function nonzero(vector)
    local horizontal,vertical=property(vector,"X"),property(vector,"Y")
    return finite(horizontal) and finite(vertical) and (horizontal~=0 or vertical~=0)
  end
  local characterGroups={
    lost={"PLAYER_THELOST","PLAYER_THELOST_B"},
    keeper={"PLAYER_KEEPER","PLAYER_KEEPER_B"},
    forgotten={"PLAYER_THEFORGOTTEN","PLAYER_THESOUL","PLAYER_THEFORGOTTEN_B","PLAYER_THESOUL_B"},
  }
  local collectibles={homing_tears="COLLECTIBLE_SPOON_BENDER",brimstone="COLLECTIBLE_BRIMSTONE"}
  local familiars={brother_bobby="BROTHER_BOBBY",sister_maggy="SISTER_MAGGY"}
  local statuses={slow="FLAG_SLOW",burn="FLAG_BURN",fear="FLAG_FEAR",poison="FLAG_POISON",charm="FLAG_CHARM",confusion="FLAG_CONFUSION"}
  local curses={darkness="CURSE_OF_DARKNESS",labyrinth="CURSE_OF_LABYRINTH",lost="CURSE_OF_THE_LOST",unknown="CURSE_OF_THE_UNKNOWN",maze="CURSE_OF_MAZE",blind="CURSE_OF_BLIND"}
  local difficulties={normal="DIFFICULTY_NORMAL",hard="DIFFICULTY_HARD",greed="DIFFICULTY_GREED",greedier="DIFFICULTY_GREEDIER"}

  function instance.validate(condition,trigger)
    local definition=type(condition)=="table" and definitions[condition.type]
    return parameters(condition,definition) and definition.enabled~=false and contains(definition.contexts,trigger) or false
  end

  local handlers={
    first_visit=function() return call(room(),"IsFirstVisit")==true end,
    room_clear_state=function(condition)
      local current=room()
      local clear=call(current,"IsClear")
      if condition.state=="clear" then return clear==true end
      local enemies=call(current,"GetAliveEnemiesCount")
      return clear==false and finite(enemies) and enemies>0
    end,
    stage_at_most=function(condition)
      local stage=call(level(),"GetStage")
      return finite(stage) and stage%1==0 and stage>=1 and stage<=13 and stage<=condition.stage
    end,
    stage_at_least=function(condition)
      local stage=call(level(),"GetStage")
      return finite(stage) and stage%1==0 and stage>=1 and stage<=13 and stage>=condition.stage
    end,
    difficulty_kind=function(condition)
      local wanted=enum("Difficulty",difficulties[condition.kind])
      return wanted~=nil and property(game(),"Difficulty")==wanted
    end,
    curse_active=function(condition)
      local wanted=enum("LevelCurse",curses[condition.curse])
      local active=call(level(),"GetCurses")
      return math.type(wanted)=="integer" and wanted>0 and math.type(active)=="integer" and active>=0 and (active & wanted)~=0
    end,
    while_moving=function(_,context) return nonzero(property(context.player,"Velocity")) end,
    while_firing=function(_,context)
      return call(context.player,"CanShoot")==true and nonzero(call(context.player,"GetShootingInput"))
    end,
    while_grounded=function(_,context) return property(context.player,"CanFly")==false end,
    character_kind=function(condition,context)
      local actual=call(context.player,"GetPlayerType")
      for _,name in ipairs(characterGroups[condition.kind] or {}) do
        local wanted=enum("PlayerType",name)
        if wanted~=nil and actual==wanted then return true end
      end
      return false
    end,
    has_collectible=function(condition,context)
      local collectible=enum("CollectibleType",collectibles[condition.tag])
      return collectible~=nil and call(context.player,"HasCollectible",collectible,true,true)==true
    end,
    has_familiar=function(condition,context)
      local variant=enum("FamiliarVariant",familiars[condition.tag])
      local entityType=enum("EntityType","ENTITY_FAMILIAR")
      local find=property(property(api,"Isaac"),"FindByType")
      if variant==nil or entityType==nil or type(find)~="function" then return false end
      local succeeded,entities=pcall(find,entityType,variant,-1,false,false)
      if not succeeded or type(entities)~="table" then return false end
      for _,entity in ipairs(entities) do
        local familiar=call(entity,"ToFamiliar")
        if property(familiar,"Player")==context.player and property(familiar,"Variant")==variant and call(familiar,"Exists")==true then return true end
      end
      return false
    end,
    target_is_boss=function(_,context) return call(target(context),"IsBoss")==true end,
    target_is_champion=function(_,context) return call(target(context),"IsChampion")==true end,
    target_health_at_most=function(condition,context)
      local fraction=health(context)
      return fraction~=nil and fraction<=condition.fraction
    end,
    target_health_at_least=function(condition,context)
      local fraction=health(context)
      return fraction~=nil and fraction>=condition.fraction
    end,
    target_has_status=function(condition,context) return flag(target(context),statuses[condition.status])==true end,
    damage_at_least=function(condition,context)
      local event=eventFor(context)
      if not event or not finite(event.damage) or event.damage<=0 then return false end
      if event.trigger=="enemy_hit" and not target(context) then return false end
      return event.damage>=condition.damage
    end,
    weapon_kind=function(condition,context)
      local event=eventFor(context)
      return event~=nil and event.weapon_kind==condition.kind
    end,
    pickup_kind=function(condition,context)
      local event=eventFor(context)
      return event~=nil and event.pickup_kind==condition.kind
    end,
  }
  for name,handler in pairs(handlers) do
    assert(definitions[name] or name=="pickup_kind","Missing expanded condition definition: "..name)
    if definitions[name] then
      instance.handlers[name]=function(condition,context)
        if type(context)~="table" or (type(context.player)~="table" and type(context.player)~="userdata")
          or type(condition)~="table" or condition.type~=name or not parameters(condition,definitions[name])
          or definitions[name].enabled==false then return false end
        local definition=definitions[name]
        if #definition.requires>1 then
          local event=context.event
          if type(event)~="table" or not contains(definition.contexts,event.trigger) then return false end
          for _,field in ipairs(definition.requires) do
            if field~="player" and event[field]==nil then return false end
          end
        end
        local succeeded,passed=pcall(handler,condition,context)
        return succeeded and passed==true
      end
    end
  end
  return instance
end

return Expanded

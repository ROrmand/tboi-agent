local probe = {}

local function scalar(value)
  if type(value)=="boolean" or type(value)=="string" then return value end
  if type(value)=="number" and value==value and math.abs(value)<math.huge then return value end
end

local function property(entity,name)
  local ok,value=pcall(function() return entity[name] end)
  if ok then return scalar(value) end
end

local function query(entity,name,...)
  local args=table.pack(...)
  local ok,value=pcall(function() return entity[name](entity,table.unpack(args,1,args.n)) end)
  if ok then return scalar(value) end
end

local function snapshot(pickup,player)
  local state={pickup={},player={}}
  for _,name in ipairs({"InitSeed","Variant","SubType","Touched","Wait","Price","FrameCount"}) do
    state.pickup[name]=property(pickup,name)
  end
  for _,name in ipairs({"Exists","IsDead"}) do state.pickup[name]=query(pickup,name) end
  local ok,sprite=pcall(function() return pickup:GetSprite() end)
  if ok and sprite then
    state.pickup.animation=query(sprite,"GetAnimation")
    state.pickup.animationFrame=query(sprite,"GetFrame")
  end
  state.player.InitSeed=property(player,"InitSeed")
  for _,name in ipairs({"GetNumCoins","GetNumKeys","GetNumBombs","GetHearts","GetSoulHearts","GetMaxHearts","GetEffectiveMaxHearts","GetBoneHearts","GetRottenHearts"}) do
    state.player[name]=query(player,name)
  end
  state.player.activeSlots={}
  for slot=0,3 do
    state.player.activeSlots[slot+1]={slot=slot,item=query(player,"GetActiveItem",slot),charge=query(player,"GetActiveCharge",slot),batteryCharge=query(player,"GetBatteryCharge",slot)}
  end
  return state
end

local function colliderPlayer(collider)
  local ok,player=pcall(function() return collider:ToPlayer() end)
  if ok then return player end
end

local function validFrame(frame)
  return math.type(frame)=="integer" and frame>=0
end

function probe.new()
  local pending,records,droppedPending,droppedRecords={},{},0,0
  local observer={}

  function observer:before(pickup,collider,frame)
    if not pickup or not validFrame(frame) then return false end
    local player=colliderPlayer(collider)
    if not player then return false end
    if #pending>=64 then droppedPending=droppedPending+1; return false end
    pending[#pending+1]={pickup=pickup,player=player,frame=frame,before=snapshot(pickup,player)}
    return true
  end

  function observer:after(pickup,collider,frame)
    if not validFrame(frame) then return false end
    local player=colliderPlayer(collider)
    if not player then return false end
    for index=#pending,1,-1 do
      local entry=pending[index]
      if entry.pickup==pickup and entry.player==player and entry.frame==frame and not entry.after then
        entry.after=snapshot(pickup,player)
        return true
      end
    end
    return false
  end

  function observer:tick(frame)
    if not validFrame(frame) then return false end
    for index=#pending,1,-1 do
      local entry=pending[index]
      if frame>entry.frame then
        local record={label="diagnostic_not_confirmed_acquisition",frame=entry.frame,settledFrame=frame,
          postCollisionObserved=entry.after~=nil,before=entry.before,after=entry.after,settled=snapshot(entry.pickup,entry.player)}
        if #records>=128 then table.remove(records,1); droppedRecords=droppedRecords+1 end
        records[#records+1]=record
        table.remove(pending,index)
      end
    end
    return true
  end

  function observer:drain()
    local result={version=1,label="diagnostic_not_confirmed_acquisition",records=records,
      droppedPending=droppedPending,droppedRecords=droppedRecords,pendingCount=#pending}
    records,droppedPending,droppedRecords={},0,0
    return result
  end

  function observer:clear()
    pending,records,droppedPending,droppedRecords={},{},0,0
  end

  return observer
end

return probe

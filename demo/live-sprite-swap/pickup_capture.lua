local capture = {}

local function validContext(context)
  return type(context)=="table" and (context.save_slot==2 or context.save_slot==3)
    and type(context.session)=="string" and #context.session>0 and #context.session<=70
    and type(context.run)=="string" and #context.run>0 and #context.run<=80
    and type(context.room)=="string" and #context.room>0 and #context.room<=80
    and math.type(context.frame)=="integer" and context.frame>=0
end

local function copyContext(context)
  return {session=context.session,run=context.run,room=context.room,frame=context.frame,save_slot=context.save_slot}
end

function capture.new(observer,emit)
  local current,serial,recorded,discarded=nil,0,0,0
  local droppedPending,droppedRecords=0,0
  local adapter={}

  local function send(kind,fields)
    local packet={version=1,label="diagnostic_not_confirmed_acquisition",kind=kind,capture=serial,context=copyContext(current)}
    for key,value in pairs(fields or {}) do packet[key]=value end
    local ok=pcall(emit,packet)
    if not ok then observer:clear();current=nil end
    return ok
  end

  function adapter:stop(reason)
    if current then
      local report=observer:drain()
      droppedPending=droppedPending+report.droppedPending;droppedRecords=droppedRecords+report.droppedRecords
      send("stop",{reason=reason or "operator",recorded=recorded,discardedRecords=discarded+#report.records,
        pendingCount=report.pendingCount,droppedPending=droppedPending,droppedRecords=droppedRecords})
    end
    observer:clear();current=nil
  end

  function adapter:start(context,available)
    self:stop("restarted")
    if available~=true then return false,"Pickup pre/post collision callbacks are unavailable." end
    if not validContext(context) then return false,"Pickup capture requires an active run on Save File 2 or 3." end
    serial=serial+1;recorded,discarded=0,0;current=copyContext(context)
    droppedPending,droppedRecords=0,0
    if not send("start",{recordLimit=128}) then return false,"Pickup capture logging failed." end
    return true,"Read-only pickup capture enabled for this room (128 records maximum)."
  end

  local function check(context)
    if not current then return false end
    if not validContext(context) or context.session~=current.session or context.run~=current.run
      or context.room~=current.room or context.save_slot~=current.save_slot or context.frame<current.frame then
      adapter:stop("context_changed")
      return false
    end
    current.frame=context.frame
    return true
  end

  function adapter:before(pickup,collider,context)
    if check(context) then observer:before(pickup,collider,context.frame) end
  end

  function adapter:after(pickup,collider,context)
    if check(context) then observer:after(pickup,collider,context.frame) end
  end

  function adapter:tick(context)
    if not check(context) then return end
    observer:tick(context.frame)
    local report=observer:drain()
    droppedPending=droppedPending+report.droppedPending;droppedRecords=droppedRecords+report.droppedRecords
    for _,record in ipairs(report.records) do
      if recorded<128 then
        recorded=recorded+1
        if not send("record",{record=record,ordinal=recorded,pendingCount=report.pendingCount,
          droppedPending=droppedPending,droppedRecords=droppedRecords}) then return end
      else discarded=discarded+1 end
    end
    if recorded>=128 then self:stop("record_limit") end
  end

  function adapter:status()
    return {enabled=current~=nil,recorded=recorded,recordLimit=128}
  end

  function adapter:enabled()
    return current~=nil
  end

  return adapter
end

return capture

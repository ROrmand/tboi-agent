local Probe = RegisterMod("Nebius IPC Stage 2A", 1)

local armed = false
local tested = false
local startedFrame = 0
local result = "Press or hold 8 to test native IPC"

local function log(event, fields)
  Isaac.DebugString("[NebiusIPC][stage2a] " .. event .. " " .. fields)
end

function Probe:onGameStarted(isContinued)
  armed = false
  tested = false
  startedFrame = 0
  result = "Press or hold 8 to test native IPC"
  log("RUN_STARTED", "continued=" .. tostring(isContinued) .. " awaiting=KEY_8|KEY_KP_8")
end

function Probe:onUpdate()
  if tested then return end
  if not armed then
    if Input.IsButtonPressed(Keyboard.KEY_8, 0) or Input.IsButtonPressed(Keyboard.KEY_KP_8, 0) then
      armed = true
      startedFrame = Game():GetFrameCount()
      result = "Waiting for native IPC hello (10 second timeout)"
      log("INPUT_DETECTED", "frame=" .. tostring(Game():GetFrameCount()))
    end
    return
  end
  if type(NebiusBridge) ~= "table" or type(NebiusBridge.Poll) ~= "function" or type(NebiusBridge.Ack) ~= "function" then
    tested = true
    result = "FAIL: NebiusBridge binding unavailable"
    log("BINDING_UNAVAILABLE", "expected=NebiusBridge.Poll+Ack")
    return
  end
  local ok, raw = pcall(NebiusBridge.Poll)
  if not ok then
    tested = true
    result = "FAIL: native Poll error; see log"
    log("POLL_ERROR", "value=" .. tostring(raw))
    return
  end
  if raw == nil then
    if Game():GetFrameCount() - startedFrame >= 300 then
      tested = true
      result = "FAIL: IPC timed out; check bridge terminal"
      log("POLL_TIMEOUT", "frames=300")
    end
    return
  end
  tested = true
  if raw ~= '{"version":1,"type":"hello"}' then
    result = "FAIL: unexpected IPC message; see log"
    log("POLL_UNEXPECTED", "value=" .. tostring(raw))
    return
  end
  log("POLL_HELLO", "received=true")
  local ackOk, queued = pcall(NebiusBridge.Ack, "probe-1")
  if ackOk and queued then
    result = "HELLO received; ACK queued. Verify probe-1 in bridge terminal"
    log("ACK_QUEUED", "id=probe-1 delivery_requires_bridge_receipt=true")
  else
    result = "FAIL: acknowledgement could not be queued"
    log("ACK_ERROR", "id=probe-1")
  end
end

Probe:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, Probe.onGameStarted)
Probe:AddCallback(ModCallbacks.MC_POST_RENDER, function()
  Isaac.RenderText("Nebius IPC Stage 2A: " .. result, 20, 50, 1, 1, 1, 1)
end)
Probe:AddCallback(ModCallbacks.MC_POST_UPDATE, Probe.onUpdate)
log("LOADED", "operation=Poll+Ack_only control=KEY_8|KEY_KP_8")
return Probe

local Probe = RegisterMod("Nebius Native Stage 1", 1)

local TEST_NAME = "stage1i_existing_pedestal_overlay"
local IMAGE_PATH = "gfx/nebius_native_stage1/white.png"
local SURFACE_NAME = "nebius.stage1e.surface.v1"
local armed = false
local armedFrame = nil
local surface = nil
local sourceQuad = nil
local destinationQuad = nil
local surfaceCleared = false
local sourceRendered = false
local screenDrawn = false
local HOST_ITEM_ID = Isaac.GetItemIdByName("Live Profile Core")
local pedestalDrawn = false
local loaded = false
local settled = false
local image = nil

local function log(event, fields)
  Isaac.DebugString("[NebiusNative][" .. TEST_NAME .. "] " .. event .. " " .. fields)
end

local function reset()
  armed = false
  armedFrame = nil
  surface = nil
  sourceQuad = nil
  destinationQuad = nil
  surfaceCleared = false
  sourceRendered = false
  screenDrawn = false
  pedestalDrawn = false
  loaded = false
  settled = false
  image = nil
end

function Probe:onGameStarted(isContinued)
  reset()
  log("RUN_STARTED", "continued=" .. tostring(isContinued) .. " awaiting=KEY_8|KEY_KP_8")
end

function Probe:onUpdate()
  local frame = Game():GetFrameCount()
  if not armed then
    local key = nil
    -- Some compact keyboards report a held number-row key without producing
    -- a one-frame "triggered" edge.  Accept either form; `armed` still makes
    -- this strictly one-shot for the run.
    local function pressed(candidate)
      if Input.IsButtonTriggered(candidate, 0) then return true end
      local ok, value = pcall(Input.IsButtonPressed, candidate, 0)
      return ok and value == true
    end
    if pressed(Keyboard.KEY_8) then
      key = "KEY_8"
    elseif pressed(Keyboard.KEY_KP_8) then
      key = "KEY_KP_8"
    end
    if key then
      armed = true
      armedFrame = frame
      log("INPUT_DETECTED", "key=" .. key .. " frame=" .. tostring(frame) .. " time_ms=" .. tostring(Isaac.GetTime()))
      log("UPDATE_ARMED", "frame=" .. tostring(frame) .. " native_calls=compose_surface_then_existing_pedestal_overlay")
    end
    return
  end
  if loaded and not settled and frame - armedFrame >= 60 then
    settled = true
    log("UPDATE_STABLE", "frame=" .. tostring(frame) .. " elapsed_frames=" .. tostring(frame - armedFrame) .. " surface_created=true image_loaded=true quads_created=true surface_cleared=true source_rendered=true awaiting_existing_pedestal=true")
  end
end

function Probe:onRender()
  if not armed or loaded then return end
  local frame = Game():GetFrameCount()
  if not Renderer or type(Renderer.CreateImage) ~= "function" or type(Renderer.LoadImage) ~= "function" or type(Renderer.RenderToImage) ~= "function" or not SourceQuad or type(SourceQuad.NewFromRectangle) ~= "function" or not DestinationQuad or type(DestinationQuad.NewFromRectangle) ~= "function" then
    log("NATIVE_CALLS_SKIPPED", "frame=" .. tostring(frame) .. " reason=required_native_binding_unavailable")
    return
  end
  log("CREATEIMAGE_CALL_BEGIN", "frame=" .. tostring(frame) .. " width=32 height=32 name=" .. SURFACE_NAME)
  local createOk, created = pcall(Renderer.CreateImage, 32, 32, SURFACE_NAME)
  if not createOk or not created then
    log("CREATEIMAGE_CALL_ERROR", "frame=" .. tostring(frame) .. " detail=" .. tostring(created))
    return
  end
  surface = created
  log("CREATEIMAGE_CALL_OK", "frame=" .. tostring(frame) .. " surface_retained=true draw=false spawn=false")
  log("LOADIMAGE_CALL_BEGIN", "frame=" .. tostring(frame) .. " path=" .. IMAGE_PATH)
  local ok, value = pcall(Renderer.LoadImage, IMAGE_PATH)
  if not ok or not value then
    log("LOADIMAGE_CALL_ERROR", "frame=" .. tostring(frame) .. " detail=" .. tostring(value))
    return
  end
  image = value
  log("SOURCEQUAD_CALL_BEGIN", "frame=" .. tostring(frame) .. " x=0 y=0 width=1 height=1 uv=false")
  local sourceOk, source = pcall(SourceQuad.NewFromRectangle, Vector(0, 0), 1, 1, false)
  if not sourceOk or not source then
    log("SOURCEQUAD_CALL_ERROR", "frame=" .. tostring(frame) .. " detail=" .. tostring(source))
    return
  end
  sourceQuad = source
  log("SOURCEQUAD_CALL_OK", "frame=" .. tostring(frame) .. " quad_retained=true render_to_image=false draw=false")
  log("DESTINATIONQUAD_CALL_BEGIN", "frame=" .. tostring(frame) .. " x=0 y=0 width=32 height=32")
  local destinationOk, destination = pcall(DestinationQuad.NewFromRectangle, Vector(0, 0), 32, 32)
  if not destinationOk or not destination then
    log("DESTINATIONQUAD_CALL_ERROR", "frame=" .. tostring(frame) .. " detail=" .. tostring(destination))
    return
  end
  destinationQuad = destination
  log("DESTINATIONQUAD_CALL_OK", "frame=" .. tostring(frame) .. " quad_retained=true render_to_image=false draw=false")
  log("RENDERTOIMAGE_BEGIN", "frame=" .. tostring(frame) .. " source_render=true screen_draw=false")
  local clearOk, clearFailure = pcall(function()
    Renderer.RenderToImage(surface, function(controller)
      controller:Clear()
      image:Render(sourceQuad, destinationQuad, KColor(1, 1, 1, 1))
    end)
  end)
  if not clearOk then
    log("RENDERTOIMAGE_ERROR", "frame=" .. tostring(frame) .. " detail=" .. tostring(clearFailure))
    return
  end
  surfaceCleared = true
  sourceRendered = true
  log("RENDERTOIMAGE_OK", "frame=" .. tostring(frame) .. " surface_retained=true source_rendered=true screen_draw=false")
  loaded = true
  log("LOADIMAGE_CALL_OK", "frame=" .. tostring(frame) .. " image_retained=true surface_retained=true quads_retained=true surface_cleared=true source_rendered=true item_bound=false spawn=false")
end

function Probe:onPickupRender(pickup, offset)
  if not loaded or HOST_ITEM_ID <= 0 or pickup.SubType ~= HOST_ITEM_ID then return end
  local worldPosition = pickup.Position + pickup.PositionOffset
  local screenPosition = Isaac.WorldToScreen(worldPosition) + Vector(-16, -16)
  local surfaceQuad = SourceQuad.NewFromRectangle(Vector(0, 0), 32, 32, false)
  local destination = DestinationQuad.NewFromRectangle(screenPosition, 32, 32)
  local ok, failure = pcall(function()
    surface:Render(surfaceQuad, destination, KColor(1, 1, 1, 1))
  end)
  if not ok then
    log("PEDESTAL_RENDER_ERROR", "detail=" .. tostring(failure))
    return
  end
  screenDrawn = true
  if not pedestalDrawn then
    pedestalDrawn = true
    log("PEDESTAL_RENDER_OK", "host_item_id=" .. tostring(HOST_ITEM_ID) .. " item_bound=true spawn=false")
  end
end

function Probe:onGameExit()
  log("GAME_EXIT", "armed=" .. tostring(armed) .. " surface=" .. tostring(surface ~= nil) .. " source_quad=" .. tostring(sourceQuad ~= nil) .. " destination_quad=" .. tostring(destinationQuad ~= nil) .. " cleared=" .. tostring(surfaceCleared) .. " source_rendered=" .. tostring(sourceRendered) .. " screen_drawn=" .. tostring(screenDrawn) .. " loaded=" .. tostring(loaded) .. " settled=" .. tostring(settled) .. " spawn=false")
  reset()
end

Probe:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, Probe.onGameStarted)
Probe:AddCallback(ModCallbacks.MC_POST_UPDATE, Probe.onUpdate)
Probe:AddCallback(ModCallbacks.MC_POST_RENDER, Probe.onRender)
Probe:AddCallback(ModCallbacks.MC_POST_PICKUP_RENDER, Probe.onPickupRender)
Probe:AddCallback(ModCallbacks.MC_PRE_GAME_EXIT, Probe.onGameExit)
log("LOADED", "console_callback=false operation=existing_pedestal_overlay host_item_id=" .. tostring(HOST_ITEM_ID) .. " fixed_overlay=false item_bound=true spawn=false control=KEY_8|KEY_KP_8")
return Probe

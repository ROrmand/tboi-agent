local Runtime = {}
Runtime.__index = Runtime

local colors = {
  { 1, 0.15, 0.15, 1 },
  { 0.15, 1, 0.15, 1 },
  { 0.15, 0.3, 1, 1 },
}

function Runtime.capabilities()
  local missing = {}
  for _, name in ipairs({ "LoadImage", "CreateImage", "RenderToImage" }) do
    if not Renderer or type(Renderer[name]) ~= "function" then
      missing[#missing + 1] = "Renderer." .. name
    end
  end
  if not SourceQuad or type(SourceQuad.NewFromRectangle) ~= "function" then
    missing[#missing + 1] = "SourceQuad.NewFromRectangle"
  end
  if not DestinationQuad or type(DestinationQuad.NewFromRectangle) ~= "function" then
    missing[#missing + 1] = "DestinationQuad.NewFromRectangle"
  end
  return #missing == 0, table.concat(missing, ", ")
end

function Runtime.new()
  return setmetatable({ phase = nil, updates = 0, renders = 0, error = nil }, Runtime)
end

function Runtime:initialize()
  local available, reason = Runtime.capabilities()
  if not available then return false, "Missing native bindings: " .. reason end
  if self.surface then return true end
  local ok, failure = pcall(function()
    self.seed = Renderer.LoadImage("gfx/nebius_native_stage1/white.png")
    self.surface = Renderer.CreateImage(32, 32, "nebius.native.stage1.surface.v1")
    self.seedQuad = SourceQuad.NewFromRectangle(Vector(0, 0), 1, 1, false)
    self.surfaceQuad = SourceQuad.NewFromRectangle(Vector(0, 0), 32, 32, false)
    self.fillQuad = DestinationQuad.NewFromRectangle(Vector(0, 0), 32, 32)
  end)
  if not ok then
    self.surface = nil
    self.error = tostring(failure)
    return false, self.error
  end
  return true
end

function Runtime:update(now)
  local initialized, failure = self:initialize()
  if not initialized then return false, failure end
  local phase = math.floor(now / 1000) % #colors + 1
  if phase == self.phase then return true end
  local tint = colors[phase]
  local ok, renderError = pcall(function()
    Renderer.RenderToImage(self.surface, function(controller)
      controller:Clear()
      self.seed:Render(self.seedQuad, self.fillQuad, KColor(tint[1], tint[2], tint[3], tint[4]))
    end)
  end)
  if not ok then
    self.error = tostring(renderError)
    return false, self.error
  end
  self.phase = phase
  self.updates = self.updates + 1
  return true
end

function Runtime:render(topLeft)
  if not self.surface or not self.phase then return false, "Surface is not ready" end
  local ok, failure = pcall(function()
    local destination = DestinationQuad.NewFromRectangle(topLeft, 32, 32)
    self.surface:Render(self.surfaceQuad, destination, KColor(1, 1, 1, 1))
  end)
  if not ok then
    self.error = tostring(failure)
    return false, self.error
  end
  self.renders = self.renders + 1
  return true
end

return Runtime

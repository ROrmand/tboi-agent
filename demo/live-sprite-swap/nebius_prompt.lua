local Prompt = {}
Prompt.__index = Prompt

local windowId = "nebius_passive_generator_v2"
local statusId = "nebius_passive_status_v2"
local inputId = "nebius_passive_input_v2"
local randomizeId = "nebius_passive_randomize_v2"

local randomPrompts = {
  "A cracked lunar lantern that makes tears glow pale blue and occasionally drops a key after clearing a room.",
  "A cursed honeycomb that makes tears sticky amber, adds a little damage, and sometimes drops a heart after taking damage.",
  "A tiny thundercloud in a bottle that fires fast electric-blue tears and sometimes drops a coin on room clear.",
  "A mossy knight helmet that grants range, poison-green tears, and a small chance to drop a bomb after clearing a room.",
  "A glass telescope that gives homing cosmic tears, extra luck, and sometimes grants a soul heart on a new floor.",
  "A rusted music box that makes slow violet tears, raises fire rate, and occasionally drops a key after a room clear.",
  "A frozen peach that gives icy blue slow tears, a little movement speed, and sometimes drops a heart on room clear.",
  "A beetle-shaped locket that gives piercing red tears, damage, and a chance to drop a coin when an enemy is hit.",
  "A small angel statue with bright white spectral tears, range, and a chance to gain a soul heart on a new floor.",
  "A bubbling cauldron that gives green poison tears, luck, and sometimes drops a bomb after clearing a room.",
  "A black candle with orange burn tears, damage, and a chance to drop a key after clearing a room.",
  "A clockwork eye that gives bouncing gold tears, shot speed, and sometimes drops a coin after an enemy is hit.",
}

function Prompt.new(json)
  return setmetatable({ json = json, ready = false, failed = false, requested = false, held = false, sequence = 0, pending = nil, status = "Describe a passive item. Keep the local bridge running.", text = "" }, Prompt)
end

function Prompt:call(name, ...)
  Isaac.DebugString("[NebiusPrompt] UI_CALL_BEGIN " .. name)
  local result = ImGui[name](...)
  Isaac.DebugString("[NebiusPrompt] UI_CALL_OK " .. name)
  return result
end

function Prompt:submit()
  if self.pending then return end
  local context = self.getContext and self.getContext()
  if context and context.blocked then self.status = context.blocked; return end
  local trimmed = self.text:match("^%s*(.-)%s*$")
  if #trimmed == 0 or #trimmed > 2000 then self.status = "Enter a prompt between 1 and 2000 characters."; return end
  if not self.json or type(self.json.encode) ~= "function" then self.status = "JSON support is unavailable."; return end
  self.sequence = self.sequence + 1
  local requestId = (context and context.run or "ui") .. "_" .. tostring(Random()) .. "_" .. tostring(self.sequence)
  local encodedOk, encoded = pcall(self.json.encode, { id = requestId, prompt = trimmed })
  if not encodedOk then self.status = "Could not encode the prompt."; return end
  self.pending, self.started = requestId, Isaac.GetTime()
  self.status = "Submitted. Waiting for the bridge..."
  if context then Isaac.DebugString("[NebiusBridge] state " .. self.json.encode(context)) end
  Isaac.DebugString("[NebiusBridge] generate " .. encoded)
  self:close()
end

function Prompt:randomize()
  if self.pending then return end
  local choice = (Random() % #randomPrompts) + 1
  if #randomPrompts > 1 and choice == self.lastRandomChoice then
    choice = (choice % #randomPrompts) + 1
  end
  self.lastRandomChoice = choice
  self.text = randomPrompts[choice]
  local updated = pcall(function()
    -- ImGuiData.Value is 1. Keeping the numeric form avoids relying on the
    -- enum table being exported by older REPENTOGON builds.
    self:call("UpdateData", inputId, 1, self.text)
  end)
  if updated then
    self.status = "Random passive idea ready. Edit it or generate it."
  else
    self.status = "Random passive idea ready. Generate it or type to replace it."
  end
end

function Prompt:close()
  ImGui.SetVisible(windowId, false)
  ImGui.Hide()
end

function Prompt:receive(id, status, detail)
  if id ~= self.pending then return end
  self.status = detail
  if status == "error" or status == "accepted" then self.pending = nil end
end

function Prompt:updateInput()
  local pressed = Input.IsButtonPressed(Keyboard.KEY_8, 0) or Input.IsButtonPressed(Keyboard.KEY_KP_8, 0)
  if pressed and not self.held then self.requested = true end
  self.held = pressed
end

function Prompt:render()
  if self.failed then return end
  if self.pending and Isaac.GetTime() - self.started > 370000 then self.pending = nil; self.status = "Bridge timed out. Check its terminal before submitting again." end
  if not self.requested and not self.ready then return end
  if type(ImGui) ~= "table" then self.failed = true; Isaac.DebugString("[NebiusPrompt] UI_UNAVAILABLE"); return end
  local renderOk, failure = pcall(function()
    if not self.ready then
      self:call("CreateWindow", windowId, "Nebius Passive Item Generator")
      self:call("AddText", windowId, "Passive items only. Generated JSON is validated before use.", true, "nebius_passive_help_v2")
      self:call("AddInputTextMultiline", windowId, inputId, "Item prompt", function(value) self.text = value end, "", 6)
      self:call("AddButton", windowId, randomizeId, "Randomize", function() self:randomize() end)
      self:call("AddButton", windowId, "nebius_passive_submit_v2", "Generate Item", function() self:submit() end)
      self:call("AddButton", windowId, "nebius_passive_close_v2", "Close", function() self:close() end)
      self:call("AddText", windowId, self.status, true, statusId)
      self:call("SetSize", windowId, 540, 300)
      self:call("SetVisible", windowId, false)
      self.ready = true
    end
    if self.requested then
      self.requested = false
      if not ImGui.GetVisible(windowId) then self:call("SetVisible", windowId, true); self:call("Show") end
    end
    if self.lastStatus ~= self.status then ImGui.UpdateText(statusId, self.status); self.lastStatus = self.status end
  end)
  if not renderOk then self.failed = true; Isaac.DebugString("[NebiusPrompt] UI_ERROR " .. tostring(failure)) end
end

return Prompt

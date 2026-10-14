local Prompt = {}
Prompt.__index = Prompt

local windowId = "nebius_passive_generator_v2"
local statusId = "nebius_passive_status_v2"
local inputId = "nebius_passive_input_v2"
local randomizeId = "nebius_passive_randomize_v2"

local moments = {
  "clear a room", "get hit", "hit an enemy", "reach a new floor", "pick this up",
}
local payoffs = {
  "I sometimes find a coin", "I sometimes find a key", "I sometimes find a bomb",
  "I sometimes find a heart", "grant me a soul heart",
}
local tearLines = {
  "Tears home in.", "Tears pass through rocks.", "Tears poison.", "Tears burn.",
  "Tears slow enemies.", "Tears scare enemies.", "Tears charm enemies.",
  "Tears bounce.", "Tears split.", "Tears glow.", "Tears pierce.", "Tears orbit me.",
}
local statLines = {
  "Add damage.", "Fire a little faster.", "Raise shot speed.", "Add range.",
  "Move a bit faster.", "Add luck.", "Take a speed hit for more damage.",
  "Lower damage and raise tears.", "A little range, and no extra damage.",
}
local familiarLines = {
  "A familiar orbits me and fires.",
  "A familiar follows behind me and fires.",
  "A familiar stays close and strikes in melee. It does not shoot.",
  "A shield familiar stands between me and enemies, blocks a hit, and deals contact damage.",
}
local auraLines = {
  "Enemies near me take a pulse of damage.",
  "A short damage aura ticks around me.",
}

local function pick(list)
  return list[(Random() % #list) + 1]
end

local function randomSentence()
  local shape = (Random() % 8) + 1
  if shape == 6 then
    return pick(familiarLines) .. " " .. pick(tearLines)
  elseif shape == 7 then
    return pick(auraLines) .. " " .. pick(statLines)
  elseif shape == 1 or shape == 4 then
    return "When I " .. pick(moments) .. ", " .. pick(payoffs) .. ". " .. pick(tearLines) .. " " .. pick(statLines)
  elseif shape == 2 or shape == 5 or shape == 8 then
    return pick(statLines) .. " " .. pick(tearLines) .. " When I " .. pick(moments) .. ", " .. pick(payoffs) .. "."
  end
  return pick(tearLines) .. " " .. pick(statLines)
end

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
  self.text = randomSentence()
  if self.text == self.lastRandomSentence then self.text = randomSentence() end
  self.lastRandomSentence = self.text
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

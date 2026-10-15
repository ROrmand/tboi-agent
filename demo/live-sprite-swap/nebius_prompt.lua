local Prompt = {}
Prompt.__index = Prompt

local windowId = "nebius_passive_generator_v2"
local statusId = "nebius_passive_status_v2"
local inputId = "nebius_passive_input_v2"
local randomizeId = "nebius_passive_randomize_v2"

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
  self.pending, self.started, self.pendingKind = requestId, Isaac.GetTime(), nil
  self.status = "Submitted. Waiting for the bridge..."
  if context then Isaac.DebugString("[NebiusBridge] state " .. self.json.encode(context)) end
  Isaac.DebugString("[NebiusBridge] generate " .. encoded)
  self:close()
end

function Prompt:randomize()
  if self.pending then return end
  local context = self.getContext and self.getContext()
  if context and context.blocked then self.status = context.blocked; return end
  if not self.json or type(self.json.encode) ~= "function" then self.status = "JSON support is unavailable."; return end
  self.sequence = self.sequence + 1
  local requestId = (context and context.run or "ui") .. "_" .. tostring(Random()) .. "_" .. tostring(self.sequence)
  local encodedOk, encoded = pcall(self.json.encode, { id = requestId })
  if not encodedOk then self.status = "Could not encode the sentence request."; return end
  self.pending, self.started, self.pendingKind = requestId, Isaac.GetTime(), "sentence"
  self.status = "Asking for a random sentence..."
  if context then Isaac.DebugString("[NebiusBridge] state " .. self.json.encode(context)) end
  Isaac.DebugString("[NebiusBridge] sentence " .. encoded)
end

function Prompt:applySentence(sentence)
  local trimmed = type(sentence) == "string" and sentence:match("^%s*(.-)%s*$") or ""
  if #trimmed < 12 or #trimmed > 180 or trimmed:find("\n", 1, true) then
    self.pending, self.pendingKind = nil, nil
    self.status = "The random sentence was unusable. Try again."
    return
  end
  self.text, self.lastRandomSentence = trimmed, trimmed
  self.pending, self.pendingKind = nil, nil
  -- ImGuiData.Value is 1. Keeping the numeric form avoids relying on the
  -- enum table being exported by older REPENTOGON builds.
  local updated = pcall(function() self:call("UpdateData", inputId, 1, self.text) end)
  if updated then self.status = "Random sentence ready. Edit it or generate it."
  else self.status = "Random sentence ready. Generate it or type to replace it." end
end

function Prompt:close()
  ImGui.SetVisible(windowId, false)
  ImGui.Hide()
end

function Prompt:receive(id, status, detail)
  if id ~= self.pending then return end
  if status == "sentence" and self.pendingKind == "sentence" then self:applySentence(detail); return end
  self.status = detail
  if status == "error" or status == "accepted" then self.pending, self.pendingKind = nil, nil end
end

function Prompt:updateInput()
  local pressed = Input.IsButtonPressed(Keyboard.KEY_8, 0) or Input.IsButtonPressed(Keyboard.KEY_KP_8, 0)
  if pressed and not self.held then self.requested = true end
  self.held = pressed
end

function Prompt:render()
  if self.failed then return end
  if self.pending and Isaac.GetTime() - self.started > 370000 then self.pending, self.pendingKind = nil, nil; self.status = "Bridge timed out. Check its terminal before submitting again." end
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

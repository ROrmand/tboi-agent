local Prompt = {}
Prompt.__index = Prompt
-- Active shells and handlers remain in the mod. The creator does not offer them.
local ACTIVES_ENABLED = false

local labels = { editing="READY", randomizing="FINDING AN IDEA", generating="GENERATING ITEM",
  success="ITEM READY", error="NEEDS ATTENTION" }
local sounds = { open="SOUND_PAPER_IN", close="SOUND_PAPER_OUT", submit="SOUND_BUTTON_PRESS",
  success="SOUND_POWERUP1", error="SOUND_THUMBS_DOWN" }
local stages = { startup="Checking services...", idea="Inventing an idea...", retry="Trying another idea...", expand="Planning mechanics...", text="Designing item...",
  repair="Correcting the design...", image="Rendering artwork...", art="Preparing item artwork...",
  familiar_art="Rendering familiar artwork...", familiar_anim="Preparing familiar animation...",
  publish="Validating the item...", deliver="Waiting for Isaac to apply the item..." }
local function play(cue)
  local id = SoundEffect and SoundEffect[sounds[cue]]
  if id then pcall(function() SFXManager():Play(id, 0.6) end) end
end

function Prompt.new(json)
  return setmetatable({ json=json, failed=false, requested=false, held=false,
    open=false, sequence=0, phase="editing", status="Describe a passive item, or choose Randomize.",
    text="", quality=3, itemType="passive", activesEnabled=ACTIVES_ENABLED, keyHeld={}, focus=1, hudHidden=false,
    page="creator", menuFocus=1, itemIndex=1, detailScroll=0, pauseLibrary=false }, Prompt)
end

function Prompt:logError(category, detail)
  local event = { id=self.pending or "ui", phase=self.phase, category=category,
    detail=tostring(detail):sub(1,500) }
  if self.json and self.json.encode then
    local ok, encoded = pcall(self.json.encode, event)
    if ok then Isaac.DebugString("[NebiusBridge] error " .. encoded); return end
  end
  Isaac.DebugString("[NebiusPrompt] ERROR " .. category .. " " .. event.detail)
end

function Prompt:fail(category, message, detail)
  self:logError(category, detail or message)
  local id=self.pending
  self.pending, self.pendingKind = nil, nil
  self.phase, self.status = "error", message
  if id and self.requestFailed and category~="timeout" then self.requestFailed(id) end
  play("error")
end

function Prompt:send(kind, data)
  if self.pending then return end
  local context = self.getContext and self.getContext()
  if kind=="generate" and context and context.blocked then self:fail("capacity", context.blocked); return end
  if not self.json or type(self.json.encode)~="function" then self:fail("ui","JSON support is unavailable."); return end
  self.sequence = self.sequence + 1
  local id = (context and context.run or "ui") .. "_" .. tostring(Random()) .. "_" .. tostring(self.sequence)
  data.id = id
  if kind=="generate" and self.prepareRequest then
    local ready,reason=self.prepareRequest(id,data)
    if not ready then self:fail("request",reason); return end
  end
  local ok, encoded = pcall(self.json.encode, data)
  if not ok then self:fail("ui","Could not prepare the request.",encoded); return end
  self.pending, self.started, self.pendingKind = id, Isaac.GetTime(), kind
  self.phase = kind=="sentence" and "randomizing" or "generating"
  self.status = kind=="sentence" and "Finding an idea..." or "Waiting for the bridge..."
  if self.persist and not self.persist() then self:fail("save","Could not save the request. Generation blocked."); return end
  if context then Isaac.DebugString("[NebiusBridge] state " .. self.json.encode(context)) end
  Isaac.DebugString("[NebiusBridge] " .. kind .. " " .. encoded)
  play("submit")
  if kind=="generate" then self:close() end
end

function Prompt:submit()
  if self.pending then return end
  local trimmed = self.text:match("^%s*(.-)%s*$")
  if #trimmed==0 or #trimmed>2000 then
    self:fail("input","Enter a prompt between 1 and 2000 characters."); return
  end
  if not self.activesEnabled then self.itemType="passive" end
  local context=self.getContext and self.getContext() or {}
  if self.itemType=="active" and (context.active_available~=true or (context.active_count or 0)>=8) then self:fail("capacity","Active shell limit reached or unavailable (8)."); return end
  self:send("generate",{prompt=trimmed,quality=self.quality,item_type=self.itemType})
end

function Prompt:randomize()
  self:send("sentence",{})
end

function Prompt:applySentence(sentence)
  local trimmed = type(sentence)=="string" and sentence:match("^%s*(.-)%s*$") or ""
  if #trimmed<12 or #trimmed>180 or trimmed:find("\n",1,true) then
    self:fail("sentence","The random idea was unusable. Try again."); return
  end
  self.text=trimmed
  self.pending,self.pendingKind=nil,nil
  self.phase,self.status="editing","Idea ready. Edit it or generate the item."
end

function Prompt:close()
  local wasOpen=self.open
  self.open=false
  self.requested=false
  self.virtualKeyboard=false
  self.page,self.pauseLibrary="creator",false
  self.menuFocus,self.itemIndex,self.detailScroll=1,1,0
  self.keyHeld={}
  self:setHudHidden(false)
  if self.persist and not self.resetting then self.persist() end
  if wasOpen then play("close") end
end

function Prompt:setHudHidden(hidden)
  if self.hudHidden==hidden then return end
  local ok,hud=pcall(function() return Game():GetHUD() end)
  if ok and hud and hud.SetVisible then
    local changed=pcall(hud.SetVisible,hud,not hidden)
    if changed then self.hudHidden=hidden end
  end
end

function Prompt:receive(id,status,detail,errorCode)
  if id~=self.pending then return end
  if status=="sentence" and self.pendingKind=="sentence" then self:applySentence(detail); return end
  if status=="error" then
    local message="Generation failed. Edit your idea and retry."
    if type(detail)=="string" then
      if detail:find("ComfyUI",1,true) or detail:lower():find("image service",1,true) then
        message="Art service unavailable. Start ComfyUI and retry."
      elseif detail:lower():find("another request",1,true) then
        message="Another request is running. Wait, then retry."
      elseif detail:lower():find("timed out",1,true) then
        message="Generation timed out. Try a shorter idea."
      end
    end
    local messages={RUNTIME_INCOMPATIBLE="Restart Isaac with the updated mod.",SAVE_SLOT_UNAVAILABLE="Select a save slot and restart Isaac.",CAPACITY="Capacity or request limit reached. Check the bridge details.",STALE_RUN="This request belongs to an ended run. Retry here.",PERSISTENCE_FAILED="Save failed. Check disk access before retrying.",INVALID_OUTPUT="Item design was invalid. Edit the idea and retry.",DELIVERY_FAILED="Delivery failed. Check the bridge and retry.",INTERRUPTED="Generation was interrupted. Your prompt is kept.",CANCELLED="Request cancelled. AI Item kept."}
    message=messages[errorCode] or message
    self:fail("bridge",message,detail)
    self.requested=true
    return
  end
  if status=="accepted" then
    if self.pendingKind=="generate" then self.text="" end
    self.pending,self.pendingKind=nil,nil
    self.phase,self.status="success",detail
    play("success")
  elseif status=="generating" then
    self.phase="generating"
    local stage=type(detail)=="string" and detail:match(":%s*([%w_]+)$")
    self.status=stages[stage] or (type(detail)=="string" and detail:sub(1,120) or "Generating item...")
  end
end

function Prompt:updateInput()
  local key=self.getHotkey and self.getHotkey() or "KEY_8"
  local pressed=Keyboard[key] and Input.IsButtonPressed(Keyboard[key],0) or false
  if key=="KEY_8" and Keyboard.KEY_KP_8 then pressed=pressed or Input.IsButtonPressed(Keyboard.KEY_KP_8,0) end
  local owner
  if Input.IsActionPressed and ButtonAction and ButtonAction.ACTION_MAP and ButtonAction.ACTION_DROP then
    for p=0,Game():GetNumPlayers()-1 do
      local player=Isaac.GetPlayer(p); local controller=player.ControllerIndex or 0
      if Input.IsActionPressed(ButtonAction.ACTION_MAP,controller) and Input.IsActionPressed(ButtonAction.ACTION_DROP,controller) then pressed=true; owner=player; self.controller=controller; break end
    end
  end
  if pressed and not self.held and not self.open then
    if self.selectOwner then self.selectOwner(owner) end
    self.requested=true
    Isaac.DebugString("[NebiusPrompt] OPEN_REQUEST")
  end
  self.held=pressed
end

function Prompt:shouldPause()
  return self.open and not self.failed
end

function Prompt:shouldHideGameOverlays()
  return self.open and not self.failed
end

function Prompt:reset()
  self.resetting=true
  self:close()
  self.resetting=false
  self.pending,self.pendingKind,self.suppressOpen=nil,nil,false
  self.requested=false
  self.phase,self.status="editing","Describe a passive item, or choose Randomize."
end

function Prompt:renderIndicator()
  if not self.pending then return end
  local tick=math.floor(Isaac.GetTime()/150)%8
  local x,y=37,Isaac.GetScreenHeight()-38
  local points={{0,-11},{8,-8},{11,0},{8,8},{0,11},{-8,8},{-11,0},{-8,-8}}
  for index,point in ipairs(points) do
    local shade=0.25+(7-(index-tick-1)%8)*0.1
    Isaac.RenderText(".",x+point[1],y+point[2],shade,shade,1,1)
  end
  local label=self.pendingKind=="sentence" and "Finding an idea..." or self.status
  Isaac.RenderText(tostring(label):sub(1,55),58,y,0.8,0.9,1,1)
end

local keyCharacters = {
  { "KEY_SPACE", " ", " " }, { "KEY_MINUS", "-", "_" }, { "KEY_EQUAL", "=", "+" },
  { "KEY_COMMA", ",", "<" }, { "KEY_PERIOD", ".", ">" }, { "KEY_SLASH", "/", "?" },
  { "KEY_SEMICOLON", ";", ":" }, { "KEY_APOSTROPHE", "'", '"' },
  { "KEY_LEFT_BRACKET", "[", "{" }, { "KEY_RIGHT_BRACKET", "]", "}" },
  { "KEY_BACKSLASH", "\\", "|" }, { "KEY_GRAVE_ACCENT", "`", "~" },
}
local shiftedNumbers = { ")", "!", "@", "#", "$", "%", "^", "&", "*", "(" }
for code=string.byte("A"),string.byte("Z") do
  local letter=string.char(code)
  keyCharacters[#keyCharacters+1]={"KEY_"..letter,letter:lower(),letter}
end
for number=0,9 do
  keyCharacters[#keyCharacters+1]={"KEY_"..number,tostring(number),shiftedNumbers[number+1]}
  keyCharacters[#keyCharacters+1]={"KEY_KP_"..number,tostring(number),tostring(number)}
end

-- Kept for later controller text entry. Space/Confirm currently map to menu
-- confirm in Isaac, so the on-screen keyboard stays unhooked from this panel.
local CONTROLLER_KEYBOARD=false

function Prompt:controlDown()
  return (Keyboard.KEY_LEFT_CONTROL and Input.IsButtonPressed(Keyboard.KEY_LEFT_CONTROL,0))
    or (Keyboard.KEY_RIGHT_CONTROL and Input.IsButtonPressed(Keyboard.KEY_RIGHT_CONTROL,0))
    or false
end

function Prompt:appendText(text)
  if type(text)~="string" or text=="" then return end
  text=text:gsub("\r\n","\n"):gsub("\r","\n"):gsub("%z","")
  local remaining=2000-#self.text
  if remaining<=0 then return end
  self.text=self.text..text:sub(1,remaining)
end

function Prompt:pasteClipboard()
  if type(Isaac.GetClipboard)~="function" then return end
  local ok,clip=pcall(Isaac.GetClipboard)
  if ok then self:appendText(clip) end
end

function Prompt:copyToClipboard()
  if type(Isaac.SetClipboard)~="function" then return end
  pcall(Isaac.SetClipboard,self.text or "")
end

function Prompt:keyPressed(name,repeatable,useMenu)
  local code=Keyboard[name]
  local down=code and Input.IsButtonPressed(code,0) or false
  if useMenu~=false then
    local action=({KEY_LEFT="ACTION_MENULEFT",KEY_RIGHT="ACTION_MENURIGHT",KEY_UP="ACTION_MENUUP",KEY_DOWN="ACTION_MENUDOWN",KEY_ENTER="ACTION_MENUCONFIRM",KEY_ESCAPE="ACTION_MENUBACK",KEY_TAB="ACTION_MAP"})[name]
    if action and Input.IsActionPressed and ButtonAction and ButtonAction[action] then down=down or Input.IsActionPressed(ButtonAction[action],self.controller or 0) end
  end
  local previous=self.keyHeld[name]
  if not down then self.keyHeld[name]=nil; return false end
  local now=Isaac.GetTime()
  if not previous then self.keyHeld[name]=now+400; return true end
  if repeatable and now>=previous then self.keyHeld[name]=now+65; return true end
  return false
end

function Prompt:confirmPressed()
  if Keyboard.KEY_SPACE and Input.IsButtonPressed(Keyboard.KEY_SPACE,0) then return false end
  return self:keyPressed("KEY_ENTER",false) or self:keyPressed("KEY_KP_ENTER",false)
end

function Prompt:editInput()
  if Isaac.GetTime()-(self.openedAt or 0)<150 then return end
  if self.page~="creator" then self:editMenu(); return end
  if self:keyPressed("KEY_TAB",false) then
    if self.activesEnabled then self.itemType=self.itemType=="active" and "passive" or "active" end
    return
  end
  local shift=(Keyboard.KEY_LEFT_SHIFT and Input.IsButtonPressed(Keyboard.KEY_LEFT_SHIFT,0)) or
    (Keyboard.KEY_RIGHT_SHIFT and Input.IsButtonPressed(Keyboard.KEY_RIGHT_SHIFT,0))
  local ctrl=self:controlDown()
  if self:keyPressed("KEY_ESCAPE",false) then
    if CONTROLLER_KEYBOARD and self.virtualKeyboard then self.virtualKeyboard=false else self:close() end
    return
  end
  if CONTROLLER_KEYBOARD and self.virtualKeyboard then self:editVirtualKeyboard(); return end
  if ctrl then
    if self:keyPressed("KEY_V",false,false) then self:pasteClipboard(); return end
    if self:keyPressed("KEY_C",false,false) then self:copyToClipboard(); return end
  end
  if self.focus==1 then
    if CONTROLLER_KEYBOARD and self:confirmPressed() then self.virtualKeyboard=true; self.letter=1; return end
    if self:keyPressed("KEY_RIGHT",false) then self.focus=5+self.quality; return end
    if self:keyPressed("KEY_DOWN",false) then self.focus=2; return end
  end
  if self.focus>1 then
    if self.focus>=5 then
      if self:keyPressed("KEY_LEFT",false) then self.focus=1; return end
      if self:keyPressed("KEY_RIGHT",false) then self.focus=3; return end
      if self:keyPressed("KEY_UP",false) then self.focus=self.focus==5 and 2 or self.focus-1; return end
      if self:keyPressed("KEY_DOWN",false) then self.focus=self.focus==9 and 2 or self.focus+1; return end
      if self:confirmPressed() then
        self.quality=self.focus-5
        return
      end
      return
    end
    if self:keyPressed("KEY_LEFT",false) then self.focus=self.focus==2 and 4 or self.focus-1; return end
    if self:keyPressed("KEY_RIGHT",false) then self.focus=self.focus==4 and 2 or self.focus+1; return end
    if self:keyPressed("KEY_UP",false) then self.focus=1; return end
    if self:keyPressed("KEY_DOWN",false) then self.focus=5+self.quality; return end
    if self:confirmPressed() then
      if self.focus==2 then self:randomize()
      elseif self.focus==3 then self:submit()
      else self:close() end
      return
    end
    return
  end
  if self:keyPressed("KEY_BACKSPACE",true,false) then self.text=self.text:sub(1,-2) end
  if self:keyPressed("KEY_ENTER",false,false) or self:keyPressed("KEY_KP_ENTER",false,false) then
    if #self.text<2000 then self.text=self.text.."\n" end
  end
  if ctrl then return end
  for _,entry in ipairs(keyCharacters) do
    if self:keyPressed(entry[1],true,false) and #self.text<2000 then
      self.text=self.text..(shift and entry[3] or entry[2])
    end
  end
end
local letters={}
for character in ("abcdefghijklmnopqrstuvwxyz0123456789"):gmatch(".") do letters[#letters+1]=character end
letters[#letters+1],letters[#letters+2],letters[#letters+3]="SPACE","BACK","DONE"
function Prompt:editVirtualKeyboard()
  if self:keyPressed("KEY_LEFT",true) then self.letter=(self.letter-2)%#letters+1 end
  if self:keyPressed("KEY_RIGHT",true) then self.letter=self.letter%#letters+1 end
  if self:keyPressed("KEY_UP",true) then self.letter=(self.letter-11)%#letters+1 end
  if self:keyPressed("KEY_DOWN",true) then self.letter=(self.letter+9)%#letters+1 end
  if self:keyPressed("KEY_ENTER",false) then
    local letter=letters[self.letter]
    if letter=="DONE" then self.virtualKeyboard=false
    elseif letter=="BACK" then self.text=self.text:sub(1,-2)
    elseif #self.text<2000 then self.text=self.text..(letter=="SPACE" and " " or letter) end
  end
end
function Prompt:drawVirtualKeyboard(x,y,width)
  Isaac.RenderText(self.text:sub(-math.floor(width/6)),x,y,1,1,1,1)
  local keyWidth=math.floor(width/10)
  for index,letter in ipairs(letters) do
    local keyX,keyY=x+((index-1)%10)*keyWidth,y+17+math.floor((index-1)/10)*20
    self:button(letter,keyX,keyY,keyWidth-2,18,self.letter==index,true)
  end
end

function Prompt:layout()
  local screenW,screenH=Isaac.GetScreenWidth(),Isaac.GetScreenHeight()
  local w,h=math.min(500,screenW-24),math.min(260,screenH-18)
  return {x=math.floor((screenW-w)/2),y=math.floor((screenH-h)/2),w=w,h=h}
end

function Prompt:box(x,y,w,h,r,g,b,a)
  local destination=DestinationQuad.NewFromRectangle(Vector(x,y),w,h)
  self.pixel:Render(self.pixelQuad,destination,KColor(r,g,b,a or 1))
end

local function linesFor(text,maxChars)
  local lines={}
  for part in (text.."\n"):gmatch("(.-)\n") do
    if #part==0 then lines[#lines+1]=" "
    else
      for start=1,#part,maxChars do lines[#lines+1]=part:sub(start,start+maxChars-1) end
    end
  end
  return lines
end

function Prompt:button(label,x,y,w,h,hover,enabled)
  local r,g,b=0.13,0.24,0.32
  if hover and enabled then r,g,b=0.22,0.43,0.51 end
  if not enabled then r,g,b=0.1,0.13,0.16 end
  self:box(x,y,w,h,r,g,b,1)
  self:box(x,y,w,1,0.35,0.67,0.72,1)
  Isaac.RenderText(label,x+8,y+6,enabled and 0.95 or 0.45,enabled and 0.95 or 0.5,1,1)
end

function Prompt:setPage(page)
  self.page=page
  self.menuFocus,self.detailScroll=1,0
  self.virtualKeyboard=false
end

function Prompt:ensureCanvas()
  if self.pixel then return true end
  self.pixel=Renderer.LoadImage("gfx/nebius_creator/white.png")
  self.pixelQuad=SourceQuad.NewFromRectangle(Vector(0,0),1,1,false)
  return self.pixel~=nil and self.pixelQuad~=nil
end

function Prompt:openPauseLibrary()
  if self.open then return end
  self.pauseLibrary=true
  self:setPage("library")
  play("open")
end

function Prompt:closePauseLibrary()
  self.pauseLibrary=false
  self:setPage("creator")
  self.keyHeld={}
  play("close")
end

function Prompt:libraryItems()
  local items=self.getItems and self.getItems() or {}
  self.itemIndex=math.max(1,math.min(self.itemIndex,#items))
  return items
end

function Prompt:selectItem(delta)
  local items=self:libraryItems()
  self.itemIndex=math.max(1,math.min(#items,self.itemIndex+delta))
  self.detailScroll=0
end

function Prompt:menuButtons()
  local layout=self:layout()
  local items=self:libraryItems()
  local buttons={
    {label="PREV",enabled=self.itemIndex>1,action=function() self:selectItem(-1) end},
    {label="NEXT",enabled=self.itemIndex<#items,action=function() self:selectItem(1) end},
    {label="UP",enabled=self.detailScroll>0,action=function() self.detailScroll=math.max(0,self.detailScroll-3) end},
    {label="DOWN",enabled=self.detailScroll<(self.maxDetailScroll or 0),action=function() self.detailScroll=math.min(self.maxDetailScroll or 0,self.detailScroll+3) end},
    {label="BACK",action=function() self:closePauseLibrary() end},
  }
  local width=math.floor((layout.w-28-24)/5)
  for index,button in ipairs(buttons) do
    button.x,button.y,button.w,button.h=layout.x+14+(index-1)*(width+6),layout.y+layout.h-38,width,26
  end
  return buttons
end

function Prompt:editMenu()
  if self:keyPressed("KEY_ESCAPE",false) then
    self:closePauseLibrary()
    return
  end
  local buttons=self:menuButtons()
  -- Keep the library's keyboard controls independent of Isaac's pause-menu
  -- action bindings.  Arrow keys and WASD are equivalent; Space and Enter
  -- activate only the currently focused library button.
  if self:keyPressed("KEY_LEFT",true) or self:keyPressed("KEY_A",true,false) then self.menuFocus=(self.menuFocus-2)%#buttons+1 end
  if self:keyPressed("KEY_RIGHT",true) or self:keyPressed("KEY_D",true,false) then self.menuFocus=self.menuFocus%#buttons+1 end
  if self:keyPressed("KEY_UP",true) or self:keyPressed("KEY_W",true,false) then self.detailScroll=math.max(0,self.detailScroll-1) end
  if self:keyPressed("KEY_DOWN",true) or self:keyPressed("KEY_S",true,false) then self.detailScroll=math.min(self.maxDetailScroll or 0,self.detailScroll+1) end
  if self:keyPressed("KEY_SPACE",false,false) or self:confirmPressed() then
    local button=buttons[self.menuFocus]
    if button and button.enabled~=false then button.action() end
  end
end

function Prompt:descriptorLines(profile,maxChars)
  local parts={"DESCRIPTION: "..(profile.description or ""),"EFFECTS: "..(profile.summary or "No effect details available.")}
  if profile.powerSummary then parts[#parts+1]="RUN POWERS: "..profile.powerSummary end
  local groups={
    {"SYSTEMS",profile.systems},
    {"TEAR FLAGS",profile.tearFlagNames},
    {"FAMILIAR FLAGS",profile.familiar and profile.familiar.attack and profile.familiar.attack.flags},
    {"BOMB FLAGS",profile.bomb and profile.bomb.flags},
  }
  for _,group in ipairs(groups) do
    parts[#parts+1]=group[1]..": "..((group[2] and #group[2]>0) and table.concat(group[2],", ") or "none")
  end
  return linesFor(table.concat(parts,"\n\n"),maxChars)
end

function Prompt:drawMenu()
  local layout=self:layout()
  local x,y,w,h=layout.x,layout.y,layout.w,layout.h
  self:box(x-2,y-2,w+4,h+4,0.38,0.7,0.75,1)
  self:box(x,y,w,h,0.055,0.085,0.12,0.98)
  Isaac.RenderText("GENERATED ITEMS // THIS RUN",x+14,y+10,0.9,1,1,1)
  local items=self:libraryItems()
  local profile=items[self.itemIndex]
  if profile then
      local quality=profile.quality
      local valid=type(quality)=="number" and quality==math.floor(quality) and quality>=0 and quality<=4
      local colors={{0.7,0.7,0.7},{0.35,0.85,0.45},{0.35,0.65,1},{0.8,0.45,1},{1,0.85,0.25}}
      local color=valid and colors[quality+1] or colors[1]
      local qualityLabel=valid and ("Q"..quality.." / 4") or "QUALITY UNKNOWN"
      self:box(x+14,y+35,32,32,0.13,0.24,0.32,1)
      local rendered=self.renderItemArt and self.renderItemArt(profile,Vector(x+14,y+35),32)
      if not rendered then Isaac.RenderText("?",x+26,y+43,color[1],color[2],color[3],1) end
      Isaac.RenderText(tostring(profile.name):sub(1,math.floor((w-80)/6)),x+56,y+34,0.95,0.98,1,1)
      Isaac.RenderText(qualityLabel.."   |   "..self.itemIndex.." / "..#items,x+56,y+49,color[1],color[2],color[3],1)
      local lines=self:descriptorLines(profile,math.max(12,math.floor((w-38)/6)))
      local visible=math.max(1,math.floor((h-130)/12))
      self.maxDetailScroll=math.max(0,#lines-visible)
      self.detailScroll=math.max(0,math.min(self.detailScroll,self.maxDetailScroll))
      for index=1,visible do
        local line=lines[self.detailScroll+index]
        if line then Isaac.RenderText(line,x+18,y+77+(index-1)*12,0.86,0.91,0.96,1) end
      end
      Isaac.RenderText("Lines "..(self.detailScroll+1).."-"..math.min(#lines,self.detailScroll+visible).." / "..#lines.." | Up/Down scroll",x+14,y+h-57,0.5,0.83,0.88,1)
  else
    self.maxDetailScroll,self.detailScroll=0,0
    Isaac.RenderText("No generated items in this run yet.",x+18,y+80,0.86,0.91,0.96,1)
  end
  local mouse=Input.GetMousePosition(false)
  local pressed=Input.IsMouseBtnPressed(MouseButton.LEFT)
  local clicked=pressed and not self.mouseHeld
  self.mouseHeld=pressed
  for index,button in ipairs(self:menuButtons()) do
    local hovered=mouse and mouse.X>=button.x and mouse.X<button.x+button.w and mouse.Y>=button.y and mouse.Y<button.y+button.h
    if hovered then self.menuFocus=index end
    self:button(button.label,button.x,button.y,button.w,button.h,hovered or self.menuFocus==index,button.enabled~=false)
    if clicked and hovered and button.enabled~=false then button.action(); break end
  end
  if mouse and mouse.X>=x and mouse.X<x+w and mouse.Y>=y and mouse.Y<y+h then Isaac.RenderText("+",mouse.X-3,mouse.Y-6,0.85,0.95,1,1) end
end

function Prompt:pauseButtonBounds()
  local screenW,screenH=Isaac.GetScreenWidth(),Isaac.GetScreenHeight()
  return {x=math.max(12,screenW-190),y=screenH-42,w=178,h=26}
end

function Prompt:renderPauseScreen()
  if self.open or self.failed then return end
  if PauseMenu and PauseMenu.GetState and PauseMenu.GetState()~=1 then return end
  local ok,failure=pcall(function()
    if not self:ensureCanvas() then return end
    if self.pauseLibrary then
      self:editMenu()
      if self.pauseLibrary then self:drawMenu() end
      return
    end
    local button=self:pauseButtonBounds()
    local mouse=Input.GetMousePosition(false)
    local pressed=Input.IsMouseBtnPressed(MouseButton.LEFT)
    local clicked=pressed and not self.mouseHeld
    self.mouseHeld=pressed
    local hovered=mouse and mouse.X>=button.x and mouse.X<button.x+button.w and mouse.Y>=button.y and mouse.Y<button.y+button.h
    self:button("VIEW AI ITEMS [TAB]",button.x,button.y,button.w,button.h,hovered,true)
    if (clicked and hovered) or self:keyPressed("KEY_TAB",false) then self:openPauseLibrary() end
  end)
  if not ok then self:logError("pause_ui",failure) end
end

function Prompt:draw()
  if self.page~="creator" then self:drawMenu(); return end
  local layout=self:layout()
  local x,y,w,h=layout.x,layout.y,layout.w,layout.h
  self:box(x-2,y-2,w+4,h+4,0.38,0.7,0.75,1)
  self:box(x,y,w,h,0.045,0.075,0.12,0.98)
  self:box(x,y,w,28,0.09,0.2,0.27,1)
  Isaac.RenderText("NEBIUS // ITEM CREATOR",x+14,y+9,0.9,1,1,1)
  if self.activesEnabled then Isaac.RenderText(self.itemType:upper().." [TAB/MAP]",x+w-130,y+9,0.65,0.95,1,1) end
  local context=self.getContext and self.getContext() or {}
  local heading="Items "..tostring(context.count or 0).."/128 | Art "..tostring(context.art_count or "?").."/128 | AI "..tostring(context.blanks or 0).." | Ctrl+C/V"
  Isaac.RenderText(heading,x+14,y+37,0.75,0.85,0.92,1)
  local inputY,inputH=y+54,h-132
  local qualityX,qualityW=x+w-86,73
  local inputW=qualityX-(x+13)-10
  local inputFocused=self.focus==1
  self:box(x+13,inputY,inputW,inputH,inputFocused and 0.14 or 0.1,inputFocused and 0.26 or 0.16,inputFocused and 0.34 or 0.22,1)
  self:box(x+13,inputY,inputW,inputFocused and 2 or 1,inputFocused and 0.48 or 0.35,inputFocused and 0.82 or 0.56,inputFocused and 0.9 or 0.62,1)
  local maxChars=math.max(12,math.floor((inputW-20)/6))
  local lines=linesFor(self.text~="" and self.text or (self.details or "Describe your item."),maxChars)
  local visible=math.max(1,math.floor((inputH-14)/12))
  local first=math.max(1,#lines-visible+1)
  local hidePrompt=CONTROLLER_KEYBOARD and self.virtualKeyboard
  for index=first,(hidePrompt and 0 or #lines) do
    local line=lines[index]
    if index==#lines and math.floor(Isaac.GetTime()/500)%2==0 then line=line.."_" end
    Isaac.RenderText(line,x+22,inputY+8+(index-first)*12,0.96,0.98,1,1)
  end
  if hidePrompt then self:drawVirtualKeyboard(x+20,inputY+7,inputW-14) end
  Isaac.RenderText("QUALITY",qualityX,y+38,0.5,0.83,0.88,1)
  self:box(qualityX,inputY,qualityW,1,0.35,0.67,0.72,1)
  local qualityButtons={}
  for quality=0,4 do
    local qualityY=inputY+7+quality*21
    qualityButtons[#qualityButtons+1]={quality=quality,x=qualityX,y=qualityY,w=qualityW,h=18}
  end
  local buttonY=y+h-64
  local gap=8
  local buttonW=math.floor((w-26-2*gap)/3)
  local buttons={
    {label="RANDOMIZE",x=x+13,enabled=not self.pending,action=function() self:randomize() end},
    {label="GENERATE",x=x+13+buttonW+gap,enabled=not self.pending,action=function() self:submit() end},
    {label="CLOSE",x=x+13+2*(buttonW+gap),enabled=true,action=function() self:close() end},
  }
  local mouse=Input.GetMousePosition(false)
  local pressed=Input.IsMouseBtnPressed(MouseButton.LEFT)
  local clicked=pressed and not self.mouseHeld
  self.mouseHeld=pressed
  local inputHovered=mouse and mouse.X>=x+13 and mouse.X<x+13+inputW and mouse.Y>=inputY and mouse.Y<inputY+inputH
  if clicked and inputHovered then self.focus=1 end
  for _,button in ipairs(qualityButtons) do
    local hovered=mouse and mouse.X>=button.x and mouse.X<button.x+button.w and mouse.Y>=button.y and mouse.Y<button.y+button.h
    if hovered then self.focus=5+button.quality end
    local selected=self.quality==button.quality
    self:box(button.x,button.y,button.w,button.h,selected and 0.22 or 0.1,selected and 0.43 or 0.16,selected and 0.51 or 0.22,1)
    self:box(button.x,button.y,button.w,(hovered or self.focus==5+button.quality) and 2 or 1,0.35,0.67,0.72,1)
    Isaac.RenderText(tostring(button.quality),button.x+31,button.y+3,0.95,0.95,1,1)
    if clicked and hovered then self.quality=button.quality; break end
  end
  for _,button in ipairs(buttons) do
    local hoveredByMouse=mouse and mouse.X>=button.x and mouse.X<button.x+buttonW and
      mouse.Y>=buttonY and mouse.Y<buttonY+27
    if hoveredByMouse then self.focus=({RANDOMIZE=2,GENERATE=3,CLOSE=4})[button.label] end
    local hover=hoveredByMouse or self.focus==({RANDOMIZE=2,GENERATE=3,CLOSE=4})[button.label]
    self:button(button.label,button.x,buttonY,buttonW,27,hover,button.enabled)
    if clicked and hoveredByMouse and button.enabled then button.action(); break end
  end
  local phase=labels[self.phase] or "READY"
  Isaac.RenderText(phase,x+14,y+h-27,0.5,0.83,0.88,1)
  Isaac.RenderText(tostring(self.status):sub(1,maxChars-16),x+102,y+h-27,0.88,0.9,0.95,1)
  if mouse and mouse.X>=x and mouse.X<x+w and mouse.Y>=y and mouse.Y<y+h then
    Isaac.RenderText("+",mouse.X-3,mouse.Y-6,0.85,0.95,1,1)
  end
end

function Prompt:render()
  self:updateInput()
  if self.pending and Isaac.GetTime()-self.started>370000 then
    local suppress=self.suppressOpen
    self:fail("timeout","Request timed out. Check the bridge, then retry.")
    if not suppress then self.requested=true end
    self.suppressOpen=false
  end
  self:renderIndicator()
  if self.failed then return end
  if self.requested then
    self.requested=false
    if not self.suppressOpen and not self.open then
      self.open=true
      self.focus=1
      self.openedAt=Isaac.GetTime()
      self:setHudHidden(true)
      Isaac.DebugString("[NebiusPrompt] WINDOW_VISIBLE")
      play("open")
    end
  end
  if not self.open then return end
  local ok,failure=pcall(function()
    if not self.pixel then
      self.pixel=Renderer.LoadImage("gfx/nebius_creator/white.png")
      self.pixelQuad=SourceQuad.NewFromRectangle(Vector(0,0),1,1,false)
    end
    self:editInput()
    if self.open then self:draw() end
  end)
  if not ok then
    self.failed,self.open=true,false
    self:setHudHidden(false)
    self:logError("ui",failure)
    Isaac.DebugString("[NebiusPrompt] UI_ERROR "..tostring(failure))
  end
end

return Prompt

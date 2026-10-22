import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';

const source = await readFile(new URL('../demo/live-sprite-swap/nebius_prompt.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();

async function run(script) {
  const engine = await factory.createEngine();
  try {
    await engine.doString(`
      logs, mouse, mouseDown, keyDown, clipboardText = {}, {X=-1,Y=-1}, false, {}, nil
      Isaac = { DebugString=function(value) logs[#logs+1]=value end, GetTime=function() return 200 end,
        GetScreenWidth=function() return 640 end, GetScreenHeight=function() return 360 end, RenderText=function() end,
        GetClipboard=function() return clipboardText end, SetClipboard=function(value) clipboardText=value; return true end }
      Keyboard = { KEY_SPACE=32, KEY_C=67, KEY_V=86, KEY_ENTER=257, KEY_ESCAPE=256, KEY_TAB=258,
        KEY_LEFT_CONTROL=341, KEY_A=65, KEY_BACKSPACE=259 }
      function Random() return 123 end
      function Game() return {GetHUD=function() return {SetVisible=function() end} end} end
      Input = {GetMousePosition=function() return mouse end, IsMouseBtnPressed=function() return mouseDown end,
        IsButtonPressed=function(key) return keyDown[key]==true end}
      MouseButton = {LEFT=0}
    `);
    await engine.doString(`Prompt = (function() ${source}\nend)(); ui = Prompt.new({encode=function() return '{}' end})`);
    await engine.doString(script);
  } finally {
    engine.global.close();
  }
}

test('Randomize remains available at capacity without reserving an item', async () => {
  await run(`
    ui.getContext=function() return {run='run',blocked='Art capacity reached.'} end
    ui.prepareRequest=function() error('Sentence request must not reserve an item') end
    ui:randomize()
    assert(ui.pendingKind=='sentence' and ui.phase=='randomizing')
    ui:receive(ui.pending,'sentence','A hollow bell keeps a secret.')
    assert(ui.text=='A hollow bell keeps a secret.' and ui.pending==nil)
    ui:submit()
    assert(ui.pending==nil and ui.status=='Art capacity reached.')
  `);
});

test('creator translates generator stage identifiers into readable progress', async () => {
  await run(`
    ui.pending='request'
    ui:receive('request','generating','Generating passive item: familiar_anim')
    assert(ui.status=='Preparing familiar animation...')
    ui:receive('other','generating','Generating passive item: text')
    assert(ui.status=='Preparing familiar animation...')
    ui:receive('request','generating','Waiting for acknowledgement')
    assert(ui.status=='Waiting for acknowledgement')
  `);
});

test('quality selector includes quality 0 and keeps 1 through 4', async () => {
  await run(`
    ui.box=function() end
    ui.button=function() end
    local layout=ui:layout()
    local qualityX=layout.x+layout.w-86
    local inputY=layout.y+54
    mouse={X=qualityX+10,Y=inputY+12}
    mouseDown=true; ui:draw(); assert(ui.quality==0 and ui.focus==5)
    mouseDown=false; ui:draw()
    mouse={X=qualityX+10,Y=inputY+7+21+8}
    mouseDown=true; ui:draw(); assert(ui.quality==1 and ui.focus==6)
    mouseDown=false; ui:draw()
    mouse={X=qualityX+10,Y=inputY+7+4*21+8}
    mouseDown=true; ui:draw(); assert(ui.quality==4 and ui.focus==9)
  `);
});

test('Tab does not switch the creator to an active while generation is vaulted', async () => {
  await run(`
    Keyboard.KEY_TAB=258
    ui.activesEnabled=false
    keyDown[Keyboard.KEY_TAB]=true
    ui:editInput()
    assert(ui.itemType=='passive')
    ui.activesEnabled=true
    ui.keyHeld={}
    ui:editInput()
    assert(ui.itemType=='active')
  `);
});

test('space inserts a space even when Isaac treats it as menu confirm', async () => {
  await run(`
    ButtonAction={ACTION_MENUCONFIRM=7}
    Input.IsActionPressed=function() return true end
    ui.focus=1
    keyDown[Keyboard.KEY_SPACE]=true
    ui:editInput()
    assert(ui.text==' ' and ui.virtualKeyboard~=true)
  `);
});

test('Ctrl+V pastes clipboard text and Ctrl+C copies the prompt', async () => {
  await run(`
    clipboardText='a cursed nail that poisons enemies'
    keyDown[Keyboard.KEY_LEFT_CONTROL]=true
    keyDown[Keyboard.KEY_V]=true
    ui:editInput()
    assert(ui.text=='a cursed nail that poisons enemies')
    keyDown[Keyboard.KEY_V]=false
    ui.keyHeld={}
    ui.text='edit the pasted idea'
    keyDown[Keyboard.KEY_C]=true
    ui:editInput()
    assert(clipboardText=='edit the pasted idea')
  `);
});

test('paste clamps to 2000 characters and does not type v while Ctrl is held', async () => {
  await run(`
    clipboardText=string.rep('x', 2100)
    keyDown[Keyboard.KEY_LEFT_CONTROL]=true
    keyDown[Keyboard.KEY_V]=true
    ui:editInput()
    assert(#ui.text==2000)
    assert(not ui.text:find('v',1,true))
  `);
});

test('mouse clicks outside a focused button cannot activate it', async () => {
  await run(`
    ui.box=function() end
    ui.button=function() end
    local calls=0
    ui.submit=function() calls=calls+1 end
    ui.focus=3
    mouseDown=true
    ui:draw()
    assert(calls==0)
    mouseDown=false;ui:draw()
    local layout=ui:layout()
    local width=math.floor((layout.w-26-16)/3)
    mouse={X=layout.x+13+width+8+10,Y=layout.y+layout.h-64+10}
    mouseDown=true;ui:draw()
    assert(calls==1)
  `);
});

import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';

const source = await readFile(new URL('../demo/live-sprite-swap/nebius_prompt.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();

async function run(script) {
  const engine = await factory.createEngine();
  try {
    await engine.doString(`
      logs, mouse, mouseDown = {}, {X=-1,Y=-1}, false
      Isaac = { DebugString=function(value) logs[#logs+1]=value end, GetTime=function() return 200 end,
        GetScreenWidth=function() return 640 end, GetScreenHeight=function() return 360 end, RenderText=function() end }
      function Random() return 123 end
      function Game() return {GetHUD=function() return {SetVisible=function() end} end} end
      Input = {GetMousePosition=function() return mouse end, IsMouseBtnPressed=function() return mouseDown end}
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

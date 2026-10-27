import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';

const source = await readFile(new URL('../../demo/live-sprite-swap/pickup_probe.lua', import.meta.url), 'utf8');

async function run(body) {
  const engine = await new LuaFactory().createEngine();
  try {
    await engine.doString(`probe=(function()\n${source}\nend)()
      function player(seed)
        local result={InitSeed=seed,coins=0}
        function result:ToPlayer() return self end
        function result:GetNumCoins() return self.coins end
        function result:GetActiveItem(slot) return 100+slot end
        function result:GetActiveCharge(slot) return slot end
        return result
      end
      function pickup(seed)
        local result={InitSeed=seed,Variant=20,SubType=1,Touched=false}
        function result:Exists() return true end
        function result:IsDead() return false end
        return result
      end
    `);
    return await engine.doString(body);
  } finally { engine.global.close(); }
}

test('pickup probe construction is inert and observes only exact collider pairs', async () => {
  assert.equal(await run(`
    local observer=probe.new()
    local first,second=player(1),player(2)
    local item=pickup(3)
    assert(observer:drain().pendingCount==0)
    assert(not observer:before(item,{},1))
    assert(observer:before(item,first,1))
    assert(observer:before(item,second,1))
    first.coins=1
    assert(observer:after(item,first,1))
    assert(not observer:after(item,first,1))
    assert(not observer:after(pickup(3),second,1))
    observer:tick(2)
    local report=observer:drain()
    assert(#report.records==2 and report.pendingCount==0)
    local seen={}
    for _,record in ipairs(report.records) do
      seen[record.before.player.InitSeed]=record
      assert(record.label=="diagnostic_not_confirmed_acquisition" and record.collected==nil)
    end
    assert(seen[1].before.player.GetNumCoins==0 and seen[1].after.player.GetNumCoins==1)
    assert(seen[1].postCollisionObserved and not seen[2].postCollisionObserved)
    assert(seen[2].settled.player.GetNumCoins==0)
    assert(first.coins==1 and second.coins==0 and not item.Touched)
    return true
  `), true);
});

test('missing, removed, and throwing getters remain unknown without fabricated acquisition', async () => {
  assert.equal(await run(`
    local observer=probe.new()
    local owner,item=player(1),pickup(2)
    function owner:GetNumKeys() error("unavailable") end
    function owner:GetNumBombs() return 0/0 end
    function item:GetSprite() return {GetAnimation=function() return "Collect" end,GetFrame=function() return 3 end} end
    assert(observer:before(item,owner,4))
    assert(not observer:after(item,owner,5))
    function item:Exists() return false end
    function item:IsDead() error("removed") end
    setmetatable(item,{__index=function() error("removed property") end})
    observer:tick(5)
    local record=observer:drain().records[1]
    assert(record.before.pickup.animation=="Collect")
    assert(record.settled.pickup.Exists==false and record.settled.pickup.IsDead==nil)
    assert(record.settled.player.GetNumKeys==nil and record.settled.player.GetNumBombs==nil)
    assert(record.before.player.activeSlots[4].item==103 and record.before.player.activeSlots[4].charge==3)
    assert(record.collected==nil and not record.postCollisionObserved)
    return true
  `), true);
});

test('probe bounds references and logs, drains diagnostics, and clears transition state', async () => {
  assert.equal(await run(`
    local observer=probe.new()
    local owner,item=player(1),pickup(2)
    assert(not observer:before(item,owner,-1) and not observer:before(item,owner,0.5))
    assert(not observer:tick("1"))
    for frame=1,3 do
      for attempt=1,65 do observer:before(item,owner,frame) end
      observer:tick(frame)
      assert(observer:drain().pendingCount==64)
      observer:tick(frame+1)
    end
    local report=observer:drain()
    assert(#report.records==64 and report.pendingCount==0)
    for frame=4,6 do
      for attempt=1,64 do assert(observer:before(item,owner,frame)) end
      observer:tick(frame+1)
    end
    report=observer:drain()
    assert(#report.records==128 and report.droppedRecords==64)
    assert(#observer:drain().records==0)
    for attempt=1,65 do observer:before(item,owner,10) end
    report=observer:drain()
    assert(report.droppedPending==1 and report.pendingCount==64)
    observer:clear()
    observer:tick(11)
    report=observer:drain()
    assert(report.pendingCount==0 and #report.records==0 and report.droppedPending==0)
    return true
  `), true);
});

test('production runtime loads inert factories at startup but constructs capture only after opt-in guards', async () => {
  const main = await readFile(new URL('../../demo/live-sprite-swap/main.lua', import.meta.url), 'utf8');
  const commandStart = main.indexOf('function Demo:onExecuteCmd');
  assert.ok(commandStart > 0);
  assert.match(main.slice(0, commandStart), /local pickupProbeModule = include\(["']pickup_probe["']\)/);
  assert.doesNotMatch(main.slice(0, commandStart), /pickupProbeModule\.new\(/);
  const command = main.slice(commandStart);
  assert.doesNotMatch(command, /include\(["']pickup_(?:probe|capture)["']\)/);
  assert.ok(command.indexOf('parameters=="probe pickups on"') < command.indexOf('pickupProbeModule.new()'));
  assert.ok(command.indexOf('if not context then') < command.indexOf('pickupProbeModule.new()'));
  assert.ok(command.indexOf('if not available then') < command.indexOf('pickupProbeModule.new()'));
  assert.equal([...main.matchAll(/include\(["']pickup_probe["']\)/g)].length, 1);
  assert.doesNotMatch(source, /AddCallback|SaveData|Spawn|Random|AddCoins|AddHearts/);
});

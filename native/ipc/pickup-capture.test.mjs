import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';

const probeSource = await readFile(new URL('../../demo/live-sprite-swap/pickup_probe.lua', import.meta.url), 'utf8');
const captureSource = await readFile(new URL('../../demo/live-sprite-swap/pickup_capture.lua', import.meta.url), 'utf8');

async function run(body) {
  const engine = await new LuaFactory().createEngine();
  try {
    engine.global.set('probeSource', probeSource);
    engine.global.set('captureSource', captureSource);
    await engine.doString(`
      local probe=assert(load(probeSource))()
      local capture=assert(load(captureSource))()
      observer=probe.new();packets={}
      adapter=capture.new(observer,function(packet) packets[#packets+1]=packet end)
      function context(frame,slot) return {session='process',run='run',room='1:0',frame=frame or 0,save_slot=slot or 2} end
      function player(seed)
        local owner={InitSeed=seed,coins=0}
        function owner:ToPlayer() return self end
        function owner:GetNumCoins() return self.coins end
        return owner
      end
      function pickup(seed)
        return {InitSeed=seed,Variant=20,SubType=1,Exists=function() return true end}
      end
    `);
    await engine.doString(body);
  } finally { engine.global.close(); }
}

test('capture is inert and rejects protected/unknown saves and unsupported callbacks', async () => {
  assert.doesNotMatch(captureSource, /RegisterMod|AddCallback|SaveData|math\.random|Isaac\.Spawn/);
  await run(`
    local unreadable=setmetatable({},{__index=function() error('inactive capture read an entity') end})
    assert(not adapter:status().enabled)
    assert(adapter:before(unreadable,unreadable,nil)==nil)
    assert(adapter:after(unreadable,unreadable,nil)==nil)
    adapter:tick(nil);assert(#packets==0)
    for _,slot in ipairs({1,0,4}) do assert(not adapter:start(context(0,slot),true)) end
    assert(not adapter:start(nil,true))
    assert(not adapter:start(context(),false))
    assert(not adapter:start(context(),1))
    local invalid=context();invalid.frame=0/0;assert(not adapter:start(invalid,true))
    assert(#packets==0 and observer:drain().pendingCount==0)
  `);
});

test('capture logs raw exact-collider snapshots without claiming collection or overriding collision', async () => {
  await run(`
    assert(adapter:start(context(),true))
    local item,first,second=pickup(1),player(2),player(3)
    assert(adapter:before(item,first,context())==nil)
    adapter:before(item,second,context())
    first.coins=1
    assert(adapter:after(item,first,context())==nil)
    adapter:tick(context());assert(#packets==1)
    adapter:tick(context(1));assert(#packets==3)
    local seen={}
    for index=2,3 do
      local packet=packets[index];assert(packet.kind=='record' and packet.context.save_slot==2)
      assert(packet.label=='diagnostic_not_confirmed_acquisition' and packet.collected==nil)
      assert(packet.record.label==packet.label and packet.record.collected==nil)
      seen[packet.record.before.player.InitSeed]=packet.record
    end
    assert(seen[2].postCollisionObserved and seen[2].after.player.GetNumCoins==1)
    assert(not seen[3].postCollisionObserved and seen[3].settled.player.GetNumCoins==0)
    assert(first.coins==1 and second.coins==0 and item.Touched==nil)
    adapter:stop('operator');assert(packets[4].kind=='stop' and packets[4].recorded==2)
    adapter:tick(context(2));assert(#packets==4)
  `);
});

test('capture stops and discards pending references on every context boundary', async () => {
  for (const change of [
    "nextContext.session='other'", "nextContext.run='other'", "nextContext.room='1:1'",
    'nextContext.save_slot=1', 'nextContext.frame=0', 'nextContext=nil',
  ]) {
    await run(`
      assert(adapter:start(context(2),true))
      adapter:before(pickup(1),player(2),context(2))
      local nextContext=context(3);${change}
      adapter:tick(nextContext)
      assert(not adapter:status().enabled and observer:drain().pendingCount==0)
      assert(#packets==2 and packets[2].kind=='stop' and packets[2].reason=='context_changed')
      assert(packets[2].pendingCount==1 and packets[2].context.save_slot==2)
    `);
  }
});

test('capture has a session-wide 128-record cap and cannot silently lose overflow counts', async () => {
  await run(`
    assert(adapter:start(context(),true))
    local owner=player(1)
    for index=1,70 do adapter:before(pickup(index),owner,context()) end
    adapter:tick(context());assert(#packets==1)
    adapter:tick(context(1));assert(adapter:status().recorded==64)
    for index=2,65 do assert(packets[index].droppedPending==6) end
    for index=1,50 do adapter:before(pickup(index),owner,context(1)) end
    adapter:tick(context(2))
    assert(adapter:status().enabled and adapter:status().recorded==114)
    for index=1,64 do adapter:before(pickup(index),owner,context(2)) end
    adapter:tick(context(3))
    assert(not adapter:status().enabled and adapter:status().recorded==128)
    assert(#packets==130 and packets[130].reason=='record_limit' and packets[130].droppedPending==6)
    assert(packets[130].discardedRecords==50)
    local unreadable=setmetatable({},{__index=function() error('capture did not stop') end})
    adapter:before(unreadable,unreadable,context(3));assert(#packets==130)
    assert(observer:drain().pendingCount==0)
  `);
});

test('capture logger failures disable diagnostics without escaping into the game callback', async () => {
  await run(`
    local capture=assert(load(captureSource))()
    local failing=capture.new(observer,function() error('log unavailable') end)
    local enabled,message=failing:start(context(),true)
    assert(not enabled and message=='Pickup capture logging failed.' and not failing:status().enabled)
    local calls=0
    local later=capture.new(observer,function() calls=calls+1;if calls>1 then error('log failed') end end)
    assert(later:start(context(),true));later:before(pickup(1),player(2),context())
    later:tick(context(1))
    assert(not later:status().enabled and observer:drain().pendingCount==0)
  `);
});

test('operator restarts create separate capture identities and never settle old pending collisions', async () => {
  await run(`
    assert(adapter:start(context(),true))
    adapter:before(pickup(1),player(2),context())
    assert(adapter:start(context(1,3),true))
    adapter:tick(context(2,3))
    assert(#packets==3 and packets[2].reason=='restarted')
    assert(packets[1].capture==1 and packets[3].capture==2 and packets[3].context.save_slot==3)
    assert(adapter:status().recorded==0 and observer:drain().pendingCount==0)
  `);
});

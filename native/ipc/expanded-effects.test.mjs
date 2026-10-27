import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';
import { expandedEffects, validateExpandedAction, expandedActionWeight, summarizeExpandedAction } from '../../bridge/expanded-effects.mjs';

const source = await readFile(new URL('../../demo/live-sprite-swap/expanded_effects.lua', import.meta.url), 'utf8');
const factory = new LuaFactory();
function lua(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'number') return Number.isNaN(value) ? '(0/0)' : value === Infinity ? 'math.huge' : value === -Infinity ? '-math.huge' : String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '{' + value.map(lua).join(',') + '}';
  return '{' + Object.entries(value).map(([key, entry]) => '[' + lua(key) + ']=' + lua(entry)).join(',') + '}';
}

const mocks = `
frame, guardDepth, spawnCalls, spawnFails, charmFails, reentered = 0,0,0,false,false,false
entities, shots, ownership = {}, {}, {}
function vector(horizontal,vertical) return {X=horizontal,Y=vertical} end
function entity(seed)
  return {InitSeed=seed, Position=vector(0,0), Velocity=vector(0,0), data={}, exists=true,
    Exists=function(self) return self.exists end, IsDead=function(self) return self.dead or false end,
    GetData=function(self) return self.data end, ToTear=function(self) return self end,
    Remove=function(self) self.exists=false; if runtime then runtime:removeEntity(self) end end,
    AddCharmed=function(self,owner,duration) if charmFails then error("charm failed") end; self.charmed=duration; self.charmOwner=owner end,
    IsBoss=function(self) return self.boss or false end}
end
function ordinaryProjectile(seed)
  local shot=entity(seed)
  shot.Type,shot.Variant,shot.SubType,shot.ProjectileFlags=9,0,0,0
  shot.hostile=true; shot.Velocity=vector(3,4)
  return shot
end
function player(seed)
  local result=entity(seed)
  result.coins,result.charge,result.item=20,0,1
  result.GetNumCoins=function(self) return self.coins end
  result.AddCoins=function(self,amount) self.coins=self.coins+amount end
  result.GetActiveCharge=function(self,slot) assert(slot==0); return self.charge end
  result.SetActiveCharge=function(self,amount,slot) assert(slot==0); if self.chargeFails then return end; self.charge=amount end
  result.GetActiveItem=function(self,slot) assert(slot==0); return self.item end
  return result
end
owner,other=player(11),player(22)
ownership[owner],ownership[other]=true,true
limit=6
local deps={
  frame=function() return frame end,
  owns=function(source,who) return ownership[who]==true and source~="lost" end,
  vector=vector, entityRef=function(who) return who end,
  isEnemy=function(target) return target.enemy==true and not target.friendly end,
  isHostileProjectile=function(target) return target.hostile==true end,
  projectiles=function() return shots end,
  chargeLimit=function() return limit end,
  withGuard=function(callback)
    guardDepth=guardDepth+1
    local ok,result=pcall(callback)
    guardDepth=guardDepth-1
    if not ok then error(result) end
    return result
  end,
  enums={tear=2,blueTear=0,pooter=14,primarySlot=0},
  spawn=function(kind,variant,subtype,position,velocity,spawner)
    assert(guardDepth>0)
    spawnCalls=spawnCalls+1
    assert(runtime:suppressed(nil))
    local nested=runtime:run("nested",spawner,catalog.actions.extra_tears.example,"nested",{owner=spawner,trigger="tear_fire",velocity=vector(1,0)})
    assert(not nested)
    reentered=true
    if spawnFails then return nil end
    local child=entity(100+spawnCalls)
    child.Type,child.Variant,child.SubType=kind,variant,subtype
    child.Position,child.Velocity,child.SpawnerEntity=position,velocity,spawner
    entities[#entities+1]=child
    return child
  end,
}
runtime=Expanded.new(deps,catalog)
function action(name) local copy={} for key,value in pairs(catalog.actions[name].example) do copy[key]=value end return copy end
function event(trigger,who) return {owner=who or owner,trigger=trigger,velocity=vector(1,0)} end
function run(name,key,who,context)
  return runtime:run("source",who or owner,action(name),key or name,context or event(catalog.actions[name].triggers[1],who))
end
`;

async function withLua(body) {
  const engine = await factory.createEngine();
  try {
    await engine.doString('Expanded=(function()\n' + source + '\nend)()\ncatalog=' + lua(expandedEffects) + '\n' + mocks);
    return await engine.doString(body);
  } finally { engine.global.close(); }
}

test('all parameter boundaries and trigger compatibility match Node in real Lua', async () => {
  const cases = [];
  for (const spec of Object.values(expandedEffects.actions)) {
    for (const trigger of [...spec.triggers, 'player_death', 'pickup', 'on_kill', 'wrong']) cases.push([spec.example, trigger]);
    for (const [name, parameter] of Object.entries(spec.params)) {
      const values = parameter.enum ? [...parameter.enum, 'wrong', 1, null] : [parameter.min, parameter.max, parameter.min - .01, parameter.max + .01, NaN, Infinity, -Infinity, '1', null, true, ...(parameter.integer ? [parameter.min + .5] : [])];
      for (const value of values) cases.push([{ ...spec.example, [name]: value }, spec.triggers[0]]);
      const missing = { ...spec.example }; delete missing[name]; cases.push([missing, spec.triggers[0]]);
    }
    for (const name of ['amount', 'code', 'unsafe']) cases.push([{ ...spec.example, [name]: 1 }, spec.triggers[0]]);
  }
  for (const action of [null, {}, {type:'spawn_creep'}, {type:'constructor'}]) cases.push([action, 'active_use']);
  await withLua(cases.map(([action, trigger], index) => 'assert(Expanded.validate(' + lua(action) + ',' + lua(trigger) + ',catalog)==' + (validateExpandedAction(action, trigger).length === 0) + ',"case ' + index + '")').join('\n'));
});
const executionMocks = `
runtime.deps.enums.friendly,runtime.deps.enums.charm=1,2
runtime.deps.entityRef=function(who) return {Entity=who} end
function executionEnemy(seed)
  local target=entity(seed or 30)
  target.enemy=true;target.HitPoints=15;target.MaxHitPoints=100
  target.ToNPC=function(self) return self end
  target.IsEnemy=function() return true end
  target.IsActiveEnemy=function(_,includeDead) assert(includeDead==false);return true end
  target.IsVulnerableEnemy=function() return true end
  target.HasMortalDamage=function() return false end
  target.HasEntityFlags=function() return false end
  target.KillWithSource=function(self,source)
    assert(guardDepth==1 and runtime.depth==1 and source.Entity==owner)
    self.calls=(self.calls or 0)+1;self.dead=true;self.source=source
    assert(not runtime:run("source",owner,action("execute_enemy"),"nested",{owner=owner,trigger="enemy_hit",target=executionEnemy(99)}))
  end
  return target
end
target=executionEnemy()
context={owner=owner,trigger="enemy_hit",target=target,amount=1000}
function execute(key) return run("execute_enemy",key or "execution",owner,context) end
`;

test('execution preflight is pure and uses inclusive observed HP without predicting buffered hits', async () => {
  await withLua(executionMocks + `
    math.random=function() error("preflight RNG") end
    for _,trigger in ipairs({"enemy_hit","tear_impact","collision"}) do
      context.trigger=trigger
      assert(runtime.canRun("source",owner,action("execute_enemy"),"execution",context))
      assert(target.calls==nil and not target.dead and next(runtime.cooldowns)==nil and #runtime.actors==0)
    end
    target.HitPoints=15.00001
    assert(not execute())
    target.HitPoints=15
    target.HasMortalDamage=function() return true end
    assert(not execute())
    target.HasMortalDamage=function() return false end
    assert(execute() and target.source.Entity==owner and target.calls==1)
    assert(runtime:snapshot()[1].remaining==120 and runtime.depth==0 and guardDepth==0)
    assert(not execute() and target.calls==1)
  `);
});

test('execution rejects missing, throwing and nonboolean getters, invalid HP, linked and secondary targets', async () => {
  await withLua(executionMocks + `
    for _,name in ipairs({"Exists","IsDead","IsEnemy","IsActiveEnemy","IsVulnerableEnemy","IsBoss","HasMortalDamage","ToNPC","GetData","HasEntityFlags","KillWithSource"}) do
      for _,kind in ipairs({"missing","throwing","invalid"}) do
        context.target=executionEnemy()
        if kind=="missing" then context.target[name]=nil
        elseif kind=="throwing" then context.target[name]=function() error("getter") end
        else context.target[name]=function() return nil end end
        assert(not execute(),name..":"..kind)
        assert(next(runtime.cooldowns)==nil and runtime.depth==0 and guardDepth==0)
      end
    end
    for _,field in ipairs({"HitPoints","MaxHitPoints"}) do
      for _,value in ipairs({0,-1,0/0,math.huge,-math.huge,"15",true}) do
        context.target=executionEnemy();context.target[field]=value;assert(not execute(),field)
      end
      context.target=executionEnemy();context.target[field]=nil;assert(not execute())
    end
    for _,alter in ipairs({
      function(t) t.boss=true end,
      function(t) t.friendly=true end,
      function(t) t.enemy=false end,
      function(t) t.dead=true end,
      function(t) t.exists=false end,
      function(t) t.Parent=entity(90) end,
      function(t) t.Child=entity(90) end,
      function(t) t.MaxHitPoints=1 end,
      function(t) t.data.expandedSecondary={} end,
      function(t) t.IsVulnerableEnemy=function() return false end end,
      function(t) t.IsActiveEnemy=function() return false end end,
      function(t) t.HasEntityFlags=function() return true end end
    }) do context.target=executionEnemy();alter(context.target);assert(not execute()) end
    context.target=executionEnemy();runtime.deps.enums.charm=nil;assert(not execute())
    assert(next(runtime.cooldowns)==nil and #runtime.actors==0)
  `);
});

test('execution requires credited observed death, revalidates after preflight, and preserves failed cooldowns', async () => {
  await withLua(executionMocks + `
    for _,kill in ipairs({
      function() end,
      function(self) self.exists=false end,
      function() error("kill failed") end,
      function(self) self.IsDead=function() error("observation failed") end end,
      function(self) self.IsDead=function() return 1 end end
    }) do
      context.target=executionEnemy();context.target.KillWithSource=kill
      assert(not execute() and next(runtime.cooldowns)==nil and guardDepth==0 and runtime.depth==0)
    end
    context.target=executionEnemy()
    local target=context.target
    target.Kill=function() error("uncredited fallback") end
    for _,getter in ipairs({
      function() return nil end,
      function() return {} end,
      function() return {Entity=other} end,
      function() error("EntityRef unavailable") end,
      function() return 1 end
    }) do
      runtime.deps.entityRef=getter
      assert(not runtime.canRun("source",owner,action("execute_enemy"),"execution",context))
      assert(not execute() and target.calls==nil and next(runtime.cooldowns)==nil)
    end
    runtime.deps.entityRef=function(who) target.HitPoints=16;return {Entity=who} end
    assert(not execute() and target.calls==nil)
    runtime.deps.entityRef=function(who) return {Entity=who} end
    target.HitPoints=15
    local originalGuard=runtime.deps.withGuard
    runtime.deps.withGuard=function(callback) target.HitPoints=16;return originalGuard(callback) end
    assert(runtime.canRun("source",owner,action("execute_enemy"),"execution",context))
    assert(not execute() and target.calls==nil and next(runtime.cooldowns)==nil)
    runtime.deps.withGuard=originalGuard;target.HitPoints=15
    assert(execute())
    context.target=executionEnemy(31);assert(not execute())
    frame=120;assert(execute())
    runtime:clearActors();assert(not execute())
    runtime:cleanup("source",owner);context.target=executionEnemy(32);assert(execute())
    assert(#runtime.actors==0)
  `);
});

test('execution commits observed death even when a downstream callback throws after the credited kill', async () => {
  await withLua(executionMocks + `
    local target=context.target
    target.KillWithSource=function(self,source)
      assert(guardDepth==1 and runtime.depth==1 and source.Entity==owner)
      self.dead=true;self.source=source
      error("downstream callback failed after actual death")
    end
    assert(execute() and target.dead and target.source.Entity==owner)
    assert(runtime:snapshot()[1].remaining==120 and runtime.depth==0 and guardDepth==0)
    context.target=executionEnemy(31)
    assert(not execute() and context.target.calls==nil)
  `);
});

test('execution cooldowns survive restore and remain isolated across owners, sources and source loss', async () => {
  await withLua(executionMocks + `
    assert(execute())
    local saved=runtime:snapshot()
    runtime:cleanup()
    assert(runtime:restore(saved,function(seed) if seed==owner.InitSeed then return owner end end))
    context.target=executionEnemy(31)
    assert(not execute())
    local secondary=entity(32);secondary.data.expandedSecondary={}
    context.source=secondary
    assert(not runtime:run("other-source",owner,action("execute_enemy"),"execution",context))
    context.source=nil
    assert(runtime:run("other-source",owner,action("execute_enemy"),"execution",context))
    local originalOwner=owner
    owner=other;context.owner=owner;context.target=executionEnemy(33)
    assert(execute() and context.target.source.Entity==other)
    owner=originalOwner;context.owner=owner;context.target=executionEnemy(34)
    frame=120;ownership[owner]=false
    assert(not execute())
    runtime:tick();ownership[owner]=true
    assert(execute())
    assert(#runtime.actors==0 and spawnCalls==0 and guardDepth==0 and runtime.depth==0)
  `);
});

test('room cleanup retains cooldowns and failed partial emissions restore guard and actor capacity', async () => {
  await withLua(`
    local original=runtime.deps.spawn
    runtime.deps.spawn=function(...)
      if spawnCalls==1 then error("spawn API failed after one tear") end
      return original(...)
    end
    assert(not run("extra_tears"))
    assert(#runtime.actors==0 and not entities[1].exists and next(runtime.cooldowns)==nil)
    assert(runtime.depth==0 and guardDepth==0)
    runtime.deps.spawn=original
    assert(run("extra_tears"))
    runtime:clearActors()
    assert(#runtime.actors==0 and not run("extra_tears"))
    assert(runtime:snapshot()[1].remaining==60)
    frame=60; assert(run("extra_tears"))
    owner.dead=true; runtime:tick()
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
`);
});
test('Lua and Node weights and user summaries agree for every family and extrema', async () => {
  const checks = [];
  for (const spec of Object.values(expandedEffects.actions)) {
    for (const bound of ['example', 'min', 'max']) {
      const action = { ...spec.example };
      if (bound !== 'example') for (const [name, parameter] of Object.entries(spec.params)) {
        if (!parameter.enum) action[name] = parameter[bound];
      }
      checks.push('assert(math.abs(Expanded.weight(' + lua(action) + ',catalog)-' + expandedActionWeight(action) + ')<0.000001)');
      checks.push('assert(Expanded.summary(' + lua(action) + ',catalog)==' + lua(summarizeExpandedAction(action)) + ')');
    }
  }
  checks.push('assert(Expanded.weight({type="dash",speed=99,cooldown=90},catalog)==nil)');
  checks.push('assert(Expanded.summary({type="unknown"},catalog)==nil)');
  assert.equal(await withLua(checks.join('\n') + '\nreturn true'), true);
});
test('save restores cooldown remainders, rejects corrupt state atomically and never restores actors', async () => {
  await withLua(`
    assert(run("coins_to_charge"))
    frame=20
    local saved=runtime:snapshot()
    assert(#saved==1 and saved[1].remaining==100 and saved[1].owner==11 and saved[1].source=="source")
    runtime:cleanup()
    frame=1000
    local resolve=function(seed) if seed==11 then return owner end end
    assert(runtime:restore(saved,resolve))
    assert(not run("coins_to_charge"))
    frame=1099; assert(not run("coins_to_charge"))
    local invalid={{source="source",owner=11,key="coins_to_charge",remaining=2000}}
    assert(not runtime:restore(invalid,resolve))
    assert(runtime:snapshot()[1].remaining==1)
    local duplicate={saved[1],saved[1]}
    assert(not runtime:restore(duplicate,resolve))
    assert(not runtime:restore(saved,function() return other end))
    local sparse={[1]=saved[1],[3]=saved[1]}
    assert(not runtime:restore(sparse,resolve))
    frame=1100; assert(run("coins_to_charge"))
    assert(run("temporary_ally"))
    assert(not runtime:restore({},resolve))
    assert(#runtime.actors==1)
    assert(not runtime:cleanup({}))
    assert(#runtime.actors==1)
    runtime:cleanup({index="source"},owner)
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
    ownership[owner]=false
    assert(not runtime:restore(saved,resolve))
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
`);
});

test('every family preflights its cooldown and co-op owner without consuming condition state', async () => {
  await withLua(executionMocks + `
    for name,spec in pairs(catalog.actions) do
      runtime:cleanup()
      frame=0
      local context=event(spec.triggers[1])
      if name=="execute_enemy" then context.target=executionEnemy() end
      if name=="target_impulse" then context.target=entity(77); context.target.enemy=true; context.target.Position=vector(10,0) end
      if name=="block_projectiles" or name=="reflect_projectiles" then
        shots={}
        for index=1,4 do shots[#shots+1]=ordinaryProjectile(index) end
      end
      local profile={index="source",ruleState={untouched=1}}
      assert(runtime.canRun(profile,owner,action(name),name,context))
      assert(runtime:run(profile,owner,action(name),name,context))
      assert(not runtime.canRun(profile,owner,action(name),name,context))
      assert(not runtime.canRun(profile,other,action(name),name,context))
      assert(profile.ruleState.untouched==1 and next(profile.ruleState)=="untouched")
      local saved=runtime:snapshot()
      assert(#saved==1 and saved[1].remaining==action(name).cooldown)
    end
`);
});

test('cone and ring spawn plain owned tears, synchronous and asynchronous recursion are blocked', async () => {
  await withLua(`
    assert(run("extra_tears"))
    assert(#runtime.actors==3 and #entities==3 and reentered)
    for _,tear in ipairs(entities) do
      assert(tear.CollisionDamage==1 and tear.TearFlags==0 and tear.SpawnerEntity==owner)
      assert(tear.Type==2 and tear.Variant==0 and tear.data.expandedSecondary.owner==11)
      assert(runtime:suppressed(tear))
      local context=event("tear_fire"); context.source=tear
      assert(not runtime.canRun("source",owner,action("extra_tears"),"different",context))
      assert(not runtime:run("source",owner,action("extra_tears"),"different",context))
    end
    assert(entities[1].Velocity.Y<0 and entities[3].Velocity.Y>0)
    local child=entity(900); child.SpawnerEntity=entities[1]
    assert(runtime:suppressed(child))
    child.SpawnerEntity=child; assert(runtime:suppressed(child))
    local ring=action("extra_tears"); ring.pattern="ring"; ring.count=4
    assert(runtime:run("source",owner,ring,"ring",event("active_use")))
    assert(#runtime.actors==7)
    assert(math.abs(entities[5].Velocity.X)<0.00001 and entities[5].Velocity.Y>0)
    assert(guardDepth==0 and runtime.depth==0)
`);
});

test('pure preflight never spends resources, mutates state, spawns actors or consumes RNG', async () => {
  await withLua(executionMocks + `
    math.random=function() error("preflight consumed RNG") end
    for name,spec in pairs(catalog.actions) do
      local context=event(spec.triggers[1])
      if name=="execute_enemy" then context.target=executionEnemy() end
      if name=="target_impulse" then context.target=entity(77); context.target.enemy=true; context.target.Position=vector(10,0) end
      if name=="block_projectiles" or name=="reflect_projectiles" then shots={ordinaryProjectile(88)} end
      for count=1,10 do assert(runtime.canRun({index="source"},owner,action(name),name,context)) end
    end
    assert(owner.coins==20 and owner.charge==0 and owner.Velocity.X==0)
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil and spawnCalls==0 and guardDepth==0)
    assert(shots[1].exists)
    local context=event("active_use"); context.velocity=vector(0,0)
    assert(not runtime.canRun("source",owner,action("dash"),"dash",context))
`);
});

test('cooldowns commit only on successful work and are isolated by owner/source/effect', async () => {
  await withLua(`
    spawnFails=true
    assert(not run("extra_tears"))
    assert(next(runtime.cooldowns)==nil and runtime.depth==0 and guardDepth==0)
    spawnFails=false
    assert(run("extra_tears"))
    assert(not run("extra_tears"))
    assert(not runtime.canRun("source",owner,action("extra_tears"),"extra_tears",event("tear_fire")))
    assert(run("extra_tears","extra_tears",other))
    assert(run("extra_tears","other-key"))
    assert(runtime:run("other-source",owner,action("extra_tears"),"extra_tears",event("tear_fire")))
    frame=59; assert(not run("extra_tears"))
    frame=60
    runtime:cleanup("other-source")
    assert(run("extra_tears"))
    assert(not runtime:run("lost",owner,action("extra_tears"),"new",event("tear_fire")))
    assert(not runtime:run("source",other,action("extra_tears"),"new",event("tear_fire",owner)))
    ownership[owner]=false
    assert(not run("extra_tears","new"))
    runtime:tick()
    for _,actor in ipairs(runtime.actors) do assert(actor.owner==other) end
`);
});

test('target push/pull set bounded velocity and reject bosses, friendlies and missing targets', async () => {
  await withLua(`
    local context=event("enemy_hit"); context.target=entity(99); context.target.Position=vector(30,40); context.target.enemy=true
    assert(run("target_impulse",nil,nil,context))
    assert(math.abs(context.target.Velocity.X+2.4)<0.00001 and math.abs(context.target.Velocity.Y+3.2)<0.00001)
    local push=action("target_impulse"); push.direction="push"; push.strength=8
    assert(runtime:run("source",owner,push,"push",context))
    assert(math.abs(context.target.Velocity.X-4.8)<0.00001)
    context.target.boss=true; assert(not run("target_impulse","boss",nil,context))
    context.target.boss=false; context.target.friendly=true; assert(not run("target_impulse","friendly",nil,context))
    context.target.friendly=false; context.target.Position=owner.Position; assert(not run("target_impulse","zero",nil,context))
    context.target=nil; assert(not run("target_impulse","missing",nil,context))
`);
});

test('projectile block is bounded and hostile-only; empty attempts do not start cooldown', async () => {
  await withLua(`
    assert(not run("block_projectiles"))
    assert(next(runtime.cooldowns)==nil)
    for index=1,6 do local shot=entity(index); shot.hostile=index~=1; shot.Position=vector(index==2 and 61 or 60,0); shots[#shots+1]=shot end
    assert(run("block_projectiles"))
    assert(shots[1].exists and shots[2].exists and not shots[3].exists and not shots[4].exists and shots[5].exists and shots[6].exists)
    assert(not run("block_projectiles"))
    frame=120; assert(run("block_projectiles"))
    frame=240; assert(not run("block_projectiles"))
`);
});

test('reflection preflight is pure and rejects special, friendly, secondary and invalid projectiles', async () => {
  await withLua(`
    shots={ordinaryProjectile(1)}
    local shot=shots[1]
    local spec=action("reflect_projectiles")
    local context=event("active_use")
    assert(runtime.canRun("source",owner,spec,"reflect",context))
    assert(spawnCalls==0 and shot.exists and #runtime.actors==0 and next(runtime.cooldowns)==nil)
    for _,field in ipairs({"Variant","SubType","ProjectileFlags"}) do
      shot[field]=1; assert(not runtime.canRun("source",owner,spec,"reflect",context)); shot[field]=0
      shot[field]=nil; assert(not runtime.canRun("source",owner,spec,"reflect",context)); shot[field]=0
    end
    shot.hostile=false; assert(not runtime.canRun("source",owner,spec,"reflect",context)); shot.hostile=true
    shot.data.expandedSecondary={}; assert(not runtime.canRun("source",owner,spec,"reflect",context)); shot.data.expandedSecondary=nil
    for _,velocity in ipairs({vector(0,0),vector(math.huge,0),vector(0/0,1)}) do
      shot.Velocity=velocity; assert(not runtime.canRun("source",owner,spec,"reflect",context))
    end
    shot.Velocity=vector(3,4)
    shot.Position=vector(60.001,0); assert(not runtime.canRun("source",owner,spec,"reflect",context))
    shot.Position=vector(math.huge,0); assert(not runtime.canRun("source",owner,spec,"reflect",context))
    shot.Position=vector(60,0); assert(runtime.canRun("source",owner,spec,"reflect",context))
    assert(not runtime.canRun("source",other,spec,"reflect",context))
    assert(spawnCalls==0 and shot.exists and #runtime.actors==0 and next(runtime.cooldowns)==nil)
  `);
});

test('reflection returns capped plain tears with reversed direction and actual co-op ownership', async () => {
  await withLua(`
    shots={ordinaryProjectile(1),ordinaryProjectile(2),ordinaryProjectile(3)}
    shots[1].Position=vector(60,0)
    assert(run("reflect_projectiles",nil,other))
    assert(not shots[1].exists and not shots[2].exists and shots[3].exists)
    assert(#runtime.actors==2 and #entities==2 and reentered)
    for _,tear in ipairs(entities) do
      assert(tear.SpawnerEntity==other and tear.data.expandedSecondary.owner==22)
      assert(tear.Type==2 and tear.Variant==0 and tear.TearFlags==0 and tear.CollisionDamage==1)
      assert(math.abs(tear.Velocity.X+4.8)<0.00001 and math.abs(tear.Velocity.Y+6.4)<0.00001)
      assert(runtime:suppressed(tear))
      local context=event("tear_fire",other); context.source=tear
      assert(not runtime.canRun("source",other,action("extra_tears"),"nested",context))
    end
    assert(entities[1].Position.X==60 and not run("reflect_projectiles",nil,other))
    frame=90; runtime:tick(); assert(#runtime.actors==0 and not entities[1].exists)
    assert(runtime:snapshot()[1].remaining==30)
    frame=120; assert(run("reflect_projectiles",nil,other))
    runtime:cleanup("source",other); assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
  `);
});

test('reflection leaves bullets intact on spawn or removal failure and preserves actual partial successes', async () => {
  await withLua(`
    shots={}
    for index=1,20 do shots[#shots+1]=ordinaryProjectile(index) end
    spawnFails=true; assert(not run("reflect_projectiles"))
    assert(spawnCalls==2 and #runtime.actors==0 and next(runtime.cooldowns)==nil)
    for _,shot in ipairs(shots) do assert(shot.exists) end
    shots={ordinaryProjectile(1),ordinaryProjectile(2)}
    spawnFails=false
    local original=runtime.deps.spawn
    runtime.deps.spawn=function() error("spawn failed") end
    assert(not run("reflect_projectiles"))
    assert(shots[1].exists and shots[2].exists and #runtime.actors==0 and next(runtime.cooldowns)==nil)
    runtime.deps.spawn=original
    runtime.deps.spawn=function(...) local child=original(...); child.ToTear=function() return nil end; return child end
    assert(not run("reflect_projectiles"))
    assert(shots[1].exists and shots[2].exists and #runtime.actors==0 and next(runtime.cooldowns)==nil)
    runtime.deps.spawn=original
    shots[1].Remove=function() error("remove failed") end
    shots[2].Remove=shots[1].Remove
    assert(not run("reflect_projectiles"))
    assert(shots[1].exists and shots[2].exists and #runtime.actors==0 and next(runtime.cooldowns)==nil)
    for _,tear in ipairs(entities) do assert(not tear.exists) end
    shots={ordinaryProjectile(3),ordinaryProjectile(4)}
    local attempts=0
    runtime.deps.spawn=function(...) attempts=attempts+1; if attempts==2 then error("second spawn failed") end; return original(...) end
    assert(run("reflect_projectiles"))
    assert(not shots[1].exists and shots[2].exists and #runtime.actors==1)
    assert(runtime.actors[1].entity.exists and runtime:snapshot()[1].remaining==120)
    assert(runtime.depth==0 and guardDepth==0)
    runtime:cleanup(); runtime.deps.spawn=original
    shots={ordinaryProjectile(5)}
    shots[1].Remove=function(self) self.exists=false; error("post-remove callback failed") end
    assert(run("reflect_projectiles"))
    assert(not shots[1].exists and #runtime.actors==1 and runtime.actors[1].entity.exists)
  `);
});

test('reflection shares the secondary-tear capacity and does not consume unavailable bullets', async () => {
  await withLua(`
    local ring=action("extra_tears"); ring.pattern="ring"; ring.count=6
    assert(runtime:run("source",owner,ring,"a",event("active_use")))
    ring.count=5; assert(runtime:run("source",owner,ring,"b",event("active_use")))
    shots={ordinaryProjectile(1),ordinaryProjectile(2)}
    assert(run("reflect_projectiles"))
    assert(#runtime.actors==12 and not shots[1].exists and shots[2].exists)
    assert(not runtime.canRun("source2",owner,action("reflect_projectiles"),"other",event("active_use")))
    assert(shots[2].exists)
    ownership[owner]=false; runtime:tick()
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil and shots[2].exists)
  `);
});

test('dash clamps by normalized input, does not grant invulnerability, rejects zero/nonfinite input', async () => {
  await withLua(`
    local context=event("active_use"); context.velocity=vector(0,0)
    assert(not run("dash",nil,nil,context))
    context.velocity=vector(math.huge,0); assert(not run("dash",nil,nil,context))
    context.velocity=vector(300,400); assert(run("dash",nil,nil,context))
    assert(math.abs(owner.Velocity.X-4.8)<0.00001 and math.abs(owner.Velocity.Y-6.4)<0.00001)
    assert(owner.invulnerable==nil and owner.damageCooldown==nil and not run("dash",nil,nil,context))
`);
});

test('charge conversion is paid, primary-slot-only, capped, rollback-safe and success-cooled', async () => {
  await withLua(`
    owner.coins=4; assert(not run("coins_to_charge"))
    owner.coins=20; owner.charge=6; assert(not run("coins_to_charge"))
    owner.charge=0; owner.item=0; assert(not run("coins_to_charge"))
    owner.item=1; limit=0; assert(not run("coins_to_charge"))
    limit=13; assert(not run("coins_to_charge"))
    limit=nil; assert(not run("coins_to_charge"))
    limit=6; owner.chargeFails=true
    assert(not run("coins_to_charge")); assert(owner.coins==20 and owner.charge==0 and next(runtime.cooldowns)==nil)
    owner.chargeFails=false; owner.charge=5
    local conversion=action("coins_to_charge"); conversion.charge=2
    assert(runtime:run("source",owner,conversion,"coins_to_charge",event("room_clear")))
    assert(owner.charge==6 and owner.coins==15)
    assert(not run("coins_to_charge"))
    owner.charge=0; frame=120; assert(run("coins_to_charge"))
    assert(owner.charge==1 and owner.coins==10)
`);
});

test('temporary allies are capped across sources, marked, finite-lived and source-loss cleaned', async () => {
  await withLua(`
    charmFails=true; assert(not run("temporary_ally")); assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
    charmFails=false
    assert(run("temporary_ally"))
    assert(runtime:run("source2",owner,action("temporary_ally"),"ally",event("active_use")))
    assert(not runtime.canRun("source3",owner,action("temporary_ally"),"ally",event("active_use")))
    assert(not runtime:run("source3",owner,action("temporary_ally"),"ally",event("active_use")))
    assert(run("temporary_ally",nil,other))
    assert(#runtime.actors==3 and runtime.actors[1].entity.charmed==151)
    assert(runtime.actors[1].entity.charmOwner==owner and runtime:suppressed(runtime.actors[1].entity))
    local retained=runtime.actors[3].entity
    runtime:cleanup("source",owner)
    assert(#runtime.actors==2 and retained.exists)
    frame=150; runtime:tick(); assert(#runtime.actors==0 and not retained.exists)
    frame=180; assert(run("temporary_ally"))
    ownership[owner]=false; runtime:tick(); assert(#runtime.actors==0)
`);
});

test('global/owner actor ceilings, expiry and external removal release capacity', async () => {
  await withLua(`
    local tears=action("extra_tears"); tears.count=6; tears.pattern="ring"
    assert(runtime:run("source",owner,tears,"a",event("active_use")))
    assert(runtime:run("source",owner,tears,"b",event("active_use")))
    assert(#runtime.actors==12 and not runtime.canRun("source",owner,tears,"c",event("active_use")))
    local removed=runtime.actors[1].entity; removed:Remove()
    assert(#runtime.actors==11)
    assert(runtime:run("source",owner,tears,"c",event("active_use")))
    assert(#runtime.actors==12)
    frame=90; runtime:tick(); assert(#runtime.actors==0)
    local players={}
    for index=1,10 do
      local who=player(1000+index); players[index]=who; ownership[who]=true
      runtime:run("source",who,tears,"a",event("active_use",who))
      runtime:run("source",who,tears,"b",event("active_use",who))
    end
    assert(#runtime.actors==64)
    runtime:cleanup()
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
    for _,who in ipairs(players) do
      runtime:run("source",who,action("temporary_ally"),"a",event("active_use",who))
      runtime:run("source",who,action("temporary_ally"),"b",event("active_use",who))
    end
    assert(#runtime.actors==16)
    runtime:cleanup()
    assert(#runtime.actors==0 and next(runtime.cooldowns)==nil)
`);
});

test('invalid dependencies and registry drift fail closed', async () => {
  await withLua(`
    assert(not pcall(Expanded.new,{},catalog))
    catalog.actions.unknown={}; assert(not pcall(Expanded.new,runtime.deps,catalog)); catalog.actions.unknown=nil
    catalog.actions.dash=nil; assert(not pcall(Expanded.new,runtime.deps,catalog))
`);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';

const proposal = JSON.parse(await readFile(new URL('../../content-contract/expanded-conditions.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../../content-contract/capabilities.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../../demo/live-sprite-swap/expanded_conditions.lua', import.meta.url), 'utf8');
const validatorSource = await readFile(new URL('../../content-contract/conditions.mjs', import.meta.url), 'utf8');
const active = Object.fromEntries(Object.entries(proposal.condition_registry).filter(([, definition]) => definition.enabled !== false));
const combined = { ...capabilities, condition_registry: { ...capabilities.condition_registry, ...active }, event_contexts: proposal.event_contexts };
delete combined.condition_registry.pickup_kind;
const isolatedValidator = validatorSource.replace(/^import capabilities .*;\r?\n/, 'const capabilities = ' + JSON.stringify(combined) + ';\n');
assert.notEqual(isolatedValidator, validatorSource, 'load the actual Node validator against the proposed contract, without editing shared files');
const nodeValidator = await import('data:text/javascript;base64,' + Buffer.from(isolatedValidator).toString('base64'));
const factory = new LuaFactory();

function lua(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value !== 'object') return String(value);
  return '{' + (Array.isArray(value)
    ? value.map(lua)
    : Object.entries(value).map(([key, entry]) => '[' + lua(key) + ']=' + lua(entry))).join(',') + '}';
}

const mocks = String.raw`
function fresh()
  room={IsFirstVisit=function() return true end,IsClear=function() return false end,GetAliveEnemiesCount=function() return 2 end}
  level={GetStage=function() return 3 end,GetCurses=function() return 1 end}
  game={GetRoom=function() return room end,GetLevel=function() return level end,Difficulty=0}
  player={CanFly=false,Velocity={X=1,Y=0},CanShoot=function() return true end,
    GetShootingInput=function() return {X=0,Y=1} end,GetPlayerType=function() return 10 end,
    HasCollectible=function(_,id,ignoreModifiers,ignoreSpoof) assert(id==3 or id==118); assert(ignoreModifiers==true and ignoreSpoof==true); return true end}
  other={CanFly=true}
  npc={HitPoints=5,MaxHitPoints=10,IsEnemy=function() return true end,
    IsBoss=function() return true end,IsChampion=function() return true end,
    HasEntityFlags=function(_,flag) return flag~=1 end}
  npc.ToNPC=function() return npc end
  familiar={Player=player,Variant=8,Exists=function() return true end}
  familiar.ToFamiliar=function() return familiar end
  entities={familiar}
  api={Game=function() return game end,
    Difficulty={DIFFICULTY_NORMAL=0,DIFFICULTY_HARD=1,DIFFICULTY_GREED=2,DIFFICULTY_GREEDIER=3},
    LevelCurse={CURSE_OF_DARKNESS=1,CURSE_OF_LABYRINTH=2,CURSE_OF_THE_LOST=4,CURSE_OF_THE_UNKNOWN=8,CURSE_OF_MAZE=32,CURSE_OF_BLIND=64},
    PlayerType={PLAYER_THELOST=10,PLAYER_THELOST_B=31,PLAYER_KEEPER=14,PLAYER_KEEPER_B=33,PLAYER_THEFORGOTTEN=16,PLAYER_THESOUL=17,PLAYER_THEFORGOTTEN_B=35,PLAYER_THESOUL_B=40},
    CollectibleType={COLLECTIBLE_SPOON_BENDER=3,COLLECTIBLE_BRIMSTONE=118},
    FamiliarVariant={BROTHER_BOBBY=8,SISTER_MAGGY=9},EntityType={ENTITY_FAMILIAR=3},
    EntityFlag={FLAG_FRIENDLY=1,FLAG_SLOW=2,FLAG_BURN=4,FLAG_FEAR=8,FLAG_POISON=16,FLAG_CHARM=32,FLAG_CONFUSION=64},
    Isaac={FindByType=function(kind,variant,subtype,cache,ignore) assert(kind==3 and subtype==-1 and cache==false and ignore==false); return entities end}}
  context={player=player,event={trigger='enemy_hit',owner=player,target=npc,damage=3,weapon_kind='tear',pickup_kind='coin'}}
  expanded=Expanded.new(catalog,api)
end

function check(condition,expected)
  local actual=expanded.handlers[condition.type](condition,context)
  assert(type(actual)=='boolean' and actual==expected,condition.type..' expected '..tostring(expected)..' got '..tostring(actual))
end

math.random=function() error('pure conditions must not consume RNG') end
Isaac={GetPlayer=function() error('must use context.player, never player zero') end}
`;

async function run(body) {
  const engine = await factory.createEngine();
  try {
    engine.global.set('moduleSource', source);
    await engine.doString('Expanded=assert(load(moduleSource))(); catalog=' + lua(proposal));
    await engine.doString(mocks + '\nfresh()\n' + body);
  } finally {
    engine.global.close();
  }
}

function sample(name, definition) {
  return { type: name, ...Object.fromEntries(Object.entries(definition.params).map(([parameter, specification]) => [parameter,
    specification.type === 'string' ? specification.enum[0] : specification.minimum])) };
}

test('proposal has exact handler coverage, pure metadata, and satisfiable guaranteed/optional fields', async () => {
  assert.deepEqual(proposal.condition_registry.pickup_kind.params.kind.enum, capabilities.pickup_types);
  assert.deepEqual(proposal.condition_registry.target_has_status.params.status.enum.sort(), Object.keys(capabilities.aura_statuses).sort());
  for (const [name, definition] of Object.entries(proposal.condition_registry)) {
    assert.equal(definition.category, 'pure', name);
    assert.ok(definition.guidance && definition.summary, name);
    assert.ok(definition.contexts.length, name);
    for (const trigger of definition.contexts) {
      const event = proposal.event_contexts[trigger];
      for (const required of definition.requires) assert.ok([...event.fields, ...event.optional_fields].includes(required), name + '/' + trigger + '/' + required);
    }
  }
  await run(`
    local count=0
    for name in pairs(catalog.condition_registry) do assert(type(expanded.handlers[name])=='function',name); count=count+1 end
    local handlers=0; for name in pairs(expanded.handlers) do assert(catalog.condition_registry[name],name); handlers=handlers+1 end
    assert(count==20 and handlers==count)
  `);
});

test('actual Node and Lua validators cover every condition, parameter bound, enum, and context pair', async () => {
  const cases = [];
  for (const [name, definition] of Object.entries(proposal.condition_registry)) {
    const condition = sample(name, definition);
    const enabled = definition.enabled !== false;
    for (const trigger of Object.keys(proposal.event_contexts)) cases.push({ condition, trigger, expected: enabled && definition.contexts.includes(trigger) });
    const trigger = definition.contexts[0];
    for (const bad of [{ ...condition, extra: 1 }, { ...condition, type: 'missing' }, { ...condition, type: false }]) cases.push({ condition: bad, trigger, expected: false });
    for (const [parameter, specification] of Object.entries(definition.params)) {
      const missing = { ...condition }; delete missing[parameter];
      cases.push({ condition: missing, trigger, expected: false });
      const badValues = specification.type === 'string' ? ['__unsupported__', 1, false] : ['1', false, specification.minimum - 1, specification.maximum + 1];
      if (specification.type === 'integer') badValues.push(specification.minimum + 0.5);
      for (const bad of badValues) cases.push({ condition: { ...condition, [parameter]: bad }, trigger, expected: false });
      const goodValues = specification.type === 'string' ? specification.enum : [specification.minimum, specification.maximum];
      for (const good of goodValues) cases.push({ condition: { ...condition, [parameter]: good }, trigger, expected: enabled });
    }
  }
  for (const { condition, trigger, expected } of cases) {
    if (expected) assert.doesNotThrow(() => nodeValidator.validateCondition(condition, trigger), JSON.stringify({ condition, trigger }));
    else assert.throws(() => nodeValidator.validateCondition(condition, trigger), JSON.stringify({ condition, trigger }));
  }
  await run('for _,case in ipairs(' + lua(cases) + ') do assert(expanded.validate(case.condition,case.trigger)==case.expected,tostring(case.condition.type).."/"..case.trigger) end');
  await run(`
    for _,value in ipairs({0/0,math.huge,-math.huge}) do
      assert(not expanded.validate({type='damage_at_least',damage=value},'enemy_hit'))
      assert(not expanded.validate({type='target_health_at_least',fraction=value},'enemy_hit'))
    end
    assert(not expanded.validate(nil,'enemy_hit'))
    assert(not expanded.validate({},'enemy_hit'))
  `);
  for (const amount of [NaN, Infinity, -Infinity]) assert.throws(() => nodeValidator.validateCondition({ type: 'damage_at_least', damage: amount }, 'enemy_hit'));
});

const runtimeCases = [
  [{ type: 'first_visit' }, "room.IsFirstVisit=function() return false end"],
  [{ type: 'room_clear_state', state: 'hostile' }, "room.GetAliveEnemiesCount=function() return 0 end"],
  [{ type: 'stage_at_most', stage: 3 }, "level.GetStage=function() return 4 end"],
  [{ type: 'stage_at_least', stage: 3 }, "level.GetStage=function() return 2 end"],
  [{ type: 'difficulty_kind', kind: 'normal' }, "game.Difficulty=1"],
  [{ type: 'curse_active', curse: 'darkness' }, "level.GetCurses=function() return 2 end"],
  [{ type: 'while_moving' }, "player.Velocity={X=0,Y=0}"],
  [{ type: 'while_firing' }, "player.GetShootingInput=function() return {X=0,Y=0} end"],
  [{ type: 'while_grounded' }, "player.CanFly=true"],
  [{ type: 'character_kind', kind: 'lost' }, "player.GetPlayerType=function() return 14 end"],
  [{ type: 'has_collectible', tag: 'homing_tears' }, "player.HasCollectible=function() return false end"],
  [{ type: 'has_familiar', tag: 'brother_bobby' }, "familiar.Player=other"],
  [{ type: 'target_is_boss' }, "npc.IsBoss=function() return false end"],
  [{ type: 'target_is_champion' }, "npc.IsChampion=function() return false end"],
  [{ type: 'target_health_at_most', fraction: 0.5 }, "npc.HitPoints=6"],
  [{ type: 'target_health_at_least', fraction: 0.5 }, "npc.HitPoints=4"],
  [{ type: 'target_has_status', status: 'slow' }, "npc.HasEntityFlags=function() return false end"],
  [{ type: 'damage_at_least', damage: 3 }, "context.event.damage=2.99"],
  [{ type: 'weapon_kind', kind: 'tear' }, "context.event.weapon_kind='laser'"],
];

for (const [condition, deny] of runtimeCases) test(condition.type + ' runs the real Lua handler: true, false, invalid, and missing owner', async () => {
  await run('local condition=' + lua(condition) + String.raw`
    check(condition,true)
    ` + deny + String.raw`
    check(condition,false)
    fresh(); condition.unexpected=1; check(condition,false); condition.unexpected=nil
    context.player=nil; check(condition,false)
  `);
});

test('target predicates reject non-NPC, friendly, unknown, missing, wrong-owner and wrong-context targets', async () => {
  const targets = runtimeCases.filter(([condition]) => condition.type.startsWith('target_')).map(([condition]) => condition);
  await run('for _,condition in ipairs(' + lua(targets) + String.raw`) do
    for _,mutate in ipairs({
      function() context.event.target={} end,
      function() npc.IsEnemy=function() return false end end,
      function() npc.IsEnemy=nil end,
      function() npc.HasEntityFlags=function() return true end end,
      function() npc.HasEntityFlags=nil end,
      function() api.EntityFlag.FLAG_FRIENDLY=nil end,
      function() context.event.target=nil end,
      function() context.event.owner=other end,
      function() context.event.owner=nil end,
      function() context.event.trigger='bomb_explode' end,
      function() context.event.trigger='player_death' end,
      function() context.event=nil end,
    }) do fresh(); mutate(); check(condition,false) end
    fresh(); context.event.trigger='on_kill'; check(condition,true)
    fresh(); context.event.trigger='player_hurt'; check(condition,true)
  end`);
});

test('every optional runtime requirement fails before RNG when absent', async () => {
  await run('for name,definition in pairs(catalog.condition_registry) do if definition.enabled~=false then for _,field in ipairs(definition.requires) do if field~="player" then fresh(); local condition=' + lua(Object.fromEntries(Object.entries(proposal.condition_registry).map(([name, definition]) => [name, sample(name, definition)]))) + String.raw`
    condition=condition[name]; context.event.trigger=definition.contexts[1]; context.event[field]=nil
    check(condition,false)
  end end end end`);
});

test('health fractions are inclusive, finite, lethal-safe and require valid maximum HP', async () => {
  await run(`
    for _,bad in ipairs({0,-1,0/0,math.huge,-math.huge}) do
      fresh(); npc.MaxHitPoints=bad; check({type='target_health_at_most',fraction=1},false)
    end
    for _,bad in ipairs({0/0,math.huge,-math.huge,11}) do
      fresh(); npc.HitPoints=bad; check({type='target_health_at_most',fraction=1},false)
    end
    fresh(); npc.HitPoints=-4
    check({type='target_health_at_most',fraction=0},true)
    check({type='target_health_at_least',fraction=0},true)
    check({type='target_health_at_least',fraction=0.01},false)
    npc.HitPoints=10; check({type='target_health_at_least',fraction=1},true)
    npc.MaxHitPoints=nil; check({type='target_health_at_least',fraction=0},false)
  `);
});

test('damage is callback-only, positive, finite, owned, never inferred from stats or kills', async () => {
  await run(`
    for _,trigger in ipairs({'enemy_hit','player_hurt'}) do
      fresh(); context.event.trigger=trigger; check({type='damage_at_least',damage=3},true)
    end
    fresh(); context.event.trigger='player_hurt'; context.event.target=nil
    check({type='damage_at_least',damage=3},true)
    for _,trigger in ipairs({'on_kill','boss_kill','collision','tear_impact','bomb_explode','tear_fire','player_death'}) do
      fresh(); context.event.trigger=trigger; check({type='damage_at_least',damage=0},false)
    end
    for _,amount in ipairs({0,-1,0/0,math.huge,-math.huge,'3',false}) do
      fresh(); context.event.damage=amount; check({type='damage_at_least',damage=0},false)
    end
    fresh(); context.event.damage=nil; player.Damage=100; check({type='damage_at_least',damage=1},false)
    fresh(); context.event.owner=other; check({type='damage_at_least',damage=1},false)
    fresh(); context.event.target={}; check({type='damage_at_least',damage=1},false)
  `);
});

test('weapon predicates use normalized delivery only; pickup remains gated even with a normalized value', async () => {
  await run(`
    for _,kind in ipairs(catalog.condition_registry.weapon_kind.params.kind.enum) do
      fresh(); context.event.weapon_kind=kind; check({type='weapon_kind',kind=kind},true)
      context.event.weapon_kind=nil; player.WeaponType=kind; check({type='weapon_kind',kind=kind},false)
      context.event.weapon_kind=kind; context.event.owner=other; check({type='weapon_kind',kind=kind},false)
    end
    fresh(); context.event.weapon_kind='unknown'; check({type='weapon_kind',kind='tear'},false)
    context.event.weapon_kind='tear'; context.event.trigger='collision'; check({type='weapon_kind',kind='tear'},false)
    for _,kind in ipairs(catalog.condition_registry.pickup_kind.params.kind.enum) do
      fresh(); context.event.trigger='pickup'; context.event.pickup_kind=kind
      assert(not expanded.validate({type='pickup_kind',kind=kind},'pickup'))
      check({type='pickup_kind',kind=kind},false)
    end
    catalog.condition_registry.pickup_kind.enabled=true
    fresh(); context.event.trigger='pickup'; check({type='pickup_kind',kind='coin'},true)
    context.event.pickup_kind=nil; check({type='pickup_kind',kind='coin'},false)
    context.event.pickup_kind='unknown'; check({type='pickup_kind',kind='coin'},false)
    context.event.pickup_kind='coin'; context.event.owner=other; check({type='pickup_kind',kind='coin'},false)
    catalog.condition_registry.pickup_kind.enabled=false
  `);
});

test('room and player getters fail closed, and co-op queries use only context.player', async () => {
  await run(`
    fresh(); room.IsClear=function() return true end; check({type='room_clear_state',state='clear'},true)
    check({type='room_clear_state',state='hostile'},false)
    for _,stage in ipairs({0,14,1.5,0/0,math.huge}) do
      fresh(); level.GetStage=function() return stage end; check({type='stage_at_least',stage=1},false)
    end
    fresh(); api.Game=nil; check({type='first_visit'},false); check({type='difficulty_kind',kind='normal'},false)
    fresh(); room.IsFirstVisit=function() error('unavailable') end; check({type='first_visit'},false)
    fresh(); context.player=other; check({type='while_grounded'},false); check({type='has_collectible',tag='homing_tears'},false)
    fresh(); player.CanFly=nil; check({type='while_grounded'},false)
    fresh(); player.CanFly=0; check({type='while_grounded'},false)
    fresh(); player.GetShootingInput=nil; check({type='while_firing'},false)
    fresh(); player.CanShoot=function() return false end; check({type='while_firing'},false)
    fresh(); player.Velocity={X=0/0,Y=1}; check({type='while_moving'},false)
    fresh(); player.Velocity=nil; check({type='while_moving'},false)
    fresh(); player.HasCollectible=nil; check({type='has_collectible',tag='homing_tears'},false)
    fresh(); player.HasCollectible=function() error('unavailable') end; check({type='has_collectible',tag='homing_tears'},false)
    fresh(); player.GetPlayerType=function() return 1000 end; check({type='character_kind',kind='lost'},false)
    fresh(); familiar.Exists=function() return false end; check({type='has_familiar',tag='brother_bobby'},false)
    fresh(); familiar.Variant=9; check({type='has_familiar',tag='brother_bobby'},false)
    fresh(); entities={}; check({type='has_familiar',tag='brother_bobby'},false)
    fresh(); api.Isaac.FindByType=nil; check({type='has_familiar',tag='brother_bobby'},false)
    fresh(); api.CollectibleType.COLLECTIBLE_SPOON_BENDER=nil; check({type='has_collectible',tag='homing_tears'},false)
    fresh(); api.EntityFlag.FLAG_SLOW=nil; check({type='target_has_status',status='slow'},false)
    fresh(); api.LevelCurse.CURSE_OF_DARKNESS=nil; check({type='curse_active',curse='darkness'},false)
    fresh(); api.Difficulty.DIFFICULTY_NORMAL=nil; check({type='difficulty_kind',kind='normal'},false)
  `);
});

test('deferred pickup can be omitted without advertising a handler; all enabled metadata remains mandatory', async () => {
  await run(`
    catalog.condition_registry.pickup_kind=nil
    fresh()
    assert(expanded.handlers.pickup_kind==nil)
    assert(not expanded.validate({type='pickup_kind',kind='coin'},'pickup'))
    local count=0; for name in pairs(expanded.handlers) do count=count+1 end; assert(count==19)
    catalog.condition_registry.first_visit=nil
    assert(not pcall(Expanded.new,catalog,api))
  `);
});

test('all semantic enum variants use named engine constants, never numeric ranges or arbitrary IDs', async () => {
  await run(`
    for kind,names in pairs({lost={'PLAYER_THELOST','PLAYER_THELOST_B'},keeper={'PLAYER_KEEPER','PLAYER_KEEPER_B'},forgotten={'PLAYER_THEFORGOTTEN','PLAYER_THESOUL','PLAYER_THEFORGOTTEN_B','PLAYER_THESOUL_B'}}) do
      for _,name in ipairs(names) do
        fresh(); player.GetPlayerType=function() return api.PlayerType[name] end
        check({type='character_kind',kind=kind},true)
        api.PlayerType[name]=nil; check({type='character_kind',kind=kind},false)
      end
    end
    for kind,name in pairs({normal='DIFFICULTY_NORMAL',hard='DIFFICULTY_HARD',greed='DIFFICULTY_GREED',greedier='DIFFICULTY_GREEDIER'}) do
      fresh(); game.Difficulty=api.Difficulty[name]; check({type='difficulty_kind',kind=kind},true)
      game.Difficulty=999; check({type='difficulty_kind',kind=kind},false)
    end
    for curse,name in pairs({darkness='CURSE_OF_DARKNESS',labyrinth='CURSE_OF_LABYRINTH',lost='CURSE_OF_THE_LOST',unknown='CURSE_OF_THE_UNKNOWN',maze='CURSE_OF_MAZE',blind='CURSE_OF_BLIND'}) do
      fresh(); level.GetCurses=function() return api.LevelCurse[name] | 128 end
      check({type='curse_active',curse=curse},true)
      level.GetCurses=function() return 0 end; check({type='curse_active',curse=curse},false)
    end
    for status,name in pairs({slow='FLAG_SLOW',burn='FLAG_BURN',fear='FLAG_FEAR',poison='FLAG_POISON',charm='FLAG_CHARM',confusion='FLAG_CONFUSION'}) do
      fresh(); npc.HasEntityFlags=function(_,flag) return flag==api.EntityFlag[name] end
      check({type='target_has_status',status=status},true)
      npc.HasEntityFlags=function() return false end; check({type='target_has_status',status=status},false)
    end
    for tag,name in pairs({homing_tears='COLLECTIBLE_SPOON_BENDER',brimstone='COLLECTIBLE_BRIMSTONE'}) do
      fresh(); player.HasCollectible=function(_,id,modifiers,spoof) return id==api.CollectibleType[name] and modifiers==true and spoof==true end
      check({type='has_collectible',tag=tag},true)
      context.player=other; check({type='has_collectible',tag=tag},false)
    end
    for tag,name in pairs({brother_bobby='BROTHER_BOBBY',sister_maggy='SISTER_MAGGY'}) do
      fresh(); familiar.Variant=api.FamiliarVariant[name]; check({type='has_familiar',tag=tag},true)
      familiar.Player=other; check({type='has_familiar',tag=tag},false)
    end
  `);
});

test('missing and malformed API observations never become successful negative predicates', async () => {
  await run(`
    for _,missing in ipairs({false,0,'player'}) do
      fresh(); context.player=missing; check({type='first_visit'},false)
    end
    fresh(); room.IsClear=nil; check({type='room_clear_state',state='hostile'},false)
    fresh(); room.GetAliveEnemiesCount=nil; check({type='room_clear_state',state='hostile'},false)
    fresh(); room.IsClear=function() return 0 end; check({type='room_clear_state',state='hostile'},false)
    fresh(); level.GetStage=nil; check({type='stage_at_least',stage=1},false)
    for _,bad in ipairs({0/0,math.huge,-1,1.5,'1',false}) do
      fresh(); level.GetCurses=function() return bad end; check({type='curse_active',curse='darkness'},false)
    end
    fresh(); game.GetRoom=nil; check({type='first_visit'},false)
    fresh(); npc.IsBoss=nil; check({type='target_is_boss'},false)
    fresh(); npc.IsChampion=nil; check({type='target_is_champion'},false)
    fresh(); npc.HitPoints=nil; check({type='target_health_at_least',fraction=0},false)
    fresh(); api.Isaac.FindByType=function() return nil end; check({type='has_familiar',tag='brother_bobby'},false)
    fresh(); api.Isaac.FindByType=function() error('unavailable') end; check({type='has_familiar',tag='brother_bobby'},false)
  `);
});

test('reconstructing stateless handlers preserves results without mutating event or player state', async () => {
  await run('local cases=' + lua(runtimeCases.map(([condition]) => condition)) + `
    local function snapshot(object)
      local copy={}; for key,value in pairs(object) do copy[key]=value end; return copy
    end
    local function unchanged(object,copy)
      for key,value in pairs(object) do assert(copy[key]==value,key) end
      for key,value in pairs(copy) do assert(object[key]==value,key) end
    end
    for _,condition in ipairs(cases) do
      fresh()
      local playerState,eventState,npcState=snapshot(player),snapshot(context.event),snapshot(npc)
      check(condition,true)
      expanded=Expanded.new(catalog,api); check(condition,true)
      unchanged(player,playerState); unchanged(context.event,eventState); unchanged(npc,npcState)
    end
  `);
});

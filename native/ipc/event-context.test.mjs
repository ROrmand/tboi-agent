import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LuaFactory } from 'wasmoon';

const source = await readFile(new URL('../../demo/live-sprite-swap/event_context.lua', import.meta.url), 'utf8');

async function run(body) {
  const engine = await new LuaFactory().createEngine();
  try {
    await engine.doString('EntityType={ENTITY_TEAR=2,ENTITY_BOMB=4,ENTITY_LASER=7,ENTITY_KNIFE=8,ENTITY_FAMILIAR=3}; PickupVariant={PICKUP_COIN=20,PICKUP_KEY=30,PICKUP_BOMB=40,PICKUP_HEART=10,PICKUP_PILL=70,PICKUP_TAROTCARD=300,PICKUP_LIL_BATTERY=90,PICKUP_TRINKET=350,PICKUP_CHEST=50,PICKUP_GRAB_BAG=69}');
    await engine.doString('eventContext=(function()\n' + source + '\nend)()');
    return await engine.doString(body);
  } finally { engine.global.close(); }
}

test('weapon context distinguishes actual delivery and familiar tears without guessing unknown sources', async () => {
  assert.equal(await run(`
    for _,entry in ipairs({{2,"tear"},{4,"bomb"},{7,"laser"},{8,"knife"}}) do
      assert(eventContext.weapon({Type=entry[1]})==entry[2])
    end
    assert(eventContext.weapon({Type=2,SpawnerEntity={Type=3}})=="familiar_shot")
    assert(eventContext.weapon({Type=2,Parent={Type=3}})=="familiar_shot")
    assert(eventContext.weapon({Type=4,SpawnerEntity={Type=3}})=="bomb")
    assert(eventContext.weapon({Type=3})==nil)
    assert(eventContext.weapon({Type=10,SpawnerEntity={Type=2}})==nil)
    assert(eventContext.weapon(nil)==nil)
    return true
  `), true);
});

test('normalization is read-only, cycle-bounded, and fails closed when enums or facts are unavailable', async () => {
  assert.equal(await run(`
    local source={Type=2}; source.Parent=source
    assert(eventContext.weapon(source)=="tear" and source.Parent==source)
    assert(eventContext.damage(3.5)==3.5 and eventContext.damage(0)==0)
    assert(eventContext.damage(-1)==nil and eventContext.damage(0/0)==nil and eventContext.damage(math.huge)==nil)
    assert(eventContext.damage("1")==nil and eventContext.damage(nil)==nil)
    DamageFlag={DAMAGE_FAKE=2097152}
    assert(eventContext.damage(2,0)==2 and eventContext.damage(2,2097152)==nil)
    assert(eventContext.damage(2,1.5)==nil)
    DamageFlag=nil
    assert(eventContext.damage(2,0)==nil)
    EntityType=nil
    assert(eventContext.weapon(source)==nil)
    PickupVariant=nil
    assert(eventContext.pickup(20)==nil)
    return true
  `), true);
});

test('only named pickup catalog variants produce pickup context', async () => {
  assert.equal(await run(`
    for name,variant in pairs({coin=20,key=30,bomb=40,heart=10,pill=70,card=300,battery=90,trinket=350,chest=50,sack=69}) do
      assert(eventContext.pickup(variant)==name)
    end
    assert(eventContext.pickup(100)==nil and eventContext.pickup(9999)==nil and eventContext.pickup(nil)==nil)
    return true
  `), true);
});

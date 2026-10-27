import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {makeIcon,toLua,validateSchema} from './runtime.mjs';
import { prepareArtSlots } from '../native/ipc/art-slots.mjs';
import { buildPowerDesignBrief } from './power-design.mjs';
import { POWER_CONTRACT_VERSION } from '../content-contract/powers.mjs';

const emptyPowerContext={version:POWER_CONTRACT_VERSION,accepted_count:0,power_usage:{},power_history:[],recent_power_fingerprints:[]};

// All model traffic and output stay in a local test server and temporary mod.
async function runPlannedResponse({ prompt, seed, quality, source = 'Creator', mutate, reject = false, inspect }) {
 const directory=await mkdtemp(path.join(tmpdir(),'isaac-planned-schema-'));
 const profile=buildPowerDesignBrief(prompt,emptyPowerContext,{quality,source,seed}).skeleton.profile;
 const invalid=structuredClone(profile);mutate(invalid);
 const bodies=[];
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request) raw+=chunk;
  bodies.push(JSON.parse(raw));
  response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reject || bodies.length===1 ? invalid : profile)}}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const artDirectory=path.join(directory,'resources','gfx','items','collectibles');
  await mkdir(artDirectory,{recursive:true});
  await sharp({create:{width:32,height:32,channels:4,background:'white'}}).png().toFile(path.join(artDirectory,'ember_orb.png'));
  await prepareArtSlots(directory);
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,['bridge/generate.mjs','--power-context',JSON.stringify(emptyPowerContext),'--prompt',prompt,'--request-id',seed,'--generation-source',source,'--quality',String(quality),'--art-slot','0','--no-image'],{
    env:{...process.env,ISAAC_MOD_DIRECTORY:directory,NEBIUS_OUTPUT_DIRECTORY:path.join(directory,'diagnostics'),NEBIUS_BASE_URL:'http://127.0.0.1:'+server.address().port+'/v1/',NEBIUS_API_KEY:'test',NEBIUS_TEXT_MODEL:'test'},stdio:['ignore','pipe','pipe'],
   });
   let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
   child.on('close',code=>resolve({code,output}));
  });
  assert.equal(result.code,reject ? 1 : 0,result.output);
  assert.equal(bodies.length,2,result.output);
  assert.match(result.output,/@stage repair/);
  for (const body of bodies) {
   const schema=body.response_format.json_schema.schema;
   assert.equal(body.response_format.json_schema.strict,true);
   validateSchema(profile,schema);
   inspect?.(schema,body,profile);
  }
  assert.deepEqual(bodies[0].response_format,bodies[1].response_format);
  const outputFile=path.join(directory,'generated_profile_'+seed+'.json');
  if (reject) {
   assert.match(result.output,/failed validation after two attempts/);
   await assert.rejects(readFile(outputFile),{code:'ENOENT'});
  } else {
   const published=JSON.parse(await readFile(outputFile,'utf8'));
   for(const field of ['systems','stats','on_kill','familiar']) assert.deepEqual(published[field],profile[field]);
  }
 } finally {server.closeAllConnections();server.close();await rm(directory,{recursive:true,force:true});}
}

test('outgoing model schema requires the selected kill burst on initial and repair requests', async () => {
 await runPlannedResponse({prompt:'When an enemy dies, deal a small burst.',seed:'planned-schema',quality:2,
  mutate:profile=>{delete profile.on_kill;profile.systems=profile.systems.filter(system=>system!=='on_kill');},
  inspect:(schema,body)=>{
   assert.ok(schema.required.includes('on_kill'));
   assert.equal(schema.properties.on_kill.properties.actions.items.properties.type.const,'damage_burst');
   assert.equal(schema.properties.on_kill.properties.cooldown.minimum,30);
   assert.match(body.messages[1].content,/exact supporting stat\/health/);
   assert.match(body.messages[1].content,/budget of 12/);
   assert.match(body.messages[0].content,/do not choose different systems/);
  },
 });
});

test('familiar generation is refused before any model response is needed', async t => {
 for (const type of ['shield','sentry','orbit_contact','melee','normal']) {
  await t.test(type,()=>assert.throws(()=>buildPowerDesignBrief('a '+type+' familiar',emptyPowerContext,{quality:4,seed:'vault-'+type}),/temporarily vaulted/));
 }
});

test('weapon colors are mandatory on initial and repair requests', async t => {
 for (const [weapon,prompt] of [['knife','stronger knives'],['laser','stronger lasers']]) {
  await t.test(weapon,()=>runPlannedResponse({prompt,seed:'weapon-color-'+weapon,quality:3,
   mutate:profile=>{delete profile[weapon].color;},
   inspect:schema=>{
    const color=schema.properties[weapon].properties.color;
    assert.ok(schema.properties[weapon].required.includes('color'));
    assert.equal(color.properties.a.const,1);
    assert.notEqual(color.properties.r.const,color.properties.g.const);
   },
  }));
 }
});

test('invalid planned responses still fail after bounded repair without publishing or substituting mechanics', async t => {
 for(const [name,quality,prompt,mutate] of [
  ['dropped burst',2,'When an enemy dies, deal a small burst.',p=>{delete p.on_kill;}],
  ['supporting stat drift',2,'Add luck. When an enemy dies, deal a small burst.',p=>{p.stats.luck+=1;}],
  ['over budget',1,'When an enemy dies, deal a small burst.',p=>{p.on_kill.actions[0].amount=3;p.on_kill.actions[0].radius=120;}],
 ]) await t.test(name,()=>runPlannedResponse({prompt,seed:quality===1?1:'planned-schema',quality,mutate,reject:true}));
});

test('planned creep sends mandatory bounds to the model and publishes after one valid response', async () => {
 const directory=await mkdtemp(path.join(tmpdir(),'isaac-creep-schema-'));
 const artDirectory=path.join(directory,'resources','gfx','items','collectibles');
 await mkdir(artDirectory,{recursive:true});
 await sharp({create:{width:32,height:32,channels:4,background:'white'}}).png().toFile(path.join(artDirectory,'ember_orb.png'));
 await prepareArtSlots(directory);
 const prompt='A small rusty soap bar.';
 let seed,profile;
 for (let index=0;index<256;index+=1) {
  seed='creep_schema_'+index;
  profile=buildPowerDesignBrief(prompt,emptyPowerContext,{quality:2,source:'Singularity',seed}).skeleton.profile;
  if(profile.rules.some(rule=>rule.actions.some(action=>action.type==='spawn_creep'))) break;
 }
 const creep=profile.rules.flatMap(rule=>rule.actions).find(action=>action.type==='spawn_creep');
 assert.ok(creep);
 const bodies=[];
 const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request) raw+=chunk;
  bodies.push(JSON.parse(raw));
  response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(profile)}}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,['bridge/generate.mjs','--power-context',JSON.stringify(emptyPowerContext),'--prompt',prompt,'--request-id',seed,'--generation-source','Singularity','--quality','2','--art-slot','0','--no-image'],{
    env:{...process.env,ISAAC_MOD_DIRECTORY:directory,NEBIUS_OUTPUT_DIRECTORY:path.join(directory,'diagnostics'),NEBIUS_BASE_URL:'http://127.0.0.1:'+server.address().port+'/v1/',NEBIUS_API_KEY:'test',NEBIUS_TEXT_MODEL:'test'},
    stdio:['ignore','pipe','pipe'],
   });
   let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
   child.on('close',code=>resolve({code,output}));
  });
  assert.equal(result.code,0,result.output);
  assert.equal(bodies.length,1);
  assert.doesNotMatch(result.output,/@stage repair|@stage retry/);
  const ruleSchema=bodies[0].response_format.json_schema.schema.properties.rules.items;
  const schema=(ruleSchema.anyOf ?? [ruleSchema]).find(rule=>rule.properties.actions.items.properties?.type?.const==='spawn_creep').properties.actions.items;
  validateSchema(creep,schema);
  const missing={...creep};delete missing.radius;
  assert.throws(()=>validateSchema(missing,schema));
  assert.throws(()=>validateSchema({...creep,cost:3},schema));
  const published=JSON.parse(await readFile(path.join(directory,'generated_profile_'+seed+'.json'),'utf8'));
  assert.deepEqual(published.rules.flatMap(rule=>rule.actions).find(action=>action.type==='spawn_creep'),creep);
 } finally {server.closeAllConnections();server.close();await rm(directory,{recursive:true,force:true});}
});

test('JSON retry, transparent icon, and image failure preserving the published profile', async () => {
 const directory=await mkdtemp(path.join(tmpdir(),'isaac-test-'));
 await mkdir(path.join(directory, 'resources', 'gfx', 'items', 'collectibles'), { recursive: true });
 await sharp({create:{width:32,height:32,channels:4,background:'transparent'}}).png().toFile(path.join(directory, 'resources', 'gfx', 'items', 'collectibles', 'ember_orb.png'));
 await prepareArtSlots(directory);
 const source=await sharp({create:{width:64,height:64,channels:4,background:'white'}}).composite([{input:await sharp({create:{width:24,height:24,channels:4,background:'red'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const icon=await makeIcon(source);
 const pixels=await sharp(icon).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(pixels.info.width,32); assert.equal(pixels.data[3],0);
 const profile=buildPowerDesignBrief('red core with stronger knives',emptyPowerContext,{quality:3,seed:'test'}).skeleton.profile;
 const firstAttempt={...profile,stats:{...profile.stats,damage:99},metadata:{...profile.metadata,description:'x'.repeat(62)+'你'}};
 let attempts=0, imageFails=false;
 const server=createServer(async(req,res)=>{
   for await(const chunk of req) {};
   res.setHeader('Content-Type','application/json');
   if(req.url.endsWith('chat/completions')) res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(++attempts===1?firstAttempt:profile)}}]}));
   else if(imageFails){res.statusCode=500;res.end('image failure');}
   else res.end(JSON.stringify({data:[{b64_json:source.toString('base64')}]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const run=(slot='0')=>new Promise(resolve=>{
   const child=spawn(process.execPath,['bridge/generate.mjs','--power-context',JSON.stringify(emptyPowerContext),'--prompt','red core with stronger knives','--request-id','test','--art-slot',slot],{env:{...process.env,IMAGE_BACKEND:'nebius',ISAAC_MOD_DIRECTORY:directory,NEBIUS_OUTPUT_DIRECTORY:path.join(directory,'diagnostics'),NEBIUS_BASE_URL:`http://127.0.0.1:${server.address().port}/v1/`,NEBIUS_API_KEY:'test',NEBIUS_TEXT_MODEL:'test',NEBIUS_IMAGE_MODEL:'test'},stdio:['ignore','pipe','pipe']});
   let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('close',code=>resolve({code,output}));
 });
 try {
   const first=await run();assert.equal(first.code,0,first.output);assert.equal(attempts,2);assert.match(first.output,/@stage repair/);
   const published=await readFile(path.join(directory,'generated_profile.lua'),'utf8');assert.match(published,/generated_slot_[0-9]{2}\.png/);
   assert.equal(await readFile(path.join(directory,'generated_profile_test.lua'),'utf8'),published);
   assert.equal(await readFile(path.join(directory,'generated_profile_test_slot_1.lua'),'utf8'),published);
   assert.equal(await readFile(path.join(directory,'generated_profile_test_slot_400.lua'),'utf8'),published);
   const publishedJson=JSON.parse(await readFile(path.join(directory,'generated_profile_test.json'),'utf8'));
   assert.equal(publishedJson.bridge_request_id,'test');
   assert.equal(publishedJson.sprite_sheet,'gfx/items/collectibles/generated_slot_00.png');
   assert.equal(publishedJson.familiar,undefined);
   assert.equal(publishedJson.familiar_sprite_sheet,undefined);
   assert.ok(publishedJson.knife.color.r!==publishedJson.knife.color.g);
   const next=await run('1');assert.equal(next.code,0,next.output);
   const nextPublished=await readFile(path.join(directory,'generated_profile.lua'),'utf8');
   assert.match(nextPublished,/generated_slot_01\.png/);
   imageFails=true;const failed=await run('2');assert.equal(failed.code,1);assert.equal(await readFile(path.join(directory,'generated_profile.lua'),'utf8'),nextPublished);
 } finally {server.close();server.closeAllConnections();await rm(directory,{recursive:true,force:true});}
});

test('Lua serialization escapes control characters without injecting code',()=>{
 assert.equal(toLua('a\n"\\'), '"a\\010\\034\\092"');
});

test('empty reasoning-only item response retries and accepts a valid second profile', async () => {
 const directory=await mkdtemp(path.join(tmpdir(),'isaac-empty-profile-'));
 const artDirectory=path.join(directory,'resources','gfx','items','collectibles');
 await mkdir(artDirectory,{recursive:true});
 await sharp({create:{width:32,height:32,channels:4,background:'white'}})
  .png().toFile(path.join(artDirectory,'ember_orb.png'));
 await prepareArtSlots(directory);
 const profile=buildPowerDesignBrief('one luck stat',emptyPowerContext,{quality:3,seed:'retry'}).skeleton.profile;
 let attempts=0, bodies=[];
 const server=createServer(async(req,res)=>{
  let raw='';
  for await(const chunk of req) raw+=chunk;
  if(req.url.endsWith('chat/completions')) bodies.push(JSON.parse(raw));
  res.setHeader('Content-Type','application/json');
  attempts++;
  res.end(JSON.stringify(attempts===1
   ? {choices:[{finish_reason:'length',message:{content:null,reasoning_content:'I am still thinking'}}]}
   : {choices:[{finish_reason:'stop',message:{content:JSON.stringify(profile)}}]}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,['bridge/generate.mjs','--power-context',JSON.stringify(emptyPowerContext),'--prompt','one luck stat','--request-id','retry','--art-slot','0','--no-image'],{
    env:{...process.env,ISAAC_MOD_DIRECTORY:directory,NEBIUS_OUTPUT_DIRECTORY:path.join(directory,'diagnostics'),
     NEBIUS_BASE_URL:`http://127.0.0.1:${server.address().port}/v1/`,NEBIUS_API_KEY:'test',NEBIUS_TEXT_MODEL:'test'},
    stdio:['ignore','pipe','pipe'],
   });
   let output=''; child.stdout.on('data',chunk=>output+=chunk);
   child.stderr.on('data',chunk=>output+=chunk);
   child.on('close',code=>resolve({code,output}));
  });
  assert.equal(result.code,0,result.output);
  assert.equal(attempts,2);
  assert.match(result.output,/@stage repair/);
  assert.ok(bodies.length >= 1);
  assert.deepEqual(bodies[0].chat_template_kwargs,{enable_thinking:false});
  const diagnostic=JSON.parse(await readFile(path.join(directory,'diagnostics','last-text-diagnostic.json'),'utf8'));
  assert.equal(diagnostic.finish_reason,'stop');
 } finally {server.close();server.closeAllConnections();await rm(directory,{recursive:true,force:true});}
});

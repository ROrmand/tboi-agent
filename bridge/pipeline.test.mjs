import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {makeIcon,toLua} from './runtime.mjs';
import { prepareArtSlots } from '../native/ipc/art-slots.mjs';

test('JSON retry, transparent icon, and image failure preserving the published profile', async () => {
 const directory=await mkdtemp(path.join(tmpdir(),'isaac-test-'));
 await mkdir(path.join(directory, 'resources', 'gfx', 'items', 'collectibles'), { recursive: true });
 await sharp({create:{width:32,height:32,channels:4,background:'transparent'}}).png().toFile(path.join(directory, 'resources', 'gfx', 'items', 'collectibles', 'ember_orb.png'));
 await prepareArtSlots(directory);
 const source=await sharp({create:{width:64,height:64,channels:4,background:'white'}}).composite([{input:await sharp({create:{width:24,height:24,channels:4,background:'red'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const icon=await makeIcon(source);
 const pixels=await sharp(icon).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(pixels.info.width,32); assert.equal(pixels.data[3],0);
 const profile={metadata:{display_name:'Red Core',description:'Damage up',quality:2,theme:'cursed',balance_note:''},stats:{damage:1,tears:0,shot_speed:0,range:0,speed:0,luck:0,soul_hearts:0},tear_profile:{flags:[],color:{r:1,g:0,b:0,a:1},scale:1},visuals:{pedestal_prompt:'red core'},rules:[]};
 let attempts=0, imageFails=false;
 const server=createServer(async(req,res)=>{
   for await(const chunk of req) {};
   res.setHeader('Content-Type','application/json');
   if(req.url.endsWith('chat/completions')) res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:++attempts===1?' {"speed":0\n5}':JSON.stringify(profile)}}]}));
   else if(imageFails){res.statusCode=500;res.end('image failure');}
   else res.end(JSON.stringify({data:[{b64_json:source.toString('base64')}]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const run=(slot='0')=>new Promise(resolve=>{
   const child=spawn(process.execPath,['bridge/generate.mjs','--prompt','red core','--request-id','test','--art-slot',slot],{env:{...process.env,IMAGE_BACKEND:'nebius',ISAAC_MOD_DIRECTORY:directory,NEBIUS_OUTPUT_DIRECTORY:path.join(directory,'diagnostics'),NEBIUS_BASE_URL:`http://127.0.0.1:${server.address().port}/v1/`,NEBIUS_API_KEY:'test',NEBIUS_TEXT_MODEL:'test',NEBIUS_IMAGE_MODEL:'test'},stdio:['ignore','pipe','pipe']});
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
   const next=await run('1');assert.equal(next.code,0,next.output);
   const nextPublished=await readFile(path.join(directory,'generated_profile.lua'),'utf8');
   assert.match(nextPublished,/generated_slot_01\.png/);
   imageFails=true;const failed=await run('2');assert.equal(failed.code,1);assert.equal(await readFile(path.join(directory,'generated_profile.lua'),'utf8'),nextPublished);
 } finally {server.close();server.closeAllConnections();}
});

test('Lua serialization escapes control characters without injecting code',()=>{
 assert.equal(toLua('a\n"\\'), '"a\\010\\034\\092"');
});

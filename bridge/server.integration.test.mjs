import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, appendFile, rm, mkdir, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { JobStore } from './job-store.mjs';
import { RUNTIME_CONTRACT } from './compatibility.mjs';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { prepareArtSlots } from '../native/ipc/art-slots.mjs';

async function until(check, detail) {
  const deadline=Date.now()+8000;
  while(Date.now()<deadline) { const value=await check(); if(value) return value; await new Promise(resolve=>setTimeout(resolve,30)); }
  throw Error('Timed out: '+detail);
}
async function pipeRequest(pipe, message) {
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(pipe); let output='';
    socket.setEncoding('utf8'); socket.once('error',reject);
    socket.on('connect',()=>socket.end(JSON.stringify(message)+'\n'));
    socket.on('data',chunk=>output+=chunk); socket.on('end',()=>resolve(JSON.parse(output)));
  });
}
async function fixture(t, seed=[], overrides={}) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'nebius-integration-'));
  const mod=path.join(directory,'mod'),output=path.join(directory,'output'),log=path.join(directory,'isaac.log');
  await writeFile(log,'');
  if(overrides.IMAGE_BACKEND==='nebius') {
    await mkdir(path.join(mod,'resources','gfx','items','collectibles'),{recursive:true});
    await copyFile(new URL('../demo/live-sprite-swap/resources/gfx/items/collectibles/ember_orb.png',import.meta.url),path.join(mod,'resources','gfx','items','collectibles','ember_orb.png'));
    await prepareArtSlots(mod);
  }
  const journal=new JobStore(path.join(output,'job-journal.json'));
  for(const entry of seed) journal.put(entry,entry.envelope);
  const portServer=net.createServer(); await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
  const port=portServer.address().port; await new Promise(resolve=>portServer.close(resolve));
  const pipe=process.platform==='win32' ? '\\\\.\\pipe\\nebius_integration_'+port : path.join(directory,'ipc.sock');
  const child=spawn(process.execPath,['bridge/server.mjs'],{cwd:new URL('..',import.meta.url),windowsHide:true,env:{...process.env,
    NEBIUS_BRIDGE_PORT:String(port),NEBIUS_PIPE_NAME:pipe,NEBIUS_OUTPUT_DIRECTORY:output,ISAAC_MOD_DIRECTORY:mod,ISAAC_LOG_FILE:log,
    IMAGE_BACKEND:'comfyui',COMFYUI_URL:'http://127.0.0.1:1',NEBIUS_API_KEY:'unused-test-key',...overrides}});
  let logs=''; child.stdout.on('data',chunk=>logs+=chunk); child.stderr.on('data',chunk=>logs+=chunk);
  t.after(async()=>{ if(child.exitCode===null) { child.kill(); await once(child,'exit'); }
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(directory).startsWith('nebius-integration-'));
    await rm(directory,{recursive:true,force:true}); });
  await until(()=>logs.includes('Native IPC pipe ready') || (child.exitCode!==null && Promise.reject(Error(logs))),'bridge startup');
  const context={session:'test_session',run:'test_run',used:[],run_used:[],count:0,runtime_contract:RUNTIME_CONTRACT,save_slot:1,fresh_run:false,ended_run:false};
  const state=async changes=>appendFile(log,'[NebiusBridge] state '+JSON.stringify({...context,...changes})+'\n');
  const poll=async()=>{ for(let i=0;i<32;i++){ const value=await pipeRequest(pipe,{version:1,type:'poll'}); if(value?.status!=='capacity') return value; } throw Error('capacity notification flood'); };
  const get=async id=>{ const response=await fetch('http://127.0.0.1:'+port+'/jobs/'+id); return response.ok ? response.json():null; };
  const generate=async input=>fetch('http://127.0.0.1:'+port+'/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  return {directory,mod,output,log,pipe,state,poll,get,generate};
}

test('bridge preflight failure reserves no art and persists an actionable failed job',async t=>{
  const f=await fixture(t);
  await f.state();
  await appendFile(f.log,'[NebiusBridge] generate '+JSON.stringify({id:'test_run_first',prompt:'A glass eye',quality:3})+'\n');
  const failed=await until(async()=>{const job=await f.get('test_run_first');return job?.state==='failed'&&job;},'preflight failure');
  assert.match(failed.error,/ComfyUI/);assert.equal(failed.errorCode,'ART_SERVICE_UNAVAILABLE');assert.equal(failed.artSlot,undefined);
  const ledger=JSON.parse(await readFile(path.join(f.mod,'art-reservations.json'),'utf8'));
  assert.deepEqual(ledger.manifests['1'].used,[]);
  const stored=JSON.parse(await readFile(path.join(f.output,'job-journal.json'),'utf8'));
  assert.equal(stored.jobs[0].state,'failed');
});

test('bridge restores queued delivery only to its run, persists ACK, and rejects an ended run',async t=>{
  const envelope={version:1,type:'profile',id:'test_run_queued',profile:{version:1,bridge_request_id:'test_run_queued'},delivery:{mode:'blank',owner:'11'}};
  const other={version:1,type:'profile',id:'other_run_queued',profile:{version:1,bridge_request_id:'other_run_queued'}};
  const f=await fixture(t,[{id:envelope.id,run:'test_run',saveSlot:1,state:'queued',status:'queued',delivery:envelope.delivery,envelope},
    {id:other.id,run:'other_run',saveSlot:2,state:'queued',status:'queued',envelope:other}]);
  assert.equal((await f.poll()).type,'hello'); assert.equal(await f.poll(),null);
  await f.state({run:'third_run',save_slot:3});
  await new Promise(resolve=>setTimeout(resolve,350)); assert.equal(await f.poll(),null);
  await f.state();
  const received=await until(async()=>{const message=await f.poll();return message?.type==='profile'&&message;},'recovered profile');
  assert.deepEqual(received,envelope);
  await pipeRequest(f.pipe,{version:1,type:'ack',id:envelope.id});
  assert.equal((await f.get(envelope.id)).state,'applied');
  const stored=JSON.parse(await readFile(path.join(f.output,'job-journal.json'),'utf8'));
  assert.equal(stored.jobs.find(job=>job.id===envelope.id).state,'applied');
  await f.state({run:'other_run',save_slot:2,ended_run:true});
  await until(async()=> (await f.get(other.id))?.errorCode==='STALE_RUN','ended run rejection');
  assert.equal(await f.poll(),null);
});

test('interrupted jobs recover as errors without issuing another model or art request',async t=>{
  const f=await fixture(t,[{id:'test_run_interrupted',run:'test_run',saveSlot:1,state:'designing',status:'generating'}]);
  assert.equal((await f.get('test_run_interrupted')).errorCode,'INTERRUPTED');
  await f.poll(); await f.state({pending:['test_run_interrupted']});
  const message=await until(async()=>{const value=await f.poll();return value?.type==='status'&&value;},'recovery error');
  assert.equal(message.status,'error');assert.match(message.detail,/interrupted/);
  assert.equal((await f.get('test_run_interrupted')).state,'failed');
});


test('bridge generates an active through local fake services and queues trusted blank delivery before ACK',async t=>{
  const design={region:'passive',systems:['active'],affects_stats:false,metadata:{display_name:'Glass Pulse',description:'Radial damage burst',quality:3,theme:'tech',balance_note:''},visuals:{pedestal_prompt:'glass pulse core',sound:'click',animation:'pulse'},rules:[],active:{effect:'radial_burst',charges:6,targeting:'self',damage:4,radius:100}};
  const image=await sharp({create:{width:64,height:64,channels:4,background:'white'}}).composite([{input:await sharp({create:{width:24,height:24,channels:4,background:'red'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
  let textCalls=0,imageCalls=0;
  const service=createServer(async(request,response)=>{
    for await(const chunk of request) {};
    response.setHeader('Content-Type','application/json');
    if(request.url.endsWith('chat/completions')) {textCalls++;response.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(design)}}]}));}
    else {imageCalls++;response.end(JSON.stringify({data:[{b64_json:image.toString('base64')}]}));}
  });
  await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));
  t.after(()=>{service.closeAllConnections();service.close();});
  const f=await fixture(t,[],{IMAGE_BACKEND:'nebius',NEBIUS_BASE_URL:'http://127.0.0.1:'+service.address().port+'/v1/',NEBIUS_TEXT_MODEL:'test-model',NEBIUS_IMAGE_MODEL:'test-image'});
  await f.state({active_count:0,active_available:true,pending:['test_run_generated']});
  await appendFile(f.log,'[NebiusBridge] generate '+JSON.stringify({id:'test_run_generated',prompt:'A glass damage burst',quality:3,item_type:'active',delivery:{mode:'blank',owner:'22'}})+'\n');
  const job=await until(async()=>{const value=await f.get('test_run_generated');if(value?.state==='failed') throw Error(JSON.stringify(value));return value?.state==='queued'&&value;},'generated profile queue');
  assert.equal(job.itemType,'active');assert.equal(textCalls,1);assert.equal(imageCalls,1);
  const envelope=await until(async()=>{const value=await f.poll();return value?.type==='profile'&&value;},'generated delivery');
  assert.deepEqual(envelope.profile.active,design.active);assert.deepEqual(envelope.delivery,{mode:'blank',owner:'22'});
  assert.equal(envelope.profile.sprite_sheet,'gfx/items/collectibles/generated_slot_00.png');
  const journal=new JobStore(path.join(f.output,'job-journal.json'));
  assert.deepEqual(journal.recover()[0].envelope,envelope);
  await pipeRequest(f.pipe,{version:1,type:'ack',id:envelope.id});
  assert.equal((await f.get(envelope.id)).state,'applied');assert.equal(textCalls,1);assert.equal(imageCalls,1);
});

test('queued cancellation is durable and drops the IPC retry without another generation',async t=>{
  const envelope={version:1,type:'profile',id:'test_run_cancel',profile:{bridge_request_id:'test_run_cancel'},delivery:{mode:'blank',owner:'11'}};
  const f=await fixture(t,[{id:envelope.id,run:'test_run',saveSlot:1,state:'queued',status:'queued',envelope}]);
  await f.state();await new Promise(resolve=>setTimeout(resolve,350));
  await appendFile(f.log,'[NebiusBridge] cancel '+JSON.stringify({id:envelope.id})+'\n');
  await until(async()=> (await f.get(envelope.id))?.errorCode==='CANCELLED','durable cancellation');
  await until(async()=> (await f.poll())?.status==='error','cancellation status');
  assert.equal(await f.poll(),null);
  assert.equal(new JobStore(path.join(f.output,'job-journal.json')).recover()[0].state,'failed');
});

test('HTTP generation returns and journals a run-scoped request identity', async t => {
  const f = await fixture(t);
  await f.state();
  await until(async () => (await pipeRequest(f.pipe, { version: 1, type: 'poll' }))?.status === 'capacity', 'initial context');
  const response = await f.generate({ prompt: 'An HTTP glass eye', quality: 2 });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  assert.match(accepted.id, /^test_run_[a-f0-9-]{36}$/);
  assert.equal(accepted.run, 'test_run');
  const failed = await until(async () => {
    const job = await f.get(accepted.id);
    return job?.state === 'failed' && job;
  }, 'HTTP preflight result');
  assert.equal(failed.errorCode, 'ART_SERVICE_UNAVAILABLE');
  const record = new JobStore(path.join(f.output, 'job-journal.json')).records.get(accepted.id);
  assert.equal(record.prompt, 'An HTTP glass eye');
  assert.equal(record.saveSlot, 1);
});

test('HTTP request IDs remain valid for the maximum runtime run-token length', async t => {
  const f = await fixture(t);
  const run = 'r'.repeat(80);
  await f.state({ run });
  await until(async () => (await pipeRequest(f.pipe, { version: 1, type: 'poll' }))?.status === 'capacity', 'long run context');
  const response = await f.generate({ prompt: 'An eye in a long-lived run' });
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.equal(job.id.length, 100);
  assert.ok(job.id.startsWith(run + '_'));
  assert.equal(new JobStore(path.join(f.output, 'job-journal.json')).records.get(job.id).run, run);
});

test('queued delivery rejects unsolicited ACK and waits for its save slot and unblocked context', async t => {
  const envelope = { version: 1, type: 'profile', id: 'test_run_isolated', profile: { bridge_request_id: 'test_run_isolated' } };
  const f = await fixture(t, [{ id: envelope.id, run: 'test_run', saveSlot: 1, state: 'queued', envelope }]);
  await pipeRequest(f.pipe, { version: 1, type: 'ack', id: envelope.id });
  assert.equal((await f.get(envelope.id)).state, 'queued');
  await f.state({ save_slot: 2 });
  await new Promise(resolve => setTimeout(resolve, 350));
  await f.poll();
  assert.equal(await f.poll(), null);
  await f.state({ blocked: 'Artwork manifest needs recovery.' });
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(await f.poll(), null);
  await f.state();
  await until(async () => (await f.poll())?.id === envelope.id, 'eligible profile');
  assert.equal((await pipeRequest(f.pipe, { version: 1, type: 'ack', id: envelope.id })).ok, true);
  assert.equal((await f.get(envelope.id)).state, 'applied');
});

test('capacity-full runs can replay a lost application ACK without treating publication as applied', async t => {
  const envelope = { version: 1, type: 'profile', id: 'test_run_last', profile: { bridge_request_id: 'test_run_last' } };
  const f = await fixture(t, [{ id: envelope.id, run: 'test_run', saveSlot: 1, state: 'queued', envelope }]);
  await f.state({ count: 64, blocked: 'Item limit reached: 64/64. Finish this run to free item slots.' });
  await until(async () => (await f.poll())?.id === envelope.id, 'full-run receipt replay');
  assert.equal((await f.get(envelope.id)).state, 'queued');
  assert.equal((await pipeRequest(f.pipe, { version: 1, type: 'ack', id: envelope.id })).ok, true);
  assert.equal((await f.get(envelope.id)).state, 'applied');
});

test('cancellation during delayed preflight cannot reserve art or restart generation', async t => {
  let healthResponse;
  let calls = 0;
  const service = createServer((request, response) => { calls++; healthResponse = response; });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => { service.closeAllConnections(); service.close(); });
  const f = await fixture(t, [], { COMFYUI_URL: 'http://127.0.0.1:' + service.address().port });
  await f.state();
  await appendFile(f.log, '[NebiusBridge] generate ' + JSON.stringify({ id: 'test_run_cancel_preflight', prompt: 'A delayed eye' }) + '\n');
  await until(() => healthResponse, 'delayed health request');
  await appendFile(f.log, '[NebiusBridge] cancel ' + JSON.stringify({ id: 'test_run_cancel_preflight' }) + '\n');
  await until(async () => (await f.get('test_run_cancel_preflight'))?.errorCode === 'CANCELLED', 'preflight cancellation');
  healthResponse.end('{}');
  await new Promise(resolve => setTimeout(resolve, 450));
  const job = await f.get('test_run_cancel_preflight');
  assert.equal(job.state, 'failed');
  assert.equal(job.errorCode, 'CANCELLED');
  assert.equal(job.artSlot, undefined);
  assert.equal(calls, 1);
  const ledger = JSON.parse(await readFile(path.join(f.mod, 'art-reservations.json'), 'utf8'));
  assert.deepEqual(ledger.manifests['1'].used, []);
});

test('late generation requests are rejected rather than renamed into the current run', async t => {
  const f = await fixture(t);
  await f.state();
  await appendFile(f.log, '[NebiusBridge] generate ' + JSON.stringify({ id: 'old_run_request', prompt: 'An old eye' }) + '\n');
  const rejection = await until(async () => {
    const message = await f.poll();
    return message?.id === 'old_run_request' && message;
  }, 'stale request rejection');
  assert.equal(rejection.error_code, 'STALE_RUN');
  assert.equal(await f.get('test_run_old_run_request'), null);
  assert.equal(new JobStore(path.join(f.output, 'job-journal.json')).records.size, 0);
});

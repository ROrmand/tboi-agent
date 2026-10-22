import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SlotLedger} from './slot-ledger.mjs';

test('separate saves retain art across processes and release only a confirmed ended run', async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'isaac-save-slots-'));
  const file=path.join(directory,'ledger.json');
  const saveA={session:'process1',run:'runA',used:[],run_used:[],count:0,save_slot:1,fresh_run:true};
  const saveB={...saveA,run:'runB',save_slot:2};
  try {
    assert.equal(new SlotLedger(file).reserve(saveA),0);
    assert.equal(new SlotLedger(file).reserve(saveB),1);
    assert.equal(new SlotLedger(file).reserve({...saveB,session:'process2',fresh_run:false,used:[1],run_used:[1],count:1}),2);
    const ledger=new SlotLedger(file);
    assert.throws(()=>ledger.reserve({...saveA,run:'unknown',fresh_run:false}),/identity does not match/);
    assert.throws(()=>ledger.reserve({...saveA,used:[1],run_used:[1]}),/conflicting save slots/);
    ledger.observe({...saveA,session:'process2',fresh_run:false,used:[0,1,2],run_used:[0],ended_run:true});
    assert.equal(new SlotLedger(file).reserve({...saveB,session:'process3',fresh_run:false,used:[1],run_used:[1]}),0);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('malformed and conflicting durable manifests fail closed without rewriting the ledger', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'isaac-invalid-manifest-'));
  const file = path.join(directory, 'ledger.json');
  try {
    for (const manifests of [42, 'bad', { 1: { run: 'runA', used: [0] }, 2: { run: 'runB', used: [0] } }]) {
      const contents = JSON.stringify({ version: 2, session: 'process', used: [], legacy: [], manifests });
      await writeFile(file, contents);
      assert.throws(() => new SlotLedger(file), /Invalid artwork manifest/);
      assert.equal(await readFile(file, 'utf8'), contents);
    }
    for (const session of [42, {}, undefined, '']) {
      const contents = JSON.stringify({ version: 2, session, used: [0], legacy: [], manifests: {} });
      await writeFile(file, contents);
      assert.throws(() => new SlotLedger(file), /Invalid artwork reservation ledger/);
      assert.equal(await readFile(file, 'utf8'), contents);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('observation validates process and run manifests before releasing protected art', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'isaac-observe-manifest-'));
  const file = path.join(directory, 'ledger.json');
  const context = { session: 'process', run: 'runA', used: [], run_used: [], count: 0, save_slot: 1, fresh_run: true };
  try {
    assert.throws(() => new SlotLedger(file).observe({ ...context, run_used: [0] }), /missing for this continued run/);
    const ledger = new SlotLedger(file);
    ledger.reserve(context);
    const before = await readFile(file, 'utf8');
    for (const invalid of [{ used: 'invalid' }, { used: null }, { used: { slot: 0 } }, { count: -1 }, { count: 65 }]) {
      assert.throws(() => ledger.observe({ ...context, ended_run: true, ...invalid }), /Invalid .*manifest/);
      assert.equal(await readFile(file, 'utf8'), before);
    }
    ledger.observe({ ...context, used: {}, run_used: {} });
    assert.deepEqual(ledger.data.manifests['1'].used, [0]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('64 artwork reservations survive bridge restart and never wrap', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'isaac-slots-'));
  const file=path.join(dir,'ledger.json');
  try {
    const context={session:'process1',run:'run1',used:[],count:0};
    for(let i=0;i<64;i++) assert.equal(new SlotLedger(file).reserve(context),i);
    assert.throws(()=>new SlotLedger(file).reserve(context),/Artwork limit reached: 64\/64/);
    assert.throws(()=>new SlotLedger(file).reserve({...context,count:64}),/Item limit reached: 64\/64/);
    assert.throws(()=>new SlotLedger(file).reserve({...context,used:[64]}),/updated mod/);
    // A new Isaac process may reclaim unused art, but pins continued-run slots.
    assert.equal(new SlotLedger(file).reserve({...context,session:'process2',used:[0,1,3],count:3}),2);
    assert.equal(new SlotLedger(file).reserve({...context,session:'process2',run:'run2'}),4);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('corrupt ledger blocks writes instead of resetting reservations', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'isaac-slots-'));
  try {
    const file=path.join(dir,'ledger.json');
    await writeFile(file,'{"version":1,"used":[99]}');
    assert.throws(()=>new SlotLedger(file),/Invalid artwork/);
  } finally {await rm(dir,{recursive:true,force:true});}
});


test('missing initialized ledger and untracked continued artwork fail closed',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'isaac-lost-ledger-'));
  const file=path.join(directory,'ledger.json');
  try {
    const context={session:'process1',run:'runA',used:[],run_used:[],count:0,save_slot:1,fresh_run:true};
    assert.throws(()=>new SlotLedger(file).observe({...context,fresh_run:false,count:1,used:[0],run_used:[0]}),/missing for this continued run/);
    new SlotLedger(file).reserve(context);await rm(file);
    assert.throws(()=>new SlotLedger(file),/ledger is missing.*Restore/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

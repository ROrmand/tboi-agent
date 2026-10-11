import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SlotLedger} from './slot-ledger.mjs';

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

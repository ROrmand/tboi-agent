import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JobStore } from './job-store.mjs';
import { generationErrorCode } from './errors.mjs';

test('queued profiles survive restart while ambiguous generation is never replayed', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'isaac-journal-'));
  const file=path.join(directory,'jobs.json');
  try {
    const store=new JobStore(file);
    const job={id:'run_one',run:'run',state:'queued',status:'queued'};
    const envelope={version:1,type:'profile',id:job.id,profile:{bridge_request_id:job.id}};
    store.put(job,envelope);
    store.put({id:'run_two',run:'run',state:'rendering',status:'generating'});
    const restored=new JobStore(file);
    const jobs=restored.recover();
    assert.deepEqual(jobs[0].envelope,envelope);
    assert.equal(jobs[1].state,'failed');
    assert.equal(jobs[1].errorCode,'INTERRUPTED');
    restored.put({...jobs[0],state:'applied',status:'applied'});
    const receipt=new JobStore(file).recover()[0];
    assert.equal(receipt.state,'applied');
    assert.equal(receipt.envelope,undefined);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('recovery retains the prompt and reservation without aliasing caller delivery data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'isaac-journal-prompt-'));
  const file = path.join(directory, 'jobs.json');
  try {
    const store = new JobStore(file);
    const job = { id: 'run_prompt', run: 'run', state: 'rendering', prompt: 'A glass eye', artSlot: 7, delivery: { mode: 'blank', owner: '12' } };
    store.put(job);
    job.delivery.owner = '99';
    assert.equal(store.records.get(job.id).delivery.owner, '12');
    const recovered = new JobStore(file).recover()[0];
    assert.equal(recovered.prompt, 'A glass eye');
    assert.equal(recovered.artSlot, 7);
    assert.equal(recovered.state, 'failed');
    assert.throws(() => store.put({ ...job, artSlot: 64 }), /reservation/);
    assert.throws(() => store.put({ ...job, prompt: ' ' }), /prompt/);
    assert.equal(generationErrorCode('Artwork reservation ledger is missing. Restore from backup.'), 'PERSISTENCE_FAILED');
    assert.equal(generationErrorCode('Invalid artwork manifest.'), 'PERSISTENCE_FAILED');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid journal identities and corrupt durable state cannot be silently reset', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'isaac-journal-'));
  const file=path.join(directory,'jobs.json');
  try {
    const store=new JobStore(file);
    assert.throws(()=>store.put({id:'other_one',run:'run',state:'preflight'}),/mismatch/);
    assert.throws(()=>store.put({id:'run_one',run:'run',state:'queued'}),/no profile/);
    await writeFile(file,'{"version":1,"jobs":[{"id":"run_one","run":"run","state":"unknown"}]}');
    assert.throws(()=>new JobStore(file),/Invalid job/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

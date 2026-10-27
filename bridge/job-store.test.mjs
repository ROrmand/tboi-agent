import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JobStore, replaceWithRetry } from './job-store.mjs';
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
    assert.throws(() => store.put({ ...job, artSlot: 128 }), /reservation/);
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

test('transient Windows journal locks retry without abandoning the prior journal', () => {
  const calls = [];
  let attempts = 0;
  replaceWithRetry((source, target) => {
    calls.push([source, target]);
    attempts += 1;
    if (attempts < 3) { const error = Error('locked'); error.code = 'EPERM'; throw error; }
  }, 'jobs.tmp', 'jobs.json', { delay: milliseconds => calls.push(['delay', milliseconds]) });
  assert.deepEqual(calls, [['jobs.tmp', 'jobs.json'], ['delay', 10], ['jobs.tmp', 'jobs.json'], ['delay', 20], ['jobs.tmp', 'jobs.json']]);
  assert.throws(() => replaceWithRetry(() => { const error = Error('disk'); error.code = 'ENOSPC'; throw error; }, 'jobs.tmp', 'jobs.json'), /disk/);
});

test('journal replacement retries preserve durable and in-memory state until success', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'isaac-journal-lock-'));
  const file = path.join(directory, 'jobs.json');
  try {
    const original = { id: 'run_lock', run: 'run', state: 'preflight' };
    new JobStore(file).put(original);
    const before = await readFile(file, 'utf8');
    let attempts = 0;
    let blocked = true;
    const store = new JobStore(file, {
      rename: (source, target) => {
        attempts += 1;
        if (blocked || attempts < 3) throw Object.assign(Error('locked'), { code: 'EPERM' });
        renameSync(source, target);
      },
      delay: () => {},
    });
    assert.throws(() => store.put({ ...original, state: 'designing' }), /locked/);
    assert.equal(attempts, 12);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(store.records.get(original.id).state, 'preflight');
    blocked = false;
    attempts = 0;
    store.put({ ...original, state: 'designing' });
    assert.equal(attempts, 3);
    assert.equal(new JobStore(file).records.get(original.id).state, 'designing');
    assert.equal(store.records.get(original.id).state, 'designing');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

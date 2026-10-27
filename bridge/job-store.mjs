import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { encodeEnvelope } from '../native/ipc/protocol.mjs';

const states = new Set(['received', 'preflight', 'reserved', 'designing', 'rendering', 'validating', 'queued', 'applied', 'failed']);
const identity = /^[A-Za-z0-9_-]{1,100}$/;

export function replaceWithRetry(rename, source, target, { attempts = 12, delay = () => {} } = {}) {
  let failure;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { rename(source, target); return; }
    catch (error) {
      failure = error;
      if (!['EACCES', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === attempts - 1) throw error;
      delay(10 * (attempt + 1));
    }
  }
  throw failure;
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export class JobStore {
  constructor(file, { rename = renameSync, delay = wait } = {}) {
    this.file = file;
    this.rename = rename;
    this.delay = delay;
    this.records = new Map();
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.jobs) || saved.jobs.length > 256) throw Error('Invalid job journal.');
      for (const job of saved.jobs) {
        this.validate(job);
        if (this.records.has(job.id)) throw Error('Duplicate job journal identity.');
        this.records.set(job.id, job);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  validate(job) {
    if (!job || typeof job.id !== 'string' || !identity.test(job.id) || typeof job.run !== 'string' || !identity.test(job.run) || !states.has(job.state)) throw Error('Invalid job journal entry.');
    if (!job.id.startsWith(job.run + '_')) throw Error('Job journal run mismatch.');
    if (job.itemType!==undefined && !["passive","active"].includes(job.itemType)) throw Error("Invalid job item type.");
    if (job.saveSlot!==undefined && ![1,2,3].includes(job.saveSlot)) throw Error("Invalid job save slot.");
    if (job.prompt !== undefined && (typeof job.prompt !== 'string' || !job.prompt.trim() || job.prompt.length > 2000)) throw Error('Invalid job prompt.');
    if (job.artSlot !== undefined && (!Number.isInteger(job.artSlot) || job.artSlot < 0 || job.artSlot >= 128)) throw Error('Invalid job artwork reservation.');
    if (job.auto !== undefined && job.auto !== true) throw Error("Invalid auto job.");
    if (job.auto && job.prompt !== undefined) throw Error("Auto jobs do not store a player prompt.");
    if (job.delivery!==undefined) encodeEnvelope({version:1,type:"profile",id:job.id,profile:{},delivery:job.delivery});
    if (job.envelope !== undefined) {
      encodeEnvelope(job.envelope);
      if (job.envelope.type !== 'profile' || job.envelope.id !== job.id || job.envelope.profile.bridge_request_id !== job.id) throw Error('Job journal profile mismatch.');
      if (job.delivery!==undefined && (job.delivery.mode!==job.envelope.delivery?.mode || job.delivery.owner!==job.envelope.delivery?.owner || job.delivery.quality!==job.envelope.delivery?.quality)) throw Error("Job journal delivery mismatch.");
    }
    if (job.state === 'queued' && !job.envelope) throw Error('Queued job has no profile.');
  }

  put(job, envelope) {
    const record = {};
    for (const key of ['id', 'run', 'state', 'status', 'stage', 'quality', 'prompt', 'promptChars', 'createdAt', 'completedAt', 'appliedAt', 'error', 'errorCode', 'artSlot', 'delivery', 'saveSlot', 'itemType', 'auto']) {
      if (job[key] !== undefined) record[key] = structuredClone(job[key]);
    }
    const previous = this.records.get(job.id);
    if (envelope) record.envelope = structuredClone(envelope);
    else if (record.state === 'queued' && previous?.envelope) record.envelope = previous.envelope;
    this.validate(record);
    const next = new Map(this.records);
    next.set(record.id, record);
    while (next.size > 256) {
      const expired = [...next.values()].find(entry => entry.state === 'applied' || entry.state === 'failed');
      if (!expired) throw Error('Job journal is full.');
      next.delete(expired.id);
    }
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file + '.tmp', JSON.stringify({ version: 1, jobs: [...next.values()] }));
    replaceWithRetry(this.rename, this.file + '.tmp', this.file, { delay: this.delay });
    this.records = next;
    return record;
  }

  recover() {
    for (const record of [...this.records.values()]) {
      if (!['queued', 'applied', 'failed'].includes(record.state)) {
        this.put({ ...record, state: 'failed', status: 'error', errorCode: 'INTERRUPTED', error: 'Generation was interrupted. Your prompt can be retried.' });
      }
    }
    return [...this.records.values()].map(record => structuredClone(record));
  }
}

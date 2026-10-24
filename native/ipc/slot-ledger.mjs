import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const SLOT_COUNT = 128;

// Reservations are durable BEFORE a generator can write a texture. A failed
// generation conservatively consumes its reservation for this Isaac process.
export class SlotLedger {
  constructor(file) {
    this.file = file;
    this.loaded = false;
    this.data = { version: 1, session: null, used: [] };
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
      if (!this.data || ![1,2].includes(this.data.version) ||
          !(this.data.session === null || (typeof this.data.session === 'string' && /^[A-Za-z0-9_-]{1,70}$/.test(this.data.session))) ||
          !Array.isArray(this.data.used) || this.data.used.length > SLOT_COUNT ||
          this.data.used.some(s => !Number.isInteger(s) || s < 0 || s >= SLOT_COUNT)) {
        throw Error('Invalid artwork reservation ledger');
      }
      if (this.data.version === 2) {
        if (!this.data.manifests || typeof this.data.manifests !== 'object' || Array.isArray(this.data.manifests) || !Array.isArray(this.data.legacy) || this.data.legacy.length > SLOT_COUNT || this.data.legacy.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)) throw Error('Invalid artwork manifests.');
        const protectedSlots = new Set();
        for (const [saveSlot, manifest] of Object.entries(this.data.manifests)) {
          if (!['1','2','3'].includes(saveSlot) || !manifest || typeof manifest.run !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(manifest.run) || !Array.isArray(manifest.used) || manifest.used.length > SLOT_COUNT || manifest.used.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)) throw Error('Invalid artwork manifest.');
          if (manifest.used.some(slot => protectedSlots.has(slot))) throw Error('Invalid artwork manifests: conflicting save slots.');
          for (const slot of manifest.used) protectedSlots.add(slot);
        }
      }
      this.loaded=true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (existsSync(this.file+'.guard')) throw Error('Artwork reservation ledger is missing. Restore art-reservations.json from backup before generating.');
    }
    if (this.loaded && !existsSync(this.file+'.guard')) writeFileSync(this.file+'.guard','Artwork reservations initialized. Restore the ledger if it is lost.\n');
  }
  reserve(context) {
    // Isaac JSON encoders can serialize an empty Lua array as {}.
    if (context?.used && !Array.isArray(context.used) && typeof context.used === 'object' && Object.keys(context.used).length === 0) context = {...context,used:[]};
    if (!context || typeof context.session !== 'string' || !/^[a-zA-Z0-9_-]{1,70}$/.test(context.session) ||
        typeof context.run !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(context.run) ||
        !Array.isArray(context.used) || context.used.length > SLOT_COUNT ||
        context.used.some(s => !Number.isInteger(s) || s < 0 || s >= SLOT_COUNT) ||
        !Number.isInteger(context.count) || context.count < 0 || context.count > SLOT_COUNT) {
      throw Error('Start or continue a run in the updated mod before generating.');
    }
    if (context.blocked) throw Error(String(context.blocked));
    if (context.count >= SLOT_COUNT) throw Error(`Item limit reached: ${SLOT_COUNT}/${SLOT_COUNT}. Finish this run to free item slots.`);
    if (context.save_slot !== undefined || this.data.version === 2) {
      const next = this.scoped(context);
      const used = new Set([...next.used, ...next.legacy, ...Object.values(next.manifests).flatMap(manifest => manifest.used)]);
      const slot = Array.from({length:SLOT_COUNT}, (_,index)=>index).find(index => !used.has(index));
      if (slot === undefined) throw Error(`Artwork limit reached: ${SLOT_COUNT}/${SLOT_COUNT} across protected saves and this Isaac process.`);
      next.used = [...new Set([...next.used, slot])];
      next.manifests[context.save_slot].used = [...new Set([...next.manifests[context.save_slot].used, slot])];
      this.persist(next);
      return slot;
    }
    const used = new Set([
      ...(this.data.session === context.session ? this.data.used : []),
      ...context.used,
    ]);
    const slot = Array.from({length:SLOT_COUNT}, (_,i)=>i).find(i => !used.has(i));
    if (slot === undefined) throw Error(`Artwork limit reached: ${SLOT_COUNT}/${SLOT_COUNT}. Restart Isaac; continued-run artwork stays reserved.`);
    used.add(slot);
    const next = {version:1, session:context.session, used:[...used]};
    this.persist(next);
    return slot;
  }
  scoped(context) {
    if (![1,2,3].includes(context.save_slot) || typeof context.session !== 'string' || !/^[A-Za-z0-9_-]{1,70}$/.test(context.session) || typeof context.run !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(context.run)) throw Error('Select a save slot and restart Isaac before generating.');
    if (!Number.isInteger(context.count) || context.count < 0 || context.count > SLOT_COUNT) throw Error('Invalid run artwork manifest count.');
    const runUsed = context.run_used ?? context.used;
    const supplied = Array.isArray(runUsed) ? runUsed : (runUsed && typeof runUsed === 'object' && !Object.keys(runUsed).length ? [] : null);
    if (!supplied || supplied.length > SLOT_COUNT || supplied.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)) throw Error('Invalid run artwork manifest.');
    if (!this.loaded && (context.count > 0 || supplied.length > 0)) throw Error('Artwork reservation ledger is missing for this continued run. Restore art-reservations.json from backup.');
    const next = this.data.version === 2 ? structuredClone(this.data) : { version:2, session:null, used:[], manifests:{}, legacy:[...this.data.used] };
    if (next.session !== context.session) next.used=[];
    next.session = context.session;
    const processUsed = Array.isArray(context.used) ? context.used : (context.used && typeof context.used === 'object' && !Object.keys(context.used).length ? [] : null);
    if (!processUsed) throw Error('Invalid process artwork manifest.');
    if (processUsed.length > SLOT_COUNT || processUsed.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)) throw Error('Invalid process artwork manifest.');
    next.used=[...new Set([...next.used, ...processUsed])];
    const previous = next.manifests[context.save_slot];
    if (previous && previous.run !== context.run && context.fresh_run !== true) throw Error('Save-slot run identity does not match the protected artwork manifest.');
    for (const [saveSlot, manifest] of Object.entries(next.manifests)) {
      if (Number(saveSlot) !== context.save_slot && supplied.some(slot => manifest.used.includes(slot))) throw Error('Artwork is shared by conflicting save slots. Generation is blocked to protect both saves.');
    }
    const pinned = previous?.run === context.run ? previous.used : [];
    next.manifests[context.save_slot] = { run:context.run, used:[...new Set([...pinned, ...supplied])] };
    return next;
  }
  observe(context) {
    if (context.save_slot === undefined && this.data.version === 1) return;
    if ((context.blocked && context.ended_run !== true) || !context.run) return;
    const next = this.scoped(context);
    if (context.ended_run === true && next.manifests[context.save_slot]?.run === context.run) delete next.manifests[context.save_slot];
    if (JSON.stringify(next) !== JSON.stringify(this.data)) this.persist(next);
  }
  persist(next) {
    mkdirSync(path.dirname(this.file), {recursive:true});
    if (!existsSync(this.file+'.guard')) writeFileSync(this.file+'.guard','Artwork reservations initialized. Restore the ledger if it is lost.\n');
    writeFileSync(this.file + '.tmp', JSON.stringify(next));
    renameSync(this.file + '.tmp', this.file);
    this.data = next;
    this.loaded = true;
  }
}

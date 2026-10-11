import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Reservations are durable BEFORE a generator can write a texture. A failed
// generation conservatively consumes its reservation for this Isaac process.
export class SlotLedger {
  constructor(file) {
    this.file = file;
    this.data = { version: 1, session: null, used: [] };
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
      if (this.data.version !== 1 || !Array.isArray(this.data.used) ||
          this.data.used.some(s => !Number.isInteger(s) || s < 0 || s >= 64)) {
        throw Error('Invalid artwork reservation ledger');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  reserve(context) {
    // Isaac JSON encoders can serialize an empty Lua array as {}.
    if (context?.used && !Array.isArray(context.used) && typeof context.used === 'object' && Object.keys(context.used).length === 0) context = {...context,used:[]};
    if (!context || typeof context.session !== 'string' || !/^[a-zA-Z0-9_-]{1,70}$/.test(context.session) ||
        typeof context.run !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(context.run) ||
        !Array.isArray(context.used) || context.used.length > 64 ||
        context.used.some(s => !Number.isInteger(s) || s < 0 || s >= 64) ||
        !Number.isInteger(context.count) || context.count < 0 || context.count > 64) {
      throw Error('Start or continue a run in the updated mod before generating.');
    }
    if (context.blocked) throw Error(String(context.blocked));
    if (context.count >= 64) throw Error('Item limit reached: 64/64. Finish this run to free item slots.');
    const used = new Set([
      ...(this.data.session === context.session ? this.data.used : []),
      ...context.used,
    ]);
    const slot = Array.from({length:64}, (_,i)=>i).find(i => !used.has(i));
    if (slot === undefined) throw Error('Artwork limit reached: 64/64. Restart Isaac; continued-run artwork stays reserved.');
    used.add(slot);
    const next = {version:1, session:context.session, used:[...used]};
    mkdirSync(path.dirname(this.file), {recursive:true});
    writeFileSync(this.file + '.tmp', JSON.stringify(next));
    renameSync(this.file + '.tmp', this.file);
    this.data = next;
    return slot;
  }
}

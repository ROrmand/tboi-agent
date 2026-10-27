import { createHash } from 'node:crypto';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

function tokenize(source) {
  const tokens = [];
  let offset = 0;
  const fail = message => { throw new Error(`${message} at offset ${offset}`); };
  const longString = () => {
    const opener = source.slice(offset).match(/^\[(=*)\[/);
    if (!opener) return null;
    const start = offset + opener[0].length;
    const end = source.indexOf(`]${opener[1]}]`, start);
    if (end < 0) fail('Unterminated long string/comment');
    offset = end + opener[0].length;
    return source.slice(start, end).replace(/^\r?\n/, '').replace(/\r\n/g, '\n');
  };
  while (offset < source.length) {
    if (/\s|\uFEFF/.test(source[offset])) { offset++; continue; }
    if (source.startsWith('--', offset)) {
      offset += 2;
      if (longString() === null) {
        const end = source.indexOf('\n', offset);
        offset = end < 0 ? source.length : end;
      }
      continue;
    }
    const start = offset;
    const character = source[offset];
    if (character === '"' || character === "'") {
      offset++;
      let value = '';
      while (offset < source.length && source[offset] !== character) {
        const next = source[offset++];
        if (next === '\n' || next === '\r') fail('Unescaped newline in string');
        if (next !== '\\') { value += next; continue; }
        const escape = source[offset++];
        const escapes = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'" };
        if (Object.hasOwn(escapes, escape)) value += escapes[escape];
        else if (escape === 'z') { while (offset < source.length && /\s/.test(source[offset])) offset++; }
        else if (escape === '\n' || escape === '\r') {
          if (escape === '\r' && source[offset] === '\n') offset++;
          value += '\n';
        } else if (/\d/.test(escape ?? '')) {
          const digits = (escape + source.slice(offset)).match(/^\d{1,3}/)[0];
          if (Number(digits) > 255) fail('Decimal escape exceeds byte range');
          value += String.fromCharCode(Number(digits));
          offset += digits.length - 1;
        } else if (escape === 'x') {
          const digits = source.slice(offset, offset + 2);
          if (!/^[\da-f]{2}$/i.test(digits)) fail('Invalid hex escape');
          value += String.fromCharCode(parseInt(digits, 16));
          offset += 2;
        } else if (escape === 'u') {
          const digits = source.slice(offset).match(/^\{([\da-f]+)\}/i);
          if (!digits || parseInt(digits[1], 16) > 0x10ffff) fail('Invalid unicode escape');
          value += String.fromCodePoint(parseInt(digits[1], 16));
          offset += digits[0].length;
        } else fail(`Unsupported escape ${escape}`);
      }
      if (source[offset] !== character) fail('Unterminated quoted string');
      offset++;
      tokens.push({ kind: 'string', value, start });
      continue;
    }
    const longValue = longString();
    if (longValue !== null) { tokens.push({ kind: 'string', value: longValue, start }); continue; }
    const match = source.slice(offset).match(/^(?:[A-Za-z_][\w]*|\d+(?:\.\d+)?|\.\.)/);
    const value = match ? match[0] : character;
    offset += value.length;
    tokens.push({ kind: /^\d/.test(value) ? 'number' : 'symbol', value, start });
  }
  return tokens;
}

function readTable(tokens, start) {
  let cursor = start;
  const fail = message => { throw new Error(`${message} at offset ${tokens[cursor]?.start ?? 'EOF'}`); };
  const expect = value => { if (tokens[cursor]?.value !== value) fail(`Expected ${value}`); cursor++; };
  const literal = () => {
    const token = tokens[cursor];
    if (!token) fail('Missing literal');
    if (token.kind === 'string') {
      let value = tokens[cursor++].value;
      while (tokens[cursor]?.value === '..') {
        cursor++;
        if (tokens[cursor]?.kind !== 'string') fail('Only literal string concatenation is allowed');
        value += tokens[cursor++].value;
      }
      return value;
    }
    if (token.kind === 'symbol' && token.value === '{') return table();
    if (token.kind === 'number') { cursor++; return Number(token.value); }
    fail('Unsupported Lua expression; data tables must contain literals only');
  };
  const table = () => {
    expect('{');
    const entries = new Map();
    let sequence = 1;
    while (tokens[cursor]?.value !== '}') {
      const entryStart = tokens[cursor]?.start;
      let key;
      let explicit = false;
      if (tokens[cursor]?.value === '[') {
        cursor++;
        key = literal();
        if (!['number', 'string'].includes(typeof key)) fail('Invalid key');
        expect(']'); expect('='); explicit = true;
      } else key = sequence++;
      const value = literal();
      if (entries.has(key)) fail(`Duplicate table key ${key}`);
      entries.set(key, { value, explicit, start: entryStart });
      if (tokens[cursor]?.value === ',' || tokens[cursor]?.value === ';') cursor++;
      else if (tokens[cursor]?.value !== '}') fail('Expected table separator; expressions are not evaluated');
    }
    expect('}');
    return entries;
  };
  const entries = table();
  return { entries, next: cursor };
}

export function parseEid(source, { sourceName = '<memory>', tableNames = ['collectibles', 'repCollectibles'] } = {}) {
  const tokens = tokenize(source);
  const records = new Map();
  let found = 0;
  for (let index = 0; index < tokens.length - 2; index++) {
    if (tokens[index].kind !== 'symbol' || !tableNames.includes(tokens[index].value) || tokens[index + 1].value !== '=' || tokens[index + 2].value !== '{') continue;
    const parsed = readTable(tokens, index + 2);
    found++;
    for (const [key, entry] of parsed.entries) {
      const row = entry.value;
      if (!(row instanceof Map) || row.size !== 3) throw new Error(`${sourceName}: collectible row ${key} must contain exactly three strings`);
      const [idText, name, description] = [1, 2, 3].map(position => row.get(position)?.value);
      if (![idText, name, description].every(value => typeof value === 'string') || !/^[1-9]\d*$/.test(idText)) throw new Error(`${sourceName}: invalid collectible row ${key}`);
      const id = Number(idText);
      if (!Number.isSafeInteger(id) || (entry.explicit && Number(key) !== id)) throw new Error(`${sourceName}: collectible key/ID mismatch ${key}/${idText}`);
      if (records.has(id)) throw new Error(`${sourceName}: duplicate collectible ID ${id}`);
      records.set(id, { id, name, description, source: { file: sourceName, table: tokens[index].value, line: source.slice(0, entry.start).split('\n').length } });
    }
    index = parsed.next - 1;
  }
  if (!found) throw new Error(`${sourceName}: no supported collectible literal table found`);
  return { records: [...records.values()], provenance: { file: sourceName, sha256: sha256(source), tables: found, count: records.size } };
}

export function mergeEidLayers(layers) {
  const records = new Map();
  const overrides = [];
  for (const layer of layers) {
    const seen = new Set();
    for (const record of layer.records) {
      if (seen.has(record.id)) throw new Error(`Duplicate collectible ID ${record.id} within layer`);
      seen.add(record.id);
      const previous = records.get(record.id);
      if (previous) overrides.push({ id: record.id, previous: previous.source, replacement: record.source });
      records.set(record.id, { ...record, history: [...(previous?.history ?? []), record.source] });
    }
  }
  return { records: [...records.values()].sort((left, right) => left.id - right.id), provenance: layers.map(layer => layer.provenance), overrides };
}

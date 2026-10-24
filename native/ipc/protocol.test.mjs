import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedQueue, decodeLines, encodeEnvelope, PROTOCOL_VERSION } from './protocol.mjs';

test('all IPC control envelopes reject unknown fields', () => {
  for (const type of ['hello', 'poll', 'ack']) {
    const envelope = { version: 1, type, ...(type === 'ack' ? { id: 'job_1' } : {}) };
    assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(envelope)).lines, [envelope]);
    assert.throws(() => encodeEnvelope({ ...envelope, execute: true }), /field/);
    assert.throws(() => decodeLines(Buffer.alloc(0), JSON.stringify({ ...envelope, execute: true }) + '\n'), /field/);
  }
});

test('blank delivery is trusted bounded owner data, not model callback flags', () => {
  const envelope = { version: 1, type: 'profile', id: 'blank_1', profile: {}, delivery: { mode: 'blank', owner: '-123' } };
  assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(envelope)).lines, [envelope]);
  for (const delivery of [
    null, [], { mode: 'pedestal', owner: '123' }, { mode: 'blank', owner: 123 },
    { mode: 'blank', owner: '1.5' }, { mode: 'blank', owner: '1'.repeat(41) },
    { mode: 'blank', owner: '123', run: 'untrusted' },
    { mode: 'generator', owner: '123' }, { mode: 'blank', owner: '123', quality: 2 },
  ]) assert.throws(() => encodeEnvelope({ ...envelope, delivery }), /delivery/);
  const generator = { ...envelope, delivery: { mode: 'generator', owner: '-9', quality: 4 } };
  assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(generator)).lines, [generator]);
  const singularity = { ...envelope, delivery: { mode: 'singularity', owner: '-9', quality: 0 } };
  assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(singularity)).lines, [singularity]);
});

test('error codes only accompany errors and unterminated lines obey framing limits', () => {
  const envelope = { version: 1, type: 'status', id: 'job_1', status: 'error', detail: 'Offline', error_code: 'BRIDGE_OFFLINE' };
  assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(envelope)).lines, [envelope]);
  assert.throws(() => encodeEnvelope({ ...envelope, status: 'generating' }), /error code/);
  assert.throws(() => encodeEnvelope({ ...envelope, error_code: 'unsafe-code' }), /error code/);
  assert.throws(() => decodeLines(Buffer.alloc(0), 'x'.repeat(64 * 1024 + 1)), /64 KiB/);
});

test('IPC framing accepts fragmented versioned hello messages', () => {
  const message = { version: PROTOCOL_VERSION, type: 'hello' };
  const line = encodeEnvelope(message);
  const first = decodeLines(Buffer.alloc(0), line.slice(0, 5));
  assert.deepEqual(first.lines, []);
  const second = decodeLines(first.remainder, line.slice(5));
  assert.deepEqual(second.lines, [message]);
  assert.equal(second.remainder.length, 0);
});

test('IPC rejects executable or malformed payloads and bounds the queue', () => {
  assert.throws(() => encodeEnvelope({ version: 1, type: 'lua', code: 'os.execute()' }), /Unsupported/);
  assert.throws(() => decodeLines(Buffer.alloc(0), '{bad}\n'), /valid JSON/);
  const queue = new BoundedQueue();
  for (let index = 0; index < 32; index += 1) queue.publish({ version: 1, type: 'hello' });
  assert.throws(() => queue.publish({ version: 1, type: 'hello' }), /full/);
});

test('IPC accepts bounded profile data but never executable message types', () => {
  const profile = { metadata: { display_name: 'Ashen Nail' } };
  const line = encodeEnvelope({ version: 1, type: 'profile', id: 'job_1', profile });
  assert.deepEqual(decodeLines(Buffer.alloc(0), line).lines, [{ version: 1, type: 'profile', id: 'job_1', profile }]);
  assert.throws(() => encodeEnvelope({ version: 1, type: 'profile', id: 'job_1', code: 'return os.execute()' }), /payload/);
});

test('IPC status is bounded declarative data with a validated request ID', () => {
  const status = { version: 1, type: 'status', id: 'ui_123_1', status: 'error', detail: 'Image service unavailable' };
  assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(status)).lines, [status]);
  const sentence = { version: 1, type: 'status', id: 'ui_123_1', status: 'sentence', detail: 'A cracked bell that rings when nobody is looking.' };
  assert.deepEqual(decodeLines(Buffer.alloc(0), encodeEnvelope(sentence)).lines, [sentence]);
  assert.throws(() => encodeEnvelope({ ...status, detail: 'x'.repeat(501) }), /payload/);
  assert.throws(() => encodeEnvelope({ ...status, id: '../path' }), /id/);
  assert.throws(() => encodeEnvelope({ ...status, code: 'os.execute()' }), /field/);
});

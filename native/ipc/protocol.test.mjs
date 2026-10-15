import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedQueue, decodeLines, encodeEnvelope, PROTOCOL_VERSION } from './protocol.mjs';

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

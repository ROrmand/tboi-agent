const MAX_LINE_BYTES = 64 * 1024;
const MAX_QUEUE_MESSAGES = 32;

export const PROTOCOL_VERSION = 1;

export function encodeEnvelope(envelope) {
  validateEnvelope(envelope);
  const line = `${JSON.stringify(envelope)}\n`;
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) throw Error('IPC envelope exceeds 64 KiB.');
  return line;
}

export function decodeLines(buffer, chunk) {
  const combined = Buffer.concat([buffer, Buffer.from(chunk)]);
  if (combined.length > MAX_LINE_BYTES * 2) throw Error('IPC client exceeded framing buffer limit.');
  const lines = [];
  let start = 0;
  for (;;) {
    const end = combined.indexOf(10, start);
    if (end === -1) break;
    const line = combined.subarray(start, end).toString('utf8').trim();
    if (line) {
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) throw Error('IPC line exceeds 64 KiB.');
      let message;
      try { message = JSON.parse(line); } catch { throw Error('IPC line is not valid JSON.'); }
      validateEnvelope(message);
      lines.push(message);
    }
    start = end + 1;
  }
  return { lines, remainder: combined.subarray(start) };
}

export class BoundedQueue {
  #messages = [];

  publish(envelope) {
    validateEnvelope(envelope);
    if (this.#messages.length >= MAX_QUEUE_MESSAGES) throw Error('IPC queue is full.');
    this.#messages.push(structuredClone(envelope));
  }

  take() { return this.#messages.shift() ?? null; }
  get size() { return this.#messages.length; }
}

function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('IPC envelope must be an object.');
  if (value.version !== PROTOCOL_VERSION) throw Error('Unsupported IPC protocol version.');
  if (typeof value.type !== 'string' || !['hello', 'poll', 'ack', 'profile', 'status'].includes(value.type)) throw Error('Unsupported IPC envelope type.');
  if (value.type === 'status') {
    if (Object.keys(value).some(key => !['version', 'type', 'id', 'status', 'detail'].includes(key))) throw Error('Unsupported IPC status field.');
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) throw Error('Invalid IPC status id.');
    if (!['generating', 'error', 'sentence'].includes(value.status) || typeof value.detail !== 'string' || !value.detail.length || value.detail.length > 500) throw Error('Invalid IPC status payload.');
  }
  if (value.type === 'profile') {
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) throw Error('Invalid IPC profile id.');
    if (!value.profile || typeof value.profile !== 'object' || Array.isArray(value.profile)) throw Error('IPC profile payload must be data.');
  }
  if (value.type === 'ack' && (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id))) {
    throw Error('Invalid IPC acknowledgement id.');
  }
}

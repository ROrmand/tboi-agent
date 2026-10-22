import { EventEmitter } from 'node:events';
import net from 'node:net';
import { BoundedQueue, decodeLines, encodeEnvelope, PROTOCOL_VERSION } from './protocol.mjs';

export const PIPE_NAME = '\\\\.\\pipe\\nebius_isaac_bridge_v1';

export class NativePipeServer extends EventEmitter {
  #server;
  #queue = new BoundedQueue();
  #profiles = new Map();
  #now;
  #retryMs;
  #canDeliver;
  #preferProfile = true;

  constructor({ seedHello = false, now = Date.now, retryMs = 1000, canDeliver = () => true } = {}) {
    super();
    this.#now = now;
    this.#retryMs = retryMs;
    this.#canDeliver = canDeliver;
    if (seedHello) this.#queue.publish({ version: PROTOCOL_VERSION, type: 'hello' });
  }

  publish(envelope) {
    if (envelope.type !== 'profile') {
      if (this.queuedMessages >= 32) throw Error('IPC queue is full.');
      this.#queue.publish(envelope);
      return;
    }
    encodeEnvelope(envelope);
    const previous = this.#profiles.get(envelope.id);
    if (previous) {
      if (JSON.stringify(previous.envelope) !== JSON.stringify(envelope)) throw Error('Conflicting profile request identity.');
      return;
    }
    if (this.queuedMessages >= 32) throw Error('IPC queue is full.');
    this.#profiles.set(envelope.id, { envelope: structuredClone(envelope), sentAt: null });
  }
  discard(id) { this.#profiles.delete(id); }
  get queuedMessages() { return this.#queue.size + this.#profiles.size; }

  async start(pipeName = PIPE_NAME) {
    if (this.#server) throw Error('Native pipe server is already started.');
    this.#server = net.createServer((socket) => this.#accept(socket));
    await new Promise((resolve, reject) => {
      this.#server.once('error', reject);
      this.#server.listen(pipeName, () => {
        this.#server.off('error', reject);
        resolve();
      });
    });
    return pipeName;
  }

  async close() {
    if (!this.#server) return;
    const server = this.#server;
    this.#server = undefined;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  #accept(socket) {
    socket.on('error', () => socket.destroy());
    let remainder = Buffer.alloc(0);
    let answered = false;
    socket.on('data', (chunk) => {
      if (answered) return;
      try {
        const parsed = decodeLines(remainder, chunk);
        remainder = parsed.remainder;
        if (!parsed.lines.length) return;
        answered = true;
        socket.end(this.#respond(parsed.lines[0]));
      } catch {
        answered = true;
        socket.end('{"version":1,"type":"ack","ok":false}\n');
      }
    });
  }

  #respond(message) {
    if (message.type === 'poll') {
      if (!this.#preferProfile) {
        const next = this.#queue.take();
        this.#preferProfile = true;
        if (next) return encodeEnvelope(next);
      }
      for (const [id, profile] of this.#profiles) {
        if (this.#canDeliver(profile.envelope) && (profile.sentAt === null || this.#now() - profile.sentAt >= this.#retryMs)) {
          profile.sentAt = this.#now();
          this.#profiles.delete(id);
          this.#profiles.set(id, profile);
          this.#preferProfile = false;
          return encodeEnvelope(profile.envelope);
        }
      }
      const next = this.#queue.take();
      if (next) return encodeEnvelope(next);
      return 'null\n';
    }
    if (message.type === 'ack') {
      const profile = this.#profiles.get(message.id);
      if (profile) {
        if (profile.sentAt === null || !this.#canDeliver(profile.envelope)) return '{"version":1,"type":"ack","ok":false}\n';
        this.emit('ack', message.id);
        this.#profiles.delete(message.id);
      }
      return '{"version":1,"type":"ack","ok":true}\n';
    }
    return '{"version":1,"type":"ack","ok":false}\n';
  }
}

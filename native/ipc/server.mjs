import { EventEmitter } from 'node:events';
import net from 'node:net';
import { BoundedQueue, decodeLines, encodeEnvelope, PROTOCOL_VERSION } from './protocol.mjs';

export const PIPE_NAME = '\\\\.\\pipe\\nebius_isaac_bridge_v1';

export class NativePipeServer extends EventEmitter {
  #server;
  #queue = new BoundedQueue();

  constructor({ seedHello = false } = {}) {
    super();
    if (seedHello) this.#queue.publish({ version: PROTOCOL_VERSION, type: 'hello' });
  }

  publish(envelope) { this.#queue.publish(envelope); }
  get queuedMessages() { return this.#queue.size; }

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
      const next = this.#queue.take();
      return next ? encodeEnvelope(next) : 'null\n';
    }
    if (message.type === 'ack') {
      this.emit('ack', message.id);
      return '{"version":1,"type":"ack","ok":true}\n';
    }
    return '{"version":1,"type":"ack","ok":false}\n';
  }
}

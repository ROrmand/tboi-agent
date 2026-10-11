import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { NativePipeServer } from './server.mjs';
import { PROTOCOL_VERSION } from './protocol.mjs';

async function request(pipeName, line) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipeName);
    let output = '';
    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk) => { output += chunk; });
    socket.on('end', () => resolve(output));
    socket.on('connect', () => socket.end(line));
  });
}

test('named pipe returns a fixed hello once, then null, and reports acknowledgements', async () => {
  const pipeName = `\\\\.\\pipe\\nebius_ipc_test_${process.pid}_${Date.now()}`;
  const server = new NativePipeServer({ seedHello: true });
  const acks = [];
  server.on('ack', (id) => acks.push(id));
  await server.start(pipeName);
  try {
    assert.deepEqual(JSON.parse(await request(pipeName, '{"version":1,"type":"poll"}\n')), { version: PROTOCOL_VERSION, type: 'hello' });
    assert.equal(await request(pipeName, '{"version":1,"type":"poll"}\n'), 'null\n');
    assert.equal(await request(pipeName, '{"version":1,"type":"ack","id":"probe-1"}\n'), '{"version":1,"type":"ack","ok":true}\n');
    assert.deepEqual(acks, ['probe-1']);
  } finally {
    await server.close();
  }
});

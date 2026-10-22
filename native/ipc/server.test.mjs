import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { NativePipeServer, PIPE_NAME } from './server.mjs';
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

test('profiles remain available until ACK and reappear after a lost poll response', async () => {
  let now=0;
  const server=new NativePipeServer({now:()=>now,retryMs:1000});
  const pipeName=`${PIPE_NAME}_retry_${process.pid}_${randomUUID()}`;
  const profile={version:1,type:'profile',id:'run_one',profile:{bridge_request_id:'run_one'}};
  server.publish(profile);
  await server.start(pipeName);
  const poll=()=>request(pipeName,'{"version":1,"type":"poll"}\n');
  try {
    assert.deepEqual(JSON.parse(await poll()),profile);
    assert.equal(server.queuedMessages,1);
    assert.equal(await poll(),'null\n');
    now=1000;
    assert.deepEqual(JSON.parse(await poll()),profile);
    await request(pipeName,'{"version":1,"type":"ack","id":"run_one"}\n');
    now=2000;
    assert.equal(await poll(),'null\n');
    assert.equal(server.queuedMessages,0);
  } finally { await server.close(); }
});

test('named pipe returns a fixed hello once and ignores unknown acknowledgements', async () => {
  const pipeName = `${PIPE_NAME}_hello_${process.pid}_${randomUUID()}`;
  const server = new NativePipeServer({ seedHello: true });
  const acks = [];
  server.on('ack', (id) => acks.push(id));
  await server.start(pipeName);
  try {
    assert.deepEqual(JSON.parse(await request(pipeName, '{"version":1,"type":"poll"}\n')), { version: PROTOCOL_VERSION, type: 'hello' });
    assert.equal(await request(pipeName, '{"version":1,"type":"poll"}\n'), 'null\n');
    assert.equal(await request(pipeName, '{"version":1,"type":"ack","id":"probe-1"}\n'), '{"version":1,"type":"ack","ok":true}\n');
    assert.deepEqual(acks, []);
  } finally {
    await server.close();
  }
});

test('ACK requires a sent eligible profile and persistence failure retains delivery', async () => {
  let allowed = true;
  let failPersistence = true;
  const server = new NativePipeServer({ retryMs: 0, canDeliver: () => allowed });
  const pipeName = `${PIPE_NAME}_ack_${process.pid}_${randomUUID()}`;
  const profile = { version: 1, type: 'profile', id: 'run_ack', profile: {} };
  const acknowledgements = [];
  server.on('ack', id => {
    if (failPersistence) throw Error('Journal write failed');
    acknowledgements.push(id);
  });
  server.publish(profile);
  await server.start(pipeName);
  const poll = () => request(pipeName, '{"version":1,"type":"poll"}\n');
  const ack = () => request(pipeName, '{"version":1,"type":"ack","id":"run_ack"}\n');
  try {
    assert.equal(JSON.parse(await ack()).ok, false);
    assert.deepEqual(JSON.parse(await poll()), profile);
    allowed = false;
    assert.equal(await poll(), 'null\n');
    assert.equal(JSON.parse(await ack()).ok, false);
    allowed = true;
    assert.equal(JSON.parse(await ack()).ok, false);
    assert.equal(server.queuedMessages, 1);
    failPersistence = false;
    assert.equal(JSON.parse(await ack()).ok, true);
    assert.equal(JSON.parse(await ack()).ok, true);
    assert.deepEqual(acknowledgements, ['run_ack']);
    assert.equal(server.queuedMessages, 0);
  } finally { await server.close(); }
});

test('profile retry rotation prevents status traffic and earlier profiles starving delivery', async () => {
  const server = new NativePipeServer({ retryMs: 0 });
  const pipeName = `${PIPE_NAME}_fair_${process.pid}_${randomUUID()}`;
  server.publish({ version: 1, type: 'status', id: 'run_status', status: 'generating', detail: 'Working' });
  for (const id of ['run_first', 'run_second']) server.publish({ version: 1, type: 'profile', id, profile: {} });
  await server.start(pipeName);
  try {
    const poll = async () => JSON.parse(await request(pipeName, '{"version":1,"type":"poll"}\n'));
    assert.equal((await poll()).id, 'run_first');
    assert.equal((await poll()).id, 'run_status');
    assert.equal((await poll()).id, 'run_second');
    assert.equal((await poll()).id, 'run_first');
  } finally { await server.close(); }
});

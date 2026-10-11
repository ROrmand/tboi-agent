import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { assertComfyUiReady } from './comfyui.mjs';

async function withServer(status, callback) {
  const server = createServer((_, response) => {
    response.statusCode = status;
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

test('ComfyUI preflight gives a clear unavailable-service error before generation', async () => {
  await withServer(503, async url => {
    await assert.rejects(assertComfyUiReady(url), /health check failed.*HTTP 503/);
  });
  await assert.rejects(
    assertComfyUiReady('http://127.0.0.1:1'),
    /ComfyUI is not running at http:\/\/127\.0\.0\.1:1/,
  );
});

test('ComfyUI preflight accepts a healthy local service', async () => {
  await withServer(200, assertComfyUiReady);
});

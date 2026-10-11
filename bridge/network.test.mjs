import test from 'node:test';
import assert from 'node:assert/strict';
import {requestTextModel} from './network.mjs';

test('text connection timeout retries once without losing request options', async () => {
  let calls=0;
  const result=await requestTextModel('https://example.test/v1/chat/completions',
    {method:'POST',body:'profile'}, async (_,options)=>{
      assert.equal(options.body,'profile');
      if (++calls===1) throw new TypeError('fetch failed',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});
      return {status:200};
    });
  assert.equal(result.status,200);
  assert.equal(calls,2);
});

test('text failure retains cause and never retries an ambiguous socket failure', async () => {
  let calls=0;
  await assert.rejects(requestTextModel('https://example.test/v1/chat/completions',{},async ()=>{
    calls++;
    throw new TypeError('fetch failed',{cause:{code:'UND_ERR_SOCKET',message:'other side closed'}});
  }),/Nebius text request.*UND_ERR_SOCKET: other side closed/);
  assert.equal(calls,1);
});

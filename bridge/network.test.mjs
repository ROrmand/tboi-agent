import test from 'node:test';
import assert from 'node:assert/strict';
import {chatCompletionPayload, requestTextModel} from './network.mjs';

test('chat completions disable Nemotron thinking so structured answers keep the token budget', () => {
  const payload = chatCompletionPayload(
    {NEBIUS_TEXT_MODEL:'nvidia/Nemotron-3_5-Lightning'},
    {temperature:0.7,max_tokens:128,chat_template_kwargs:{enable_thinking:true}},
  );
  assert.equal(payload.model,'nvidia/Nemotron-3_5-Lightning');
  assert.equal(payload.temperature,0.7);
  assert.equal(payload.max_tokens,128);
  assert.deepEqual(payload.chat_template_kwargs,{enable_thinking:false});
});

test('planner calls can use a shorter timeout than item generation', async () => {
  let signal;
  await requestTextModel('https://example.test/v1/chat/completions',
    { method: 'POST', body: 'plan', timeoutMs: 15000 }, async (_, options) => {
      signal = options.signal;
      assert.equal(options.body, 'plan');
      assert.equal(options.timeoutMs, undefined);
      return { status: 200 };
    });
  assert.equal(signal.aborted, false);
});

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

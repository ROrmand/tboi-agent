import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyStage1 } from './verify.mjs';

const prefix = '[NebiusNative][stage1i_existing_pedestal_overlay]';
const started = `${prefix} RUN_STARTED continued=false awaiting=KEY_8|KEY_KP_8\n`;
const receipt = [
  `${prefix} INPUT_DETECTED key=KEY_8 frame=17 time_ms=290`,
  `${prefix} UPDATE_ARMED frame=17 native_calls=compose_surface_then_existing_pedestal_overlay`,
  `${prefix} CREATEIMAGE_CALL_BEGIN frame=17 width=32 height=32 name=nebius.stage1e.surface.v1`,
  `${prefix} CREATEIMAGE_CALL_OK frame=17 surface_retained=true draw=false spawn=false`,
  `${prefix} LOADIMAGE_CALL_BEGIN frame=17 path=gfx/nebius_native_stage1/white.png`,
  `${prefix} SOURCEQUAD_CALL_BEGIN frame=17 x=0 y=0 width=1 height=1 uv=false`,
  `${prefix} SOURCEQUAD_CALL_OK frame=17 quad_retained=true render_to_image=false draw=false`,
  `${prefix} DESTINATIONQUAD_CALL_BEGIN frame=17 x=0 y=0 width=32 height=32`,
  `${prefix} DESTINATIONQUAD_CALL_OK frame=17 quad_retained=true render_to_image=false draw=false`,
  `${prefix} RENDERTOIMAGE_BEGIN frame=17 source_render=true screen_draw=false`,
  `${prefix} RENDERTOIMAGE_OK frame=17 surface_retained=true source_rendered=true screen_draw=false`,
  `${prefix} LOADIMAGE_CALL_OK frame=17 image_retained=true surface_retained=true quads_retained=true surface_cleared=true source_rendered=true item_bound=false spawn=false`,
  `${prefix} UPDATE_STABLE frame=77 elapsed_frames=60 surface_created=true image_loaded=true quads_created=true surface_cleared=true source_rendered=true awaiting_existing_pedestal=true`,
  `${prefix} PEDESTAL_RENDER_OK host_item_id=733 item_bound=true spawn=false`,
].join('\n');

test('Stage 1I verification requires a stable native receipt and an existing pedestal render', () => {
  assert.throws(() => verifyStage1(''), /No Stage 1I run marker/);
  assert.throws(() => verifyStage1(started), /No 8-key input/);
  assert.throws(() => verifyStage1(`${started}${receipt.split('\n').slice(0, 4).join('\n')}`), /Incomplete receipt/);
  assert.deepEqual(verifyStage1(`${started}${receipt}`), {
    key: 'KEY_8', armedFrame: 17, loadFrame: 17, stableFrame: 77,
  });
});

test('Stage 1I reports unavailable, Lua failures, and spawn boundary violations', () => {
  assert.throws(() => verifyStage1(`${started}${prefix} INPUT_DETECTED key=KEY_8 frame=1 time_ms=1\n${prefix} NATIVE_CALLS_SKIPPED frame=1 reason=required_native_binding_unavailable`), /unavailable/);
  assert.throws(() => verifyStage1(`${started}${prefix} INPUT_DETECTED key=KEY_8 frame=1 time_ms=1\n${prefix} CREATEIMAGE_CALL_ERROR frame=1 detail=error`), /CreateImage returned a Lua error/);
  assert.throws(() => verifyStage1(`${started}${prefix} INPUT_DETECTED key=KEY_8 frame=1 time_ms=1\n${prefix} LOADIMAGE_CALL_ERROR frame=1 detail=error`), /Lua error/);
  assert.throws(() => verifyStage1(`${started}${receipt}\n${prefix} spawn=true`), /outside/);
});

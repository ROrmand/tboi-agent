import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prefix = '[NebiusNative][stage1i_existing_pedestal_overlay]';

export function verifyStage1(log) {
  const start = log.lastIndexOf(`${prefix} RUN_STARTED`);
  if (start === -1) throw Error('No Stage 1I run marker found. Restart Isaac with the probe enabled and start a run.');
  const attempt = log.slice(start);
  const input = attempt.match(/INPUT_DETECTED key=(KEY_8|KEY_KP_8) frame=(\d+) time_ms=(\d+)/);
  if (!input) throw Error('No 8-key input was observed. Press top-row 8 or keypad 8 while playing, not in the console.');
  const armed = attempt.match(/UPDATE_ARMED frame=(\d+) native_calls=compose_surface_then_existing_pedestal_overlay/);
  const createBegin = attempt.match(/CREATEIMAGE_CALL_BEGIN frame=(\d+) width=32 height=32 name=nebius\.stage1e\.surface\.v1/);
  const created = attempt.match(/CREATEIMAGE_CALL_OK frame=(\d+) surface_retained=true draw=false spawn=false/);
  const begin = attempt.match(/LOADIMAGE_CALL_BEGIN frame=(\d+) path=gfx\/nebius_native_stage1\/white\.png/);
  const sourceBegin = attempt.match(/SOURCEQUAD_CALL_BEGIN frame=(\d+) x=0 y=0 width=1 height=1 uv=false/);
  const source = attempt.match(/SOURCEQUAD_CALL_OK frame=(\d+) quad_retained=true render_to_image=false draw=false/);
  const destinationBegin = attempt.match(/DESTINATIONQUAD_CALL_BEGIN frame=(\d+) x=0 y=0 width=32 height=32/);
  const destination = attempt.match(/DESTINATIONQUAD_CALL_OK frame=(\d+) quad_retained=true render_to_image=false draw=false/);
  const clearBegin = attempt.match(/RENDERTOIMAGE_BEGIN frame=(\d+) source_render=true screen_draw=false/);
  const cleared = attempt.match(/RENDERTOIMAGE_OK frame=(\d+) surface_retained=true source_rendered=true screen_draw=false/);
  const pedestal = attempt.match(/PEDESTAL_RENDER_OK host_item_id=(\d+) item_bound=true spawn=false/);
  const loaded = attempt.match(/LOADIMAGE_CALL_OK frame=(\d+) image_retained=true surface_retained=true quads_retained=true surface_cleared=true source_rendered=true item_bound=false spawn=false/);
  const stable = attempt.match(/UPDATE_STABLE frame=(\d+) elapsed_frames=(\d+) surface_created=true image_loaded=true quads_created=true surface_cleared=true source_rendered=true awaiting_existing_pedestal=true/);
  if (!armed || !createBegin || !created || !begin || !sourceBegin || !source || !destinationBegin || !destination || !clearBegin || !cleared || !pedestal || !loaded || !stable) {
    if (attempt.includes('NATIVE_CALLS_SKIPPED')) throw Error('A required renderer or quad binding is unavailable in this REPENTOGON session.');
    if (attempt.includes('CREATEIMAGE_CALL_ERROR')) throw Error('Renderer.CreateImage returned a Lua error; see the Isaac log for its detail.');
    if (attempt.includes('LOADIMAGE_CALL_ERROR')) throw Error('Renderer.LoadImage returned a Lua error; see the Isaac log for its detail.');
    throw Error('Incomplete receipt. Hold 8, then render an existing Live Profile Core pedestal before exiting.');
  }
  if (Number(armed[1]) !== Number(input[2]) || Number(createBegin[1]) !== Number(armed[1]) || Number(created[1]) !== Number(createBegin[1]) || Number(begin[1]) !== Number(created[1]) || Number(sourceBegin[1]) !== Number(begin[1]) || Number(source[1]) !== Number(sourceBegin[1]) || Number(destinationBegin[1]) !== Number(source[1]) || Number(destination[1]) !== Number(destinationBegin[1]) || Number(clearBegin[1]) !== Number(destination[1]) || Number(cleared[1]) !== Number(clearBegin[1]) || Number(loaded[1]) !== Number(cleared[1]) || Number(stable[2]) < 60) {
    throw Error('The Stage 1I callback order or stability window was invalid.');
  }
  if (/Isaac\.Spawn|spawn=true/.test(attempt)) {
    throw Error('Stage 1I must render only an existing pedestal; spawning is outside its boundary.');
  }
  return { key: input[1], armedFrame: Number(armed[1]), loadFrame: Number(loaded[1]), stableFrame: Number(stable[1]) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--log');
  const file = index === -1
    ? path.join(process.env.USERPROFILE || '', 'Documents', 'My Games', 'Binding of Isaac Repentance+', 'log.txt')
    : process.argv[index + 1];
  try {
    const receipt = verifyStage1(await readFile(file, 'utf8'));
    console.log('Stage 1I existing-pedestal overlay probe confirmed:', JSON.stringify(receipt));
  } catch (error) {
    console.error('Stage 1I not yet verified:', error.message);
    process.exitCode = 1;
  }
}

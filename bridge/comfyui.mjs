import { randomUUID } from "node:crypto";

const POLL_INTERVAL_MS = 750;
const JOB_TIMEOUT_MS = 120000;

export async function assertComfyUiReady(baseUrl) {
  const url = baseUrl.replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    const detail = error.cause?.code ? ` (${error.cause.code})` : "";
    throw new Error(`ComfyUI is not running at ${url}${detail}. Start ComfyUI, wait for its “Starting server” message, then retry.`);
  }
  if (!response.ok) {
    throw new Error(`ComfyUI health check failed at ${url}/system_stats (HTTP ${response.status}). Start or repair ComfyUI, then retry.`);
  }
}

export async function generateComfyImage({ baseUrl, checkpoint, prompt, onStage = () => {} }) {
  const url = baseUrl.replace(/\/$/, "");
  const clientId = `nebius-isaac-${randomUUID()}`;
  const response = await fetch(`${url}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, prompt: buildWorkflow(checkpoint, prompt) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ComfyUI is unavailable (${response.status}). Start it at ${url}.`);
  const queued = await response.json();
  if (!queued.prompt_id) throw new Error("ComfyUI did not return a prompt ID.");

  onStage("image");
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    const historyResponse = await fetch(`${url}/history/${queued.prompt_id}`, { signal: AbortSignal.timeout(15000) });
    if (!historyResponse.ok) continue;
    const history = await historyResponse.json();
    const job = history[queued.prompt_id];
    if (!job) continue;
    if (job.status?.status_str === "error") throw new Error("ComfyUI could not render the image. Check its terminal for the model error.");
    const image = Object.values(job.outputs || {}).flatMap((output) => output.images || [])[0];
    if (!image) continue;
    const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: image.type || "output" });
    const imageResponse = await fetch(`${url}/view?${query}`, { signal: AbortSignal.timeout(30000) });
    if (!imageResponse.ok) throw new Error(`ComfyUI rendered an image but it could not be downloaded (${imageResponse.status}).`);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("ComfyUI image generation timed out after 120 seconds.");
}

function buildWorkflow(checkpoint, prompt) {
  const negative = "text, letters, words, UI, border, frame, character, scenery, room, multiple objects, photorealistic";
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { seed: Math.floor(Math.random() * 2147483647), steps: 4, cfg: 1, sampler_name: "euler_ancestral", scheduler: "normal", denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { filename_prefix: "nebius_isaac", images: ["6", 0] } },
  };
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

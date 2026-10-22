const RETRYABLE = new Set(['EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']);

// Nemotron 3.5 Lightning thinks by default. Reasoning and the visible answer
// share max_tokens, so a thinking trace can fill the budget and return
// finish_reason=length with empty content. Structured JSON, one-sentence
// prompts, and idea briefs do not need a reasoning trace.
export function chatCompletionPayload(env, fields) {
  return {
    model: env.NEBIUS_TEXT_MODEL,
    ...fields,
    chat_template_kwargs: { enable_thinking: false },
  };
}

export async function requestTextModel(url, options = {}, fetchImpl = fetch) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 120000;
  const request = { ...options };
  delete request.timeoutMs;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchImpl(url, {...request, signal: AbortSignal.timeout(timeoutMs)});
    } catch (error) {
      const code = error.cause?.code || error.code || error.name;
      // Only retry failures establishing a connection, not ambiguous failures
      // after a POST may already have been processed.
      if (attempt === 0 && RETRYABLE.has(code)) continue;
      const cause = error.cause?.message || error.message;
      throw new Error(
        `Nebius text request could not connect or complete at ${new URL(url).origin} (${code}: ${cause}). Check internet/DNS/proxy connectivity and retry. ComfyUI is a separate service.`,
        {cause:error},
      );
    }
  }
}

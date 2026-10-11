const RETRYABLE = new Set(['EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']);

export async function requestTextModel(url, options, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchImpl(url, {...options, signal: AbortSignal.timeout(90000)});
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

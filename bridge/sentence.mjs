import { requestTextModel } from "./network.mjs";

const SENTENCE_PROMPT = "Write one ordinary sentence describing a strange object someone might wish for. Do not name stats, effects, or an item title. No quotation marks. No second sentence.";

export function cleanSentence(value) {
  const line = String(value ?? "").split(/\r?\n/).map((part) => part.trim()).find(Boolean) || "";
  let sentence = line.replace(/^[-*\d.)\s]+/, "").replace(/^["']+|["']+$/g, "").replace(/\s+/g, " ").trim();
  const stop = sentence.search(/[.!?]["']?(?:\s|$)/);
  if (stop !== -1) sentence = sentence.slice(0, stop + 1).trim();
  if (sentence && !/[.!?]$/.test(sentence)) sentence += ".";
  if (sentence.length < 12 || sentence.length > 180) throw Error("The model did not return one usable sentence.");
  return sentence;
}

export async function requestRandomSentence(env, request = requestTextModel) {
  if (!env.NEBIUS_API_KEY) throw Error("NEBIUS_API_KEY is required in .env.");
  if (!env.NEBIUS_TEXT_MODEL) throw Error("NEBIUS_TEXT_MODEL is required in .env.");
  const response = await request(`${(env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.NEBIUS_TEXT_MODEL,
      temperature: 1,
      max_tokens: 80,
      messages: [
        { role: "system", content: "You write one sentence for a video-game item prompt. Return only that sentence." },
        { role: "user", content: SENTENCE_PROMPT },
      ],
    }),
  });
  if (!response.ok) throw Error(`Token Factory text request failed (${response.status}).`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Error("Token Factory returned no sentence.");
  return cleanSentence(content);
}

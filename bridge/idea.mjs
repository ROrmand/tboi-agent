import { requestTextModel } from "./network.mjs";

const MECHANICAL_CUES = /\b(?:damage|tear(?:s)?|luck|speed|range|shot|heart|bomb(?:s)?|laser(?:s)?|knife|aura|familiar|enemy|room|pickup|coin|key|stat|poison|burn|slow|fear|explosive|confusion|knockback|grant|spawn|clear|fire|hit|kill|collision|flying)\b/i;

export function isUnderspecifiedIdea(value) {
  const words = String(value ?? "").trim().match(/[\p{L}\p{N}]+/gu) || [];
  return words.length <= 24 && !MECHANICAL_CUES.test(words.join(" "));
}

export function cleanIdeaBrief(value) {
  const brief = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^['\"]+|['\"]+$/g, "")
    .trim();
  if (brief.length < 24 || brief.length > 360) throw Error("The model did not return a usable expanded idea.");
  return brief;
}

export async function expandIdea(prompt, capabilities, env, request = requestTextModel) {
  if (!env.NEBIUS_API_KEY) throw Error("NEBIUS_API_KEY is required in .env.");
  if (!env.NEBIUS_TEXT_MODEL) throw Error("NEBIUS_TEXT_MODEL is required in .env.");
  const catalog = [
    `systems: ${capabilities.systems.join(", ")}`,
    `tear flags: ${capabilities.tear_flags.join(", ")}`,
    `actions: ${capabilities.actions.join(", ")}`,
    `heart rewards: ${Object.keys(capabilities.heart_rewards).join(", ")}`,
    `auras: ${capabilities.auras.join(", ")}`,
    `bomb effects: ${Object.keys(capabilities.bomb_flag_effects).join(", ")}`,
  ].join("; ");
  const response = await request(`${(env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.NEBIUS_TEXT_MODEL,
      temperature: 0.9,
      max_tokens: 140,
      messages: [
        { role: "system", content: `Expand a sparse Binding of Isaac passive-item idea into one compact creative brief. Preserve its theme and choose two or three distinct mechanics from this catalog: ${catalog}. Use only these catalog terms for mechanics. Do not add unsupported abilities, active items, synergies, weapons, parameters, Lua, callbacks, costumes, or sounds. Return only one paragraph under 360 characters.` },
        { role: "user", content: `Sparse idea: ${prompt}` },
      ],
    }),
  });
  if (!response.ok) throw Error(`Token Factory idea expansion failed (${response.status}).`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Error("Token Factory returned no expanded idea.");
  return cleanIdeaBrief(content);
}

export async function buildDesignPrompt(prompt, capabilities, env, request = requestTextModel) {
  if (!isUnderspecifiedIdea(prompt)) return { designPrompt: prompt, ideaBrief: null };
  const ideaBrief = await expandIdea(prompt, capabilities, env, request);
  return {
    ideaBrief,
    designPrompt: `Original idea: ${prompt}\nExpanded design brief: ${ideaBrief}\nUse the expanded brief as the requested mechanics; the original idea supplies its theme.`,
  };
}

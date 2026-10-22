import { chatCompletionPayload, requestTextModel } from "./network.mjs";

export const DEFAULT_PLANNER_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
const PLANNER_TIMEOUT_MS = 15000;
const HIT_TRIGGERS = new Set(["player_hurt", "enemy_hit"]);
const STAT_NAMES = ["damage", "tears", "shot_speed", "range", "speed", "luck"];

export function plannerModel(env = {}) {
  const configured = typeof env.NEBIUS_PLANNER_MODEL === "string" ? env.NEBIUS_PLANNER_MODEL.trim() : "";
  return configured || DEFAULT_PLANNER_MODEL;
}

const MECHANICAL_CUES = /\b(?:damage|tear(?:s)?|luck|speed|range|shot|heart|bomb(?:s)?|laser(?:s)?|knife|aura|familiar|enemy|room|pickup|coin|key|stat|poison|burn|slow|fear|explosive|confusion|knockback|grant|spawn|clear|fire|hit|kill|collision|flying|spider|pooter|pill|card|battery|trinket|chest|continuum|boomerang|creep|wiggle)\b/i;

export function isUnderspecifiedIdea(value) {
  const words = String(value ?? "").trim().match(/[\p{L}\p{N}]+/gu) || [];
  return words.length > 0 && !MECHANICAL_CUES.test(words.join(" "));
}

export function cleanIdeaBrief(value) {
  const brief = String(value ?? "").split(/<\/think>/i).pop()
    .replace(/\s+/g, " ")
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^['\"]+|['\"]+$/g, "")
    .trim();
  if (/thinking process|let me think|^here(?:'s| is) (?:a|the) (?:thinking|reasoning)/i.test(brief)) {
    throw Error("The model returned reasoning instead of an expanded idea.");
  }
  if (brief.length < 24 || brief.length > 360) throw Error("The model did not return a usable expanded idea.");
  return brief;
}

export function fallbackIdeaBrief(prompt, capabilities, variation = "") {
  const theme = String(prompt).replace(/\s+/g, " ").trim().slice(0, 100);
  const options = [];
  if (capabilities.systems.includes("stats")) options.push("slightly raises Isaac's luck");
  if (capabilities.systems.includes("tears")) options.push("gives Isaac's tears a poison effect");
  if (capabilities.systems.includes("rules") && capabilities.actions.includes("spawn_pickup")) options.push("occasionally spawns a coin after a room clear");
  if (capabilities.systems.includes("aura") && capabilities.auras.includes("slow")) options.push("surrounds Isaac with a small slowing aura");
  const seed = Array.from(`${theme}:${variation}`).reduce((total, character) => total + character.charCodeAt(0), 0);
  const effects = options.length ? [options[seed % options.length], options[(seed + 1) % options.length]].filter((effect, index, list) => index === 0 || effect !== list[0]) : [];
  if (!effects.length) throw Error("No safe fallback mechanic is available.");
  return `A passive item inspired by "${theme}" ${effects.join(" and ")}.`;
}

function listed(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function ensure(list, name) {
  if (name && !list.includes(name)) list.push(name);
}

export function parseCatalogPlan(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) return content;
  const text = String(content ?? "").split(/<\/think>/i).pop().trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw Error("Catalog planner returned no JSON object.");
  try { return JSON.parse(source.slice(start, end + 1)); }
  catch { throw Error("Catalog planner returned invalid JSON."); }
}

export function normalizeCatalogPlan(plan, capabilities) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw Error("Catalog planner returned no plan.");
  const allowedSystems = new Set(capabilities.systems || []);
  const requested = unique(listed(plan.systems).filter((name) => allowedSystems.has(name)));
  const tearFlags = unique(listed(plan.tear_flags ?? plan.flags).filter((name) => (capabilities.tear_flags || []).includes(name))).slice(0, 2);
  let trigger = (capabilities.triggers || []).includes(plan.trigger) ? plan.trigger : null;
  let action = (capabilities.actions || []).includes(plan.action) ? plan.action : null;
  let pickup = (capabilities.pickup_types || []).includes(plan.pickup_type) ? plan.pickup_type : null;
  let friendly = (capabilities.friendlies || []).includes(plan.friendly_type) ? plan.friendly_type : null;
  let stat = STAT_NAMES.includes(plan.stat) ? plan.stat : null;
  const aura = (capabilities.auras || []).includes(plan.aura) ? plan.aura : null;
  const familiar = (capabilities.familiars || []).includes(plan.familiar) ? plan.familiar : null;
  let actionStat = null;
  if (!action || !trigger) {
    action = null;
    trigger = null;
    pickup = null;
    friendly = null;
  } else if (action === "spawn_pickup") {
    pickup = pickup || "coin";
    friendly = null;
  } else if (action === "spawn_friendly") {
    friendly = friendly || "spider";
    pickup = null;
  } else if (action === "grant_stat") {
    actionStat = stat || "luck";
    stat = null;
    pickup = null;
    friendly = null;
  } else {
    pickup = null;
    friendly = null;
  }
  const ordered = [];
  if (action) ensure(ordered, HIT_TRIGGERS.has(trigger) ? "on_hit" : "rules");
  if (tearFlags.length) ensure(ordered, "tears");
  if (aura) ensure(ordered, "aura");
  if (familiar) ensure(ordered, "familiar");
  if (stat) ensure(ordered, "stats");
  for (const name of requested) ensure(ordered, name);
  const systems = ordered.filter((name) => allowedSystems.has(name)).slice(0, 3);
  const normalized = {
    systems,
    tear_flags: systems.includes("tears") ? tearFlags : [],
    trigger: systems.includes("rules") || systems.includes("on_hit") ? trigger : null,
    action: systems.includes("rules") || systems.includes("on_hit") ? action : null,
    pickup_type: null,
    friendly_type: null,
    stat: systems.includes("stats") ? stat : null,
    action_stat: null,
    aura: systems.includes("aura") ? aura : null,
    familiar: systems.includes("familiar") ? familiar : null,
  };
  if (normalized.action === "spawn_pickup") normalized.pickup_type = pickup;
  if (normalized.action === "spawn_friendly") normalized.friendly_type = friendly;
  if (normalized.action === "grant_stat") normalized.action_stat = actionStat;
  const concrete = normalized.tear_flags.length || normalized.stat || normalized.aura || normalized.familiar || normalized.action;
  if (!concrete) throw Error("Catalog planner chose no supported mechanics.");
  return normalized;
}

function actionPhrase(plan, capabilities) {
  const reward = capabilities.heart_rewards?.[plan.action];
  if (reward?.label) return `grants a ${reward.label}`;
  if (plan.action === "grant_soul_hearts") return "grants a soul heart";
  if (plan.action === "spawn_pickup") return `spawns a ${plan.pickup_type || "coin"}`;
  if (plan.action === "spawn_friendly") return `spawns a ${plan.friendly_type || "spider"}`;
  if (plan.action === "grant_stat") return `grants ${plan.action_stat || "luck"}`;
  return String(plan.action || "").replaceAll("_", " ");
}

export function describeCatalogPlan(prompt, plan, capabilities) {
  const theme = String(prompt).replace(/\s+/g, " ").trim().slice(0, 80);
  const parts = [];
  if (plan.tear_flags.length) parts.push(`gives tears ${plan.tear_flags.join(" and ")}`);
  if (plan.stat) parts.push(`slightly changes ${plan.stat.replaceAll("_", " ")}`);
  if (plan.aura) parts.push(`adds a ${plan.aura} aura`);
  if (plan.familiar) parts.push(`adds a ${plan.familiar} familiar`);
  if (plan.action && plan.trigger) parts.push(`on ${plan.trigger.replaceAll("_", " ")}, ${actionPhrase(plan, capabilities)}`);
  if (!parts.length) throw Error("Catalog planner chose no supported mechanics.");
  return cleanIdeaBrief(`A passive item inspired by "${theme}" ${parts.join(" and ")}.`);
}

export async function expandIdea(prompt, capabilities, env, request = requestTextModel) {
  if (!env.NEBIUS_API_KEY) throw Error("NEBIUS_API_KEY is required in .env.");
  const catalog = [
    `systems: ${(capabilities.systems || []).join(", ")}`,
    `tear_flags: ${(capabilities.tear_flags || []).join(", ")}`,
    `triggers: ${(capabilities.triggers || []).join(", ")}`,
    `actions: ${(capabilities.actions || []).join(", ")}`,
    `stats: ${STAT_NAMES.join(", ")}`,
    `auras: ${(capabilities.auras || []).join(", ")}`,
    `familiars: ${(capabilities.familiars || []).join(", ")}`,
    capabilities.pickup_types ? `pickups: ${capabilities.pickup_types.join(", ")}` : "",
    capabilities.friendlies ? `friendlies: ${capabilities.friendlies.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  const response = await request(`${(env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(chatCompletionPayload(env, {
      model: plannerModel(env),
      temperature: 0.2,
      max_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Choose supported Binding of Isaac passive mechanics for a flavor idea. The player does not know the catalog, so infer one or two effects. Return only JSON with keys systems, tear_flags, trigger, action, pickup_type, friendly_type, stat, aura, and familiar. Use catalog ids or empty strings. Do not write names, flavor, parameters, Lua, or unsupported effects. Catalog: ${catalog}.` },
        { role: "user", content: `Flavor idea: ${prompt}` },
      ],
    })),
    timeoutMs: PLANNER_TIMEOUT_MS,
  });
  if (!response.ok) throw Error(`Token Factory catalog planner failed (${response.status}).`);
  const body = await response.json();
  if (body.choices?.[0]?.finish_reason === "length") throw Error("Catalog planner was truncated.");
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Error("Token Factory returned no catalog plan.");
  return describeCatalogPlan(prompt, normalizeCatalogPlan(parseCatalogPlan(content), capabilities), capabilities);
}

export async function buildDesignPrompt(prompt, capabilities, env, request = requestTextModel, variation = "") {
  if (!isUnderspecifiedIdea(prompt)) return { designPrompt: prompt, ideaBrief: null };
  let ideaBrief;
  try { ideaBrief = await expandIdea(prompt, capabilities, env, request); }
  catch (error) {
    console.warn(`Using a catalog-bounded idea after expansion failed: ${error.message}`);
    ideaBrief = fallbackIdeaBrief(prompt, capabilities, variation);
  }
  return {
    ideaBrief,
    designPrompt: `Original idea: ${prompt}\nExpanded design brief: ${ideaBrief}\nVariation seed: ${variation}\nUse the expanded brief as the requested mechanics; the original idea supplies its theme.`,
  };
}

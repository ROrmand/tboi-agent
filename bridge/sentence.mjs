import { randomInt } from "node:crypto";
import { requestTextModel } from "./network.mjs";

const SENTENCE_PROMPT = "Write one ordinary sentence describing a strange object someone might wish for. Do not name stats, effects, or an item title. No quotation marks. No second sentence.";
const OBJECTS = [
  "a moth-eaten sock",
  "a cracked church bell",
  "a baby's tooth in a matchbox",
  "a grocery receipt from a store that never existed",
  "a rubber duck with too many teeth",
  "a motel bible with extra handwritten pages",
  "a ball of hair and tinfoil",
  "a melted action figure",
  "a Polaroid of an empty hallway",
  "a key that fits no lock",
  "a jar of pickle brine",
  "a single wet match",
  "a cracked denture",
  "a lump of pink soap",
  "a bird skeleton in a mint tin",
  "a funeral program with the name scratched out",
];
const SETTINGS = [
  "in a flooded basement",
  "behind a vending machine",
  "under a church pew",
  "in a hospital waiting room",
  "inside a lunchbox",
  "at the bottom of a well",
  "in a pawn-shop drawer",
  "taped under a school desk",
  "in a freezer behind the peas",
  "on a rest-stop bathroom sink",
  "in a cardboard box marked FRAGILE",
  "among lost-and-found umbrellas",
];
const DETAILS = [
  "sticky",
  "too warm",
  "colder than ice",
  "heavier than it looks",
  "smelling like pennies",
  "chalky",
  "greasy",
  "brittle",
  "wet on one side only",
  "dusty in a way that will not wipe off",
  "slightly vibrating",
  "ringing when nobody touches it",
];

export function pickSentenceSeed(random = randomInt) {
  return {
    object: OBJECTS[random(OBJECTS.length)],
    setting: SETTINGS[random(SETTINGS.length)],
    detail: DETAILS[random(DETAILS.length)],
  };
}

export function buildSentencePrompt(seed = pickSentenceSeed()) {
  return `${SENTENCE_PROMPT} Object: ${seed.object}. Setting: ${seed.setting}. Sensory detail: ${seed.detail}. Write about that object; do not substitute a generic glowing trinket.`;
}

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
        { role: "system", content: "You write one sentence for a video-game item prompt. Use the given object, setting, and sensory detail. Return only that sentence." },
        { role: "user", content: buildSentencePrompt() },
      ],
    }),
  });
  if (!response.ok) throw Error(`Token Factory text request failed (${response.status}).`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Error("Token Factory returned no sentence.");
  return cleanSentence(content);
}

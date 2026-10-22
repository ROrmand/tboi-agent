import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const WORD_LISTS = ["adjectives", "nouns", "verbs", "adverbs", "prepositions", "places"];
let words;
const recentIdeas = [];

function loadWords(name) {
  const file = path.join(import.meta.dirname, "words", `${name}.txt`);
  const entries = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!entries.length) throw Error(`Word list ${name} is empty.`);
  return entries;
}

export function wordLists() {
  if (!words) words = Object.fromEntries(WORD_LISTS.map((name) => [name, loadWords(name)]));
  return words;
}

export function articleFor(word) {
  return /^[aeiou]/i.test(String(word)) ? "an" : "a";
}

export function conjugateVerb(verb) {
  if (/(?:s|sh|ch|x|z|o)$/i.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/i.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

function pick(list, random) {
  return list[random(list.length)];
}

function capitalize(sentence) {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function generateSentence(random = randomInt) {
  const lists = wordLists();
  const adjective = pick(lists.adjectives, random);
  const noun = pick(lists.nouns, random);
  const verb = conjugateVerb(pick(lists.verbs, random));
  const pattern = random(3);
  let sentence;
  if (pattern === 0) {
    sentence = `${articleFor(adjective)} ${adjective} ${noun} ${verb} ${pick(lists.prepositions, random)} the ${pick(lists.places, random)}.`;
  } else if (pattern === 1) {
    sentence = `the ${adjective} ${noun} ${verb} ${pick(lists.adverbs, random)}.`;
  } else {
    let otherNoun = pick(lists.nouns, random);
    if (otherNoun === noun) otherNoun = lists.nouns[(lists.nouns.indexOf(noun) + 1) % lists.nouns.length];
    const otherAdjective = pick(lists.adjectives, random);
    sentence = `${articleFor(adjective)} ${adjective} ${noun} ${verb} ${pick(lists.adverbs, random)} ${pick(lists.prepositions, random)} ${articleFor(otherAdjective)} ${otherAdjective} ${otherNoun}.`;
  }
  return capitalize(sentence);
}

export function cleanSentence(value) {
  if (typeof value !== 'string') throw Error("The model did not return one usable sentence.");
  const answer = value.split(/<\/think>/i).pop();
  if (/<\/?(?:think|analysis|reasoning)\b|```|^[\s]*[\[{]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i.test(answer)) {
    throw Error("The model returned reasoning or structured output instead of an item idea.");
  }
  const line = answer.split(/\r?\n/).map((part) => part.trim()).find(Boolean) || "";
  let sentence = line.replace(/^[-*\d.)\s]+/, "").replace(/^["']+|["']+$/g, "").replace(/\s+/g, " ").trim();
  const stop = sentence.search(/[.!?]["']?(?:\s|$)/);
  if (stop !== -1) sentence = sentence.slice(0, stop + 1).trim();
  if (sentence && !/[.!?]$/.test(sentence)) sentence += ".";
  if (/thinking process|let me think|^here(?:'s| is) (?:a|the) (?:thinking|reasoning)|^(?:sure|certainly)\b|^i (?:will|need to|should)\b/i.test(sentence)) {
    throw Error("The model returned reasoning instead of an item idea.");
  }
  if (sentence.length < 12 || sentence.length > 180) throw Error("The model did not return one usable sentence.");
  return sentence;
}

export async function requestRandomSentence(env = process.env, fetchImpl = fetch) {
  let sentence;
  if (env.INSPIRATION_BACKEND === 'local' && env.INSPIRATION_MODEL) {
    const configured = Number(env.INSPIRATION_TIMEOUT_MS || 2500);
    const timeout = Number.isFinite(configured) ? Math.max(100, Math.min(5000, configured)) : 2500;
    const controller = new AbortController();
    let timer;
    try {
      const request = async () => {
        const endpoint = (env.INSPIRATION_BASE_URL || 'http://127.0.0.1:11434/v1/').replace(/\/$/, '') + '/chat/completions';
        const response = await fetchImpl(endpoint, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: env.INSPIRATION_MODEL, temperature: 1, max_tokens: 80, messages: [
            { role: 'system', content: 'Write one short, unusual object or creature idea for a fantasy game item. Return one editable sentence under 180 characters. No explanation, reasoning, list, or code.' },
            { role: 'user', content: 'Find a new idea. Avoid these recent ideas: ' + recentIdeas.slice(-5).join(' | ') },
          ] }),
        });
        if (!response.ok) throw Error('Inspiration model unavailable.');
        const body = await response.json();
        const result = cleanSentence(body.choices?.[0]?.message?.content);
        if (recentIdeas.includes(result)) throw Error('Repeated inspiration.');
        return result;
      };
      sentence = await Promise.race([request(), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Error('Inspiration deadline reached.')); }, timeout);
      })]);
    } catch {
      sentence = undefined;
    } finally { clearTimeout(timer); }
  }
  if (!sentence) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      sentence = generateSentence();
      if (!recentIdeas.includes(sentence)) break;
    }
  }
  recentIdeas.push(sentence);
  if (recentIdeas.length > 20) recentIdeas.shift();
  return sentence;
}

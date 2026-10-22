import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const WORD_LISTS = ["adjectives", "nouns", "verbs", "adverbs", "prepositions", "places"];
let words;

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
  const answer = String(value ?? "").split(/<\/think>/i).pop();
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

export async function requestRandomSentence() {
  return generateSentence();
}

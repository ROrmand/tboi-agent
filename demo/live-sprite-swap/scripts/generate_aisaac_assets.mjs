import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const colors = ["#9A9AA3", "#3DDC64", "#4C7CFF", "#B44CFF", "#FFD52A"];

function generatorSvg(color) {
  // Collectible icons are rendered very small on a pedestal.  The first
  // generator art was a dark question-mark disk, which read as an empty
  // pedestal against cellar floors.  Keep this deliberately chunky and give
  // every quality a bright screen plus an unmistakable power coil.
  return `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect x="8" y="1" width="16" height="2" fill="#1a171c"/>
    <rect x="11" y="0" width="10" height="2" fill="${color}"/>
    <rect x="4" y="5" width="24" height="20" fill="#100e12"/>
    <rect x="2" y="8" width="28" height="14" fill="#100e12"/>
    <rect x="4" y="5" width="24" height="2" fill="#e9e5e9"/>
    <rect x="2" y="8" width="2" height="14" fill="#e9e5e9"/>
    <rect x="28" y="8" width="2" height="14" fill="#5b5560"/>
    <rect x="4" y="23" width="24" height="2" fill="#4a454e"/>
    <rect x="5" y="7" width="22" height="16" fill="#29252d"/>
    <rect x="7" y="9" width="18" height="10" fill="#080a0c"/>
    <rect x="8" y="10" width="16" height="8" fill="${color}"/>
    <rect x="9" y="11" width="14" height="2" fill="#ffffff" opacity=".85"/>
    <rect x="9" y="13" width="14" height="4" fill="${color}"/>
    <rect x="5" y="7" width="2" height="2" fill="${color}"/>
    <rect x="25" y="7" width="2" height="2" fill="${color}"/>
    <rect x="5" y="19" width="2" height="2" fill="${color}"/>
    <rect x="25" y="19" width="2" height="2" fill="${color}"/>
    <rect x="12" y="25" width="8" height="2" fill="#e9e5e9"/>
    <rect x="10" y="27" width="12" height="2" fill="#1a171c"/>
    <rect x="12" y="29" width="2" height="2" fill="${color}"/>
    <rect x="18" y="29" width="2" height="2" fill="${color}"/>
    <rect x="14" y="28" width="4" height="4" fill="#e9e5e9"/>
  </svg>`;
}

function singularityTerminalSvg() {
  return `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="3" width="20" height="26" rx="3" fill="#27313c" stroke="#9ad6ff" stroke-width="2"/>
    <rect x="7" y="6" width="14" height="9" rx="1" fill="#101923" stroke="#7bf0ff"/>
    <circle cx="14" cy="10.5" r="3.5" fill="#efc750" stroke="#fff4b0"/><path d="M14 7.7v5.6M11.2 10.5h5.6" stroke="#613f17" stroke-width="1.2"/>
    <circle cx="10" cy="20" r="1.5" fill="#ff5e83"/><circle cx="15" cy="20" r="1.5" fill="#58e88a"/><circle cx="20" cy="20" r="1.5" fill="#77b9ff"/>
    <path d="M24 8h3v13h-3" fill="none" stroke="#d6d6df" stroke-width="2"/><circle cx="27" cy="22" r="2" fill="#efc750"/>
  </svg>`;
}

const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  s: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  a: ["00000", "01110", "00001", "01111", "10001", "10001", "01111"],
  c: ["00000", "01110", "10001", "10000", "10001", "10001", "01110"],
};

function nameSvg() {
  const scale = 3;
  const gap = 2;
  const letters = "AIsaac";
  const width = letters.length * (5 * scale + gap) - gap;
  const height = 7 * scale;
  const originX = Math.round((160 - width) / 2);
  const originY = Math.round((32 - height) / 2);
  const rects = [];
  for (let index = 0; index < letters.length; index += 1) {
    const rows = glyphs[letters[index]];
    rows.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit !== "1") return;
        const left = originX + index * (5 * scale + gap) + x * scale;
        const top = originY + y * scale;
        rects.push(`<rect x="${left}" y="${top}" width="${scale}" height="${scale}" fill="#ffffff"/>`);
      });
    });
  }
  return `<svg width="160" height="32" xmlns="http://www.w3.org/2000/svg">${rects.join("")}</svg>`;
}

function techXLensSvg() {
  return `<svg width="256" height="32" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="8" width="18" height="9" fill="#22bff0"/>
    <rect x="37" y="8" width="18" height="9" fill="#22bff0"/>
  </svg>`;
}

export async function applyTechXLens(source, destination = source) {
  const image = sharp(source);
  const { width, height } = await image.metadata();
  const result = !width || !height || width < 55 || height < 17
    ? image.png()
    : image.composite([{ input: Buffer.from(techXLensSvg()) }]).png();
  if (path.resolve(source) === path.resolve(destination)) return writeFile(destination, await result.toBuffer());
  return result.toFile(destination);
}

export async function prepareGeneratorIcons(target = root) {
  const directory = path.join(path.resolve(target), "resources/gfx/items/collectibles");
  await mkdir(directory, { recursive: true });
  for (const [quality, color] of colors.entries()) {
    await sharp(Buffer.from(generatorSvg(color))).png().toFile(path.join(directory, "generator_q" + quality + ".png"));
  }
}

export async function prepareAIsaacAssets(source, target = root) {
  if (!source) throw Error("Provide --source pointing to extracted game resources (the directory containing gfx).");
  const sourceRoot = path.resolve(source);
  const sourceBody = path.join(sourceRoot, "gfx/characters/costumes/character_001_isaac_grey.png");
  const sourcePortrait = path.join(sourceRoot, "gfx/ui/stage/playerportrait_isaac.png");
  const sourceGoggles = path.join(sourceRoot, "gfx/characters/costumes/costume_395_techx.png");
  const animation = await readFile(path.join(sourceRoot, "gfx/characters/395_techx.anm2"), "utf8");
  await Promise.all([sharp(sourceBody).metadata(), sharp(sourcePortrait).metadata(), sharp(sourceGoggles).metadata()]);
  const resources = path.join(target, "resources/gfx");
  for (const directory of ["characters/costumes", "ui/stage", "ui/boss", "items/collectibles"]) {
    await mkdir(path.join(resources, directory), { recursive: true });
  }
  const costume = animation.replace(/costumes[\\/]costume_395_techx\.png/gi, "costumes/costume_aisaac_techx.png");
  if (costume === animation) throw Error("Tech X animation did not reference the expected vanilla spritesheet.");
  await copyFile(sourceBody, path.join(resources, "characters/costumes/character_aisaac.png"));
  await applyTechXLens(sourceGoggles, path.join(resources, "characters/costumes/costume_aisaac_techx.png"));
  await writeFile(path.join(resources, "characters/aisaac_techx.anm2"), costume);
  await sharp(sourcePortrait).grayscale().png().toFile(path.join(resources, "ui/stage/playerportrait_aisaac.png"));
  await prepareGeneratorIcons(target);
  await sharp(Buffer.from(singularityTerminalSvg())).png().toFile(path.join(resources, "items/collectibles/singularity_terminal.png"));
  await sharp(Buffer.from(nameSvg())).png().toFile(path.join(resources, "ui/boss/playername_aisaac.png"));
}

export async function prepareSingularityTerminal(target = root) {
  const directory = path.join(path.resolve(target), "resources/gfx/items/collectibles");
  await mkdir(directory, { recursive: true });
  await sharp(Buffer.from(singularityTerminalSvg())).png().toFile(path.join(directory, "singularity_terminal.png"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes("--generators-only")) {
    const targetIndex = process.argv.indexOf("--target");
    await prepareGeneratorIcons(targetIndex >= 0 ? process.argv[targetIndex + 1] : root);
    console.log("Prepared the five Generator collectible icons.");
    process.exit(0);
  }
  if (process.argv.includes("--singularity-icon-only")) {
    const targetIndex = process.argv.indexOf("--target");
    await prepareSingularityTerminal(targetIndex >= 0 ? process.argv[targetIndex + 1] : root);
    console.log("Prepared the Singularity Terminal icon.");
    process.exit(0);
  }
  const sourceIndex = process.argv.indexOf("--source");
  await prepareAIsaacAssets(sourceIndex >= 0 ? process.argv[sourceIndex + 1] : undefined);
  console.log("Prepared AIsaac from local vanilla sprites, Tech X goggles, portrait, name plate, and five Generator icons.");
}

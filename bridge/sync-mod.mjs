import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Isaac loads these at startup. Generated art and save data stay in the
// installed mod directory and are not part of this copy.
export const MOD_FILES = [
  "main.lua",
  "nebius_prompt.lua",
  "metadata.xml",
  "content/items.xml",
  "content/players.xml",
  "content/costumes2.xml",
  "content/sounds.xml",
  "content/entities2.xml",
  "content/gfx/characterportraits.anm2",
  "content/gfx/characterportraits.png",
  "content/gfx/charactermenu.anm2",
  "content/gfx/charactermenu.png",
  "resources/gfx/nebius_creator/white.png",
  "resources/gfx/ui/boss/nebius_creator_name.png",
  "resources/gfx/ui/boss/playername_aisaac.png",
  "resources/gfx/ui/stage/playerportrait_aisaac.png",
  "resources/gfx/characters/costumes/character_aisaac.png",
  "resources/gfx/characters/aisaac_techx.anm2",
  "resources/gfx/characters/creator_angel.anm2",
  "resources/gfx/characters/costumes/costume_creator_angel.png",
  "resources/gfx/characters/costumes/costume_aisaac_techx.png",
  "resources/gfx/items/collectibles/ember_orb.png",
  "resources/gfx/items/collectibles/generator_q0.png",
  "resources/gfx/items/collectibles/generator_q1.png",
  "resources/gfx/items/collectibles/generator_q2.png",
  "resources/gfx/items/collectibles/generator_q3.png",
  "resources/gfx/items/collectibles/generator_q4.png",
  "resources/gfx/items/collectibles/singularity_terminal.png",
];

export async function syncMod(source, target) {
  const from = path.resolve(source);
  const to = path.resolve(target);
  if (from.toLowerCase() === to.toLowerCase()) return { copied: [], skipped: true };
  const copied = [];
  for (const relative of MOD_FILES) {
    const destination = path.join(to, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(from, relative), destination);
    copied.push(relative);
  }
  return { copied, skipped: false };
}

export async function installedModDirectory(env = process.env) {
  const fileEnv = await readEnv(path.join(root, ".env"));
  const configured = env.ISAAC_MOD_DIRECTORY || fileEnv.ISAAC_MOD_DIRECTORY;
  return configured
    ? path.resolve(root, configured)
    : path.join(root, "demo", "live-sprite-swap");
}

async function readEnv(file) {
  const values = {};
  try {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index > 0 && !line.trimStart().startsWith("#")) values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return values;
}

if (process.argv[1]?.endsWith("sync-mod.mjs")) {
  const source = path.join(root, "demo", "live-sprite-swap");
  const target = await installedModDirectory();
  const result = await syncMod(source, target);
  if (result.skipped) console.log("Isaac mod directory is the repository copy. Nothing to copy.");
  else console.log(`Updated ${result.copied.length} mod files at ${target}. Restart Isaac to load Lua changes.`);
}

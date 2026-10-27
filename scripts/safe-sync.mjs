import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installedModDirectory, MOD_FILES, syncMod } from "../bridge/sync-mod.mjs";

const root = path.resolve(import.meta.dirname, "..");
const detailLimit = 50;

async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function protectedSnapshot(target) {
  const hashes = new Map();
  const allowed = new Set(MOD_FILES.map(file => file.toLowerCase()));
  async function walk(relative = "") {
    let entries;
    try {
      entries = await readdir(path.join(target, relative), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" && !relative) return;
      throw error;
    }
    for (const entry of entries) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Refusing symlink in mod directory: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else if (!allowed.has(file.toLowerCase())) hashes.set(file, await digest(path.join(target, file)));
    }
  }
  await walk();
  return hashes;
}

export function protectedChanges(before, after) {
  const details = [];
  let count = 0;
  for (const file of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(file) === after.get(file)) continue;
    count++;
    if (details.length < detailLimit) details.push({ path: file, before: before.get(file) ?? null, after: after.get(file) ?? null });
  }
  return { protected_change_count: count, protected_changes: details, details_truncated: count > details.length };
}

export async function safeSync(source, target) {
  const before = await protectedSnapshot(target);
  const result = await syncMod(source, target);
  const after = await protectedSnapshot(target);
  const mismatches = [];
  for (const file of MOD_FILES) {
    if (await digest(path.join(source, file)) !== await digest(path.join(target, file))) mismatches.push(file);
  }
  return {
    recorded_at: new Date().toISOString(), target: path.resolve(target),
    copied: result.copied, skipped: result.skipped, protected_count: before.size,
    ...protectedChanges(before, after), source_mismatches: mismatches,
  };
}

export async function runSafeSync() {
  const receipt = await safeSync(path.join(root, "demo", "live-sprite-swap"), await installedModDirectory());
  const directory = path.join(root, "work");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "sync-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.protected_change_count || receipt.source_mismatches.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runSafeSync();

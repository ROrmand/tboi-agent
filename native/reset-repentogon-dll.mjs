import { access, copyFile, cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const env = { ...await readEnv(path.join(root, ".env")), ...process.env };
const buildDirectory = env.REPENTOGON_BUILD_DIRECTORY
  ? path.resolve(root, env.REPENTOGON_BUILD_DIRECTORY)
  : path.join(root, ".reference-repentogon", "build-win32-nebius-current", "Release");
const repentogonDirectory = env.REPENTOGON_DIRECTORY
  ? path.resolve(root, env.REPENTOGON_DIRECTORY)
  : path.join(path.dirname(path.dirname(env.ISAAC_MOD_DIRECTORY || "")), "Repentogon");
const runtimeFiles = ["zhlREPENTOGON.dll", "libzhl.dll", "zhlLoader.dll", "Lua5.3.3r.dll", "freetype.dll"];
const runtimeDirectories = ["resources", "resources-repentogon"];

if (!process.platform.startsWith("win")) throw Error("The REPENTOGON DLL reset command runs only on Windows.");
if (!env.ISAAC_MOD_DIRECTORY && !env.REPENTOGON_DIRECTORY) {
  throw Error("Set ISAAC_MOD_DIRECTORY or REPENTOGON_DIRECTORY in .env before resetting the DLL.");
}
await Promise.all([
  ...runtimeFiles.flatMap((file) => [access(path.join(buildDirectory, file)), access(path.join(repentogonDirectory, file))]),
  ...runtimeDirectories.flatMap((directory) => [access(path.join(buildDirectory, directory)), access(path.join(repentogonDirectory, directory))]),
]);

const [sourceBytes, running] = await Promise.all([readFile(path.join(buildDirectory, "zhlREPENTOGON.dll")), isaacRunning()]);
if (!containsBridgeBinding(sourceBytes)) throw Error(`The build DLL lacks the NebiusBridge binding: ${buildDirectory}`);
if (running) throw Error("Close Isaac before resetting REPENTOGON, then run this command again.");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const backupDirectory = path.join(repentogonDirectory, `nebius-bridge-backup-${stamp}`);
await mkdir(backupDirectory);
try {
  for (const file of runtimeFiles) await copyFile(path.join(repentogonDirectory, file), path.join(backupDirectory, file));
  for (const directory of runtimeDirectories) {
    const destination = path.join(repentogonDirectory, directory);
    const backup = path.join(backupDirectory, directory);
    await rename(destination, backup);
    // The build output only contains REPENTOGON's changed scripts and assets.
    // Keep the installed game's packed archives and base resources as well.
    await cp(backup, destination, { recursive: true });
  }
  for (const file of runtimeFiles) await copyFile(path.join(buildDirectory, file), path.join(repentogonDirectory, file));
  for (const directory of runtimeDirectories) await cp(path.join(buildDirectory, directory), path.join(repentogonDirectory, directory), { recursive: true });
} catch (error) {
  await restore(backupDirectory);
  throw error;
}
if (!containsBridgeBinding(await readFile(path.join(repentogonDirectory, "zhlREPENTOGON.dll")))) {
  await restore(backupDirectory);
  throw Error("Reset DLL verification failed; restored the previous runtime set.");
}
for (const essential of ["packed/graphics.a", "packed/config.a", "scripts/main.lua"]) {
  try { await access(path.join(repentogonDirectory, "resources", essential)); }
  catch {
    await restore(backupDirectory);
    throw Error(`Reset omitted a required game resource: ${essential}. Restored the previous runtime set.`);
  }
}
console.log(`Restored matching NebiusBridge runtime files and resources to ${repentogonDirectory}`);
console.log(`Previous runtime set backed up at ${backupDirectory}`);
console.log("Start Isaac through the REPENTOGON launcher. Run this command again after a REPENTOGON update if sentence delivery stops.");

function containsBridgeBinding(bytes) {
  return bytes.includes(Buffer.from("NebiusBridge", "utf8"))
    && bytes.includes(Buffer.from("nebius_isaac_bridge_v1", "utf16le"));
}

async function isaacRunning() {
  const { stdout } = await execFileAsync("tasklist", ["/FI", "IMAGENAME eq isaac-ng.exe", "/NH"]);
  return /isaac-ng\.exe/i.test(stdout);
}

async function restore(backupDirectory) {
  await Promise.all(runtimeFiles.map((file) => copyFile(path.join(backupDirectory, file), path.join(repentogonDirectory, file)).catch(() => {})));
  for (const directory of runtimeDirectories) {
    const destination = path.join(repentogonDirectory, directory);
    const backup = path.join(backupDirectory, directory);
    await rm(destination, { recursive: true, force: true }).catch(() => {});
    await rename(backup, destination).catch(() => {});
  }
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

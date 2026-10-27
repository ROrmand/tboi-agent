import { copyFile, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const bindingDirectory = path.join(import.meta.dirname, "repentogon-binding");
const bindingFiles = ["NebiusBridge.cpp", "NebiusBridge.h"];

export async function applyBinding(sourceDirectory, workspace = root) {
  const source = await realpath(sourceDirectory);
  const scratch = path.join(await realpath(workspace), "work");
  const relative = path.relative(scratch, source);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw Error("REPENTOGON_SOURCE must not be inside work/.");
  }
  const interfaces = path.join(source, "repentogon", "LuaInterfaces");
  await stat(path.join(source, "CMakeLists.txt"));
  await stat(path.join(interfaces, "LuaConsole.cpp"));
  if (await realpath(interfaces) !== interfaces) throw Error("LuaInterfaces must not be redirected by a symlink.");
  for (const file of bindingFiles) {
    const destination = path.join(interfaces, file);
    try {
      if (await realpath(destination) !== destination) throw Error(`Binding destination must not be a symlink: ${file}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await stat(path.join(bindingDirectory, file));
  }
  for (const file of bindingFiles) await copyFile(path.join(bindingDirectory, file), path.join(interfaces, file));
  return { source, copied: bindingFiles };
}

async function configuredSource() {
  let configured;
  try {
    const text = await readFile(path.join(root, ".env"), "utf8");
    configured = text.split(/\r?\n/).find(line => /^REPENTOGON_SOURCE\s*=/.test(line))?.split("=").slice(1).join("=").trim();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return path.resolve(root, process.env.REPENTOGON_SOURCE || configured || ".reference-repentogon");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await applyBinding(await configuredSource());
  console.log(`Applied ${result.copied.join(", ")} to ${result.source}`);
  console.log("Reconfigure CMake, then build REPENTOGON using its documented toolchain. No game files were changed.");
}

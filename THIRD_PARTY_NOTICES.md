# Third-party components

The game and its DLC are external, separately licensed prerequisites, not included in application ZIPs. REPENTOGON and the launcher are external prerequisites; modified native runtimes are downloaded only from a pinned release.

REPENTOGON identifies its license as GPL version 2. Its LibZHL components have separate MIT notices and exceptions; other native dependencies carry their own terms. The native distributor must preserve applicable notices and make the exact complete corresponding source/build inputs available with the release. Do not interpret this document as a substitute for those licenses.

The JavaScript project depends on sharp (Apache-2.0), whose packaged libvips/native dependencies have additional licenses distributed in their npm packages. Installation retains those package notices. Source development also uses wasmoon (MIT). Review package notices and dependencies before publishing.

ComfyUI, the SDXL Turbo checkpoint, and hosted model services are not bundled. Their software/model/service terms apply separately when selected.

The project's original Node, Lua, setup, and documentation work is distributed
under the MIT License in `LICENSE`. That license does not replace or relicense
REPENTOGON, its dependencies, ComfyUI, model checkpoints, the game, or hosted
services; their respective terms continue to apply.

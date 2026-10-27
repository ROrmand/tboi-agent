# Development

Use a source checkout and Node 24. Run `npm ci`, `npm run test:setup`, `npm test`, and `npm run validate`. Packaged tester ZIPs intentionally omit tests and developer tools.

The mod source remains `demo/live-sprite-swap`, not a newly renamed mod folder. `bridge/sync-mod.mjs` owns the fixed `MOD_FILES` allowlist. Do not copy the whole directory over an installed mod: that can replace user artwork or save state. Setup adds backups and preserves existing animations during slot preparation.

## Native binding

Only `NebiusBridge.cpp` and `.h` are maintained here. REPENTOGON source/builds stay external. See the source overlay instructions in `native/repentogon-binding/README.md` in a source checkout.

1. Obtain an external REPENTOGON checkout and its documented Windows Win32 compiler toolchain. Pin a tested upstream commit and initialize submodules.
2. Set `REPENTOGON_SOURCE` locally and run `npm run repentogon:apply-binding`. This copies the overlay, not the whole client.
3. Reconfigure CMake and compile Release. Keep all build output out of this repository.
4. On a disposable test installation, with Isaac closed and backups available, install the matching runtime via the existing developer workflow.
5. Verify the real game version, launcher path, native Poll/Ack delivery, placeholder-art generation, Continue, and cross-save behavior. Record actual results rather than inferring acceptance from mocks.

The setup CLI does not install an unpinned archive. Existing local runtime development can use the explicit exceptions in SETUP.md.

## Packaging

`npm run release:build -- --preview` creates a local ZIP and checksum without requiring a published native runtime. It never includes your .env, installed art, work/, external client checkout, node_modules, test output, or PDBs. The public build requires runtime/source pins and a project license. See RELEASING.md.

Production imports must remain resolvable from the staged ZIP. Test both `npm ci --omit=dev` and doctor/validation from an extracted clean package; source-tree success alone is insufficient.

# Release process

## Current gates

Public publication is intentionally blocked by `runtime: null`. The project is
licensed under MIT; native and third-party components retain their own terms.
Do not invent binary URLs, checksums, or acceptance results. A preview ZIP is
available independently. No fork, tag, commit, or release is created by local
verification.

Before the first beta:

1. Review licenses for bundled assets and dependencies; retain `LICENSE` and
   `THIRD_PARTY_NOTICES.md` in every application release.
2. Create a public REPENTOGON fork or otherwise publish the exact complete corresponding source, submodule pins, build instructions, notices, and modifications for the distributed native build. The local overlay alone is not the full corresponding source.
3. Build a compatible Win32 Release and verify it against the actual game. Do not redistribute Isaac executable, extracted packed game assets, or local signed binaries of unknown provenance.
4. Package the native runtime using the helper below. Publish it with matching source and applicable notices. Code signing and Windows security compatibility are separate checks.
5. Pin the generated runtime object in `release-manifest.json`, including the exact game executable SHA-256. Validate it on a clean Windows install.
6. Set both package.json and release-manifest.json to the intended version, for example 0.1.0-beta.1; refresh the lockfile.
7. Run all tests and the extracted-package smoke tests. Confirm one real generated pedestal, Continue, setup rerun, update, uninstall, rollback, and save/art preservation. Record missing live checks honestly.

## Native runtime packaging

From a source checkout:

```powershell
npm run runtime:package -- --build-directory "C:\external\REPENTOGON\build\Release" --isaac-executable "C:\game\isaac-ng.exe" --version "0.1.0" --url "https://github.com/OWNER/FORK/releases/download/v0.1.0/tboi-agent-repentogon-0.1.0-windows.zip" --source-url "https://github.com/OWNER/FORK/tree/EXACT_FORK_COMMIT" --upstream-commit "EXACT_40_CHARACTER_UPSTREAM_COMMIT"
```

Replace the example owner, commit and paths before running. This helper packages only approved runtime DLLs, hooks, and changed resource files, excludes packed archives/debug artifacts, and writes `dist/runtime-manifest.json`. Its contents become the manifest's `runtime` object. Source and notices must be provided alongside the native release; packaging is not legal review.

The supported native layout currently requires zhlREPENTOGON.dll, libzhl.dll, zhlLoader.dll, Lua5.3.3r.dll, and freetype.dll. A different upstream layout requires an explicit installer/manifest change and new tests, not silently guessed filenames.

## Application packaging

```powershell
npm ci
npm test
npm run release:build -- --preview
```

This creates a versioned Windows preview ZIP, checksum and per-file inventory. Staging uses the existing directory layout so imports work; it does not rename demo/ or native/ipc/. The staged package exposes only supported production commands. Existing archives are not overwritten; move a previous artifact before rebuilding.

To validate a release locally after all gates are resolved:

```powershell
npm run release:build -- --tag v0.1.0-beta.1
```

Tags must match both version fields. The builder validates metadata and files; the workflow runs tests first. Local maintainers must run npm test themselves before packaging. No public release is made by this command.

## GitHub automation

- Push/PR: CI runs npm ci, npm test, and a preview package build. No release or native installation occurs.
- Manual Build beta ZIP: tests and temporary downloadable Actions artifacts, retained 30 days.
- Version tag: tests, strict public-package gates, permanent GitHub Release ZIP/checksum. Versions containing a hyphen are marked prereleases.

Only after review, commit and push the intended release changes, then tag the exact tested commit:

```powershell
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

Native releases are independent; reuse a pinned native version for bridge/Lua-only changes. Do not use “latest” download URLs or overwrite released runtime assets. No automatic client updater is installed.

The manual **Build custom REPENTOGON preview** workflow is also provided. Supply the public fork/revision containing the exact reviewed binding, its upstream base, native version, and tested Isaac executable hash. It checks binding equality and ancestry, builds Win32, and uploads the native ZIP, manifest, upstream license, and complete recursive source archive as temporary artifacts. It never uploads the game executable and never publishes a native release automatically. Publish the reviewed artifacts together from the fork after checking build results, license notices, signing, and real-game acceptance. This workflow cannot be exercised locally as a hosted GitHub run.

# Native runtime milestones

Stage 1 uses the native renderer already provided by REPENTOGON, rather than
injecting another DLL or replacing the installed engine. This is an intentional
architecture correction: current REPENTOGON exposes procedural images,
render-to-image, source-region quads, and destination quads to Lua. Native
texture creation can therefore be exercised through those bindings first.

The installed environment inspected on October 10, 2026 is REPENTOGON 1.1.3,
Isaac Repentance+ v1.9.7.12.J273, with an OpenGL renderer. Its
`zhlREPENTOGON.dll` contains the `CreateImage`, `RenderToImage`, and
`NewFromRectangle` binding names. Runtime capability checks, not version
assumptions or those strings alone, decide whether the probe can start.

## Stage 1D: CreateImage + LoadImage-only probe

Implementation: `stage1/mod/`. This is a separate, opt-in mod named
`nebius_native_stage1`. It depends on the existing Live Sprite Swap Demo for
the preallocated **Live Profile Core** collectible ID. It declares no items,
changes no bridge protocol, and makes no model/API calls.

Prepare the static white 1x1 seed and install the new directory:

```powershell
npm run native:prepare -- --install "C:\Program Files (x86)\Steam\steamapps\common\The Binding of Isaac Rebirth\mods"
```

The installer refuses to overwrite any existing probe files. It never modifies
the host mod, game executable, REPENTOGON DLLs, or other mod directories.
The initial live renderer and console-callback experiments crashed. Stage 1A
then verified this callback chain: keyboard input -> `MC_POST_UPDATE` ->
`MC_POST_RENDER`. It passed in the installed game.

Stage 1B proved `Renderer.CreateImage(32, 32, ...)` safe in the installed
game. Stage 1C retains the same safe activation path and adds exactly one
native call: `Renderer.LoadImage("gfx/nebius_native_stage1/white.png")`. This
loads the probe's own packaged 1×1 white image. It does not create an image,
render to an image, draw it, create a sprite, spawn a pickup, or access the
bridge/host item.

**Accepted on October 10, 2026:**

- Stage 1B detected `KEY_8`, created the 32x32 image at frame 17, and
  remained stable through frame 77.
- Stage 1C detected the keyboard-gated request and safely completed
  `Renderer.LoadImage` for the packaged 1×1 image. The probe receipt was
  captured and confirmed.

Fully restart Isaac, enable **Nebius Native Stage 1**, and start a disposable
fresh run. With the debug console closed and normal gameplay focused, **hold**
the `8` key on the number row for about one second. Keypad `8` is also
supported. The probe accepts both the normal one-frame key edge and a held-key
state, which accommodates compact keyboards. Wait at least two seconds, then
quit Isaac normally. Nothing visible should happen; the detailed receipt is
written to Isaac's `log.txt`.

In PowerShell, from the project directory, run:

```powershell
npm run native:verify
```

Success reports the physical key detected, the update frame, immediately before
and after `LoadImage`, and a 60-frame stability window. The verifier rejects
image creation, image rendering, drawing, or spawning. Failure output tells
you whether the API was unavailable, produced a Lua error, or failed to
complete. Do not run any `nebius-native` console commands; the probe
intentionally registers none.

## Conflict boundaries

- Separate mod name, directory, module name, and asset path.
- No changes to `agent`, the bridge, generated profiles, item behavior, HUD,
  global namespace, or engine binaries.
- No console callback, automatic spawn, image creation, drawing, item access,
  or bridge access.
- The only input is `KEY_8` or `KEY_KP_8` for player zero; it is ignored after
  the first press until the next run.
- The only side effect is a bounded diagnostic log receipt.

This isolates our changes, but does not guarantee compatibility with every
third-party rendering mod. Test with the installed mod set. Moving between
rooms ends visibility overrides; the probe is not a persistent generated-item
system. Picking up the host invokes its existing behavior.

## Next gates

1. Accept the Stage 1C `LoadImage`-only probe in Isaac.
2. Combine already-accepted `CreateImage` and `LoadImage` in a separate,
   keyboard-armed experiment; do not draw yet.
3. Add source quads, render-to-image, and a visible overlay in separate
   experiments, one native call family at a time.
4. Solve inbound bridge-to-game communication as an independent spike. Native
   renderer bindings alone do not solve IPC or the existing generation bug.
5. Only add C++ engine hooks if a required capability genuinely is missing.
   There is no supported standalone extension ABI assumed by this skeleton.
6. Connect validated recipes to the renderer and fixed passive-effect handlers.

No model-produced Lua or native code is executed.

## Primary references inspected

Upstream revision inspected: `9b84409f1c7fa0c50cef5473d7b7a883b94c1b53`.
These references describe APIs; the installed build is checked independently.

- https://github.com/TeamREPENTOGON/REPENTOGON/blob/9b84409f1c7fa0c50cef5473d7b7a883b94c1b53/docs/docs/renderer/Renderer.md
- https://github.com/TeamREPENTOGON/REPENTOGON/blob/9b84409f1c7fa0c50cef5473d7b7a883b94c1b53/docs/docs/renderer/Image.md
- https://github.com/TeamREPENTOGON/REPENTOGON/blob/9b84409f1c7fa0c50cef5473d7b7a883b94c1b53/docs/docs/renderer/SourceQuad.md
- https://github.com/TeamREPENTOGON/REPENTOGON/blob/9b84409f1c7fa0c50cef5473d7b7a883b94c1b53/repentogon/LuaInterfaces/LuaRender.cpp

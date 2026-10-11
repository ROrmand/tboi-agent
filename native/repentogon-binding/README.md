# REPENTOGON bridge binding scaffold

This is source for a **fork of REPENTOGON**, not a standalone DLL and not an
automatic game installation. Add `NebiusBridge.cpp` to the REPENTOGON project
alongside `repentogon/LuaInterfaces/LuaConsole.cpp`, include its header as
needed, build the fork with REPENTOGON's documented toolchain, and test it in
a separate Isaac installation/profile before replacing any installed binary.

It registers exactly one Lua global table:

```lua
NebiusBridge.Poll() -- string JSON envelope, or nil
NebiusBridge.Ack(id) -- boolean
```

The binding connects only to `\\.\pipe\nebius_isaac_bridge_v1`. It accepts no
path, host, port, shell command, Lua source, or callback from Lua. `Poll` only
returns bounded raw JSON; fixed game code must JSON-decode and revalidate it.

## Current scaffold status

The Lua registration code follows the current upstream `LuaConsole.cpp`
registration pattern. The named-pipe request/response client is intentionally
small so its behavior is auditable. The Node named-pipe server is implemented
in `native/ipc/server.mjs`; the binding has been compiled into the isolated
REPENTOGON fork. Runtime acceptance is still pending. Engine DLL installation
requires Isaac to be closed and the original DLL to be backed up first.

Pipe I/O runs on a native worker. `Poll()` starts the worker lazily and returns
an already-queued envelope or nil; callers must retry across updates. `Ack()`
returns whether an acknowledgement was queued, not whether Node received it.
Only the bridge acknowledgement log proves delivery.

## Acceptance test after integration

1. Start the bridge's local pipe server.
2. Start Isaac with the forked REPENTOGON build.
3. In fixed mod Lua, call `NebiusBridge.Poll()` on a keyboard-gated update.
4. Confirm it returns a literal `hello` envelope from the local bridge.
5. Call `NebiusBridge.Ack("probe-1")`; verify only that acknowledgement is
   observed by the local bridge.

No generated profile, artwork, or model-produced code participates in this
test.

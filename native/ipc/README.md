# Native bridge protocol

This directory defines the transport contract used by the REPENTOGON native
binding. The Node bridge owns a local named pipe; the binding is its game-side
client. Product Lua calls `NebiusBridge.Poll()` and `NebiusBridge.Ack(id)`.
Lua receives bounded JSON envelopes and validates profiles before applying
them. It never receives a socket, file handle, arbitrary path, or executable
source.

Messages are newline-delimited UTF-8 JSON, limited to 64 KiB, with protocol
version `1`. Supported types are `hello`, `poll`, `ack`, `profile`, and `status`.
`profile` payloads remain data and must be revalidated by the game's fixed Lua
handler before use.

For terminal submission to a running local bridge and active run:

```powershell
npm run ipc:generate -- --prompt "A cursed nail that poisons enemies"
```

This endpoint only accepts a prompt; it does not accept Lua, a callback, a
path, or arbitrary profile data.

The protocol module and its tests are transport components. The product path
also includes the binding source in `native/repentogon-binding/` and the game
handlers in `demo/live-sprite-swap/main.lua`. The binding must be present in
the installed REPENTOGON build for Poll/Ack to work in game.

# Phase 2A: native bridge protocol

This directory defines the transport contract for the future REPENTOGON native
binding. The Node bridge will own a local named pipe; the binding will be its
only game-side client. Lua receives fixed, validated data through a bounded
`poll` operation and can acknowledge an ID. It never receives a socket, file
handle, arbitrary path, or executable source.

Messages are newline-delimited UTF-8 JSON, limited to 64 KiB, with protocol
version `1`. Supported types are `hello`, `poll`, `ack`, and `profile`.
`profile` payloads remain data and must be revalidated by the game's fixed Lua
handler before use.

For the Stage 2B acceptance test, submit a prompt to the running local bridge
without opening the legacy ImGui generator window:

```powershell
npm run ipc:generate -- --prompt "A cursed nail that poisons enemies"
```

This endpoint only accepts a prompt; it does not accept Lua, a callback, a
path, or arbitrary profile data.

This is deliberately protocol-only. No game DLLs or REPENTOGON binaries are
changed in Phase 2A until the binding has an isolated build and injection plan.

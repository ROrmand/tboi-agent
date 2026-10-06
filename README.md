# Project Technical Plan: Live In-Game AI Content & Modding Assistant

## Project Overview & Architecture

### Core Details
* **Title:** The Binding of Isaac: Live In-Game AI Content & Modding Assistant
* **Target Event:** Nebius x NVIDIA Global AI Hackathon (Track: Coding & Agentic Engineering / Best Apps and Agents)
* **Game Engine Target:** *The Binding of Isaac: Repentance* (Lua API v3.5 + REPENTAGON C++ Extender)
* **Modding Framework:** IsaacScript (TypeScript to Lua Transpiler)
* **Inference Infrastructure:** Nebius AI Studio Token Factory (NVIDIA H100/L40S Clusters)
* **Target Models:** Qwen 2.5 Coder 32B Instruct (Logic & Code), Stable Diffusion XL / Flux.1-Lite (Sprite Pipeline)
* **Target Latency:** < 2.5s for complete JSON balance sheet + Lua hook execution; < 4.0s for sprite sheet rendering

### Concept Summary
An embedded in-game terminal and prompt overlay operating natively inside *The Binding of Isaac: Repentance*. The system allows players to dynamically prompt, generate, compile, and spawn items, trinkets, monsters, and bosses in real-time mid-run without closing or restarting the game executable.

---

## System Architecture & Tech Stack

### Tech Stack Breakdown
1. **Engine Extender (REPENTAGON):** Injects into the game engine at the C++ layer. Provides native ImGui overlay rendering hooks, low-level memory/entity access, and engine-level hook injection.
2. **Modding Framework (IsaacScript):** Compiles TypeScript down to clean Lua 5.3. Provides type safety, autocomplete over Isaac API interfaces, and AST parsing/validation support on the bridge server.
3. **Local Bridge Server (Node.js / TypeScript):** Runs locally (`localhost:3000`). Intercepts in-game JSON prompt files, manages multi-turn prompt context, runs regex AST sanitization, post-processes sprite grids, and interfaces with Nebius.
4. **AI Inference Endpoint (Nebius AI Studio Token Factory):** Cloud-hosted high-throughput GPU infrastructure providing OpenAI-compatible REST endpoints for ultra-fast code generation and structured JSON payloads.

### Technical Flow & Sequence

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      GAME CLIENT (Isaac + REPENTAGON)                   │
│  - Native ImGui Prompt Overlay                                          │
│  - Pre-allocated Generic Shell Bank (XML Slots 1..N)                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 1. Writes prompt_queue.json
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     LOCAL BRIDGE SERVER (Node.js / TS)                  │
│  - Watches prompt_queue.json via chokidar                               │
│  - Manages session context & payload formatting                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 2. REST API Request (Bearer Auth)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     NEBIUS AI STUDIO TOKEN FACTORY                      │
│  - Qwen 2.5 Coder 32B Instruct (Structured JSON + Lua Hooks)           │
│  - Image Generation Endpoint (Pixel-Art Sprites)                        │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 3. Returns Payload & Base64 Sprites
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     LOCAL BRIDGE SERVER (Node.js / TS)                  │
│  - Regex AST Sandboxing & Parameter Bounds Check                        │
│  - Writes Sprite Sheet PNG & Injects Lua to Mod Folder                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 4. IPC Signal / Hot-Reload
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GAME CLIENT (Isaac + REPENTAGON)                   │
│  - Rebinds Texture via Sprite:ReplaceSpritesheet()                      │
│  - Evaluates Sandboxed Lua Scope & Spawns Entity Live in Room           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Generic Shell Bank Pattern (No-Reboot Hot-Reload Engine)
To bypass *The Binding of Isaac*'s engine restriction where XML configurations (`items.xml`, `entities2.xml`) require a full game restart to load new IDs:
* **Pre-Allocation:** The mod registers generic dummy definitions ahead of time in `items.xml` (`Dynamic_Item_1..20`) and `entities2.xml` (`Dynamic_Monster_1..10`, `Dynamic_Boss_1..4`).
* **Visual Hot-Swapping:** Rebinds entity visual representations dynamically at runtime using `Sprite:ReplaceSpritesheet()` and `Sprite:LoadGraphics()`.
* **Behavior Injection:** Dynamic Lua logic strings received from Nebius are safely evaluated via a sandboxed `load()` scope and bound to dynamic callbacks (`MC_EVALUATE_CACHE`, `MC_NPC_UPDATE`, `MC_ENTITY_TAKE_DMG`).

---

## Client Prompt Windows & Core Features

### 1. Item Client Window
* **Custom Prompt Entry:** Multi-line text field supporting detailed mechanical descriptions (e.g., *"A shadow dagger that multiplies damage based on player velocity"*).
* **Stat Modifier Checklist:** Granular manual override controls for core stats (Tears, Damage, Speed, Range, Luck, Shot Speed, Soul Hearts).
* **Synergy Array Builder:** Ability to select up to 5 currently held items from the active run to auto-generate custom cross-item interactions.
* **Visual Style Parameters:** Theme selection (e.g., *Cursed, Angelic, Tech, Gross, Cosmic*).

### 2. Trinket Client Window
* **Simplified Prompt Interface:** Focused on utility, passive room triggers, and drop-rate modifications.
* **Impact Scope:** Constrained stat ranges to prevent unintended game-breaking stacking.

### 3. Monster Client Window
* **Page 1 (Visual & Archetype):** Defines base size, movement profile (Flying, Hopping, Stationary, Chasing), and visual theme.
* **Page 2 (Behavior & Targeting):** Configures attack patterns, projectile spreads, death spawns, and explicit mapping to replace standard enemy IDs across the run (up to 10 enemy replacements).

### 4. Boss Client Window
* **Trait Fusion Engine:** Interface to select two existing bosses and blend their attack patterns, visual identities, and health scaling.
* **Floor Mapping Configuration:** Set target boss replacement mapping for key floors (*Basement, Caves, Depths, Womb, Cathedral/Sheol*).
* **Immediate Instantiation:** Dedicated "Test Spawn in Current Room" trigger for rapid balance validation.

---

## Technical Risk Mitigation & Sandboxing

### Game Stability & Crash Prevention
1. **Execution Sandboxing:** Generated Lua code runs within an isolated environment. Prohibited namespaces and functions include:
   * File I/O: `os.*`, `io.*`
   * Dynamic Code Execution: `dofile`, `require`, `loadfile`
   * Debug Hooks: `debug.*`
2. **Regex AST Sanitizer:** Prior to calling `load()`, the bridge server parses the generated string against security rules:
   * **Infinite Loop Safeguard:** Direct prohibition of `while true do` constructs without explicit frame step counters.
   * **Recursion Checks:** Call-stack depth limits applied to custom entity update functions.
3. **Attribute Bounds & Fail-Safes:** Stat modifications are strictly clamped to stable engine bounds:
   $$\text{Damage Multiplier} \le 50.0 \quad \mid \quad \text{Move Speed} \le 2.0 \quad \mid \quad \text{Tear Delay} \ge 1$$
   *On parsing error or missing attributes, the system silently applies default baseline values (`Fallback_Template.lua`) to prevent execution halts.*

### Run Cleanup & State Management
* **Slot Allocation Tracking:** Internal registry tracking active allocations (`Dynamic_Item_1` through `Dynamic_Item_20`).
* **Run Purge Hooks:** Registers callbacks to `MC_POST_GAME_STARTED` and `MC_PRE_GAME_EXIT` to purge temporary memory, clear dynamic tables, and reset sprite attachments.
* **Persistence Layer:** Optionally writes generated item metadata to a local JSON database if the player chooses to "Save Custom Mod" at the end of a run.

---

## Implementation Roadmap

### Phase 1: Local Bridge Server & Nebius REST API Integration
* Configure local bridge server with Node.js/TypeScript environment.
* Implement client connection layer to Nebius API endpoints using optimized system prompts.
* Create JSON schemas enforcing output formats for items, entities, and code hooks.

### Phase 2: Generic Shell Bank & Lua Loader
* Construct pre-allocated `items.xml` (20 Item IDs, 10 Trinket IDs) and `entities2.xml` (10 Monster IDs, 4 Boss IDs).
* Write the dynamic Lua hot-swapper capable of intercepting entity instantiation and binding generated behaviors.
* Validate sprite replacement routines using `Sprite:ReplaceSpritesheet()`.

### Phase 3: In-Game UI Overlay
* Build native ImGui overlay rendering panels using REPENTAGON hooks.
* Implement text entry focus, button interaction handlers, selection toggle grids, and synergy selection panels.
* Connect Lua file buffer writers to trigger bridge server processing.

### Phase 4: End-to-End Testing & Demo Preparation
* Perform end-to-end generation tests under actual run conditions.
* Verify sandbox stability against malformed or invalid code outputs.
* Record showcase demo video featuring real-time item, synergy, and boss generation.

---

## Technical Appendix: Nebius Schema Format

The following JSON schema defines the structured output format requested from the Nebius LLM endpoint during dynamic generation requests:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "IsaacDynamicContentPayload",
  "type": "object",
  "properties": {
    "entity_type": {
      "type": "string",
      "enum": ["item", "trinket", "monster", "boss"]
    },
    "metadata": {
      "type": "object",
      "properties": {
        "display_name": { "type": "string" },
        "description": { "type": "string" },
        "quality": { "type": "integer", "minimum": 0, "maximum": 4 }
      },
      "required": ["display_name", "description"]
    },
    "stat_modifiers": {
      "type": "object",
      "properties": {
        "damage": { "type": "number", "minimum": -10.0, "maximum": 50.0 },
        "speed": { "type": "number", "minimum": -1.0, "maximum": 2.0 },
        "tears": { "type": "number", "minimum": -5.0, "maximum": 10.0 },
        "range": { "type": "number", "minimum": -10.0, "maximum": 20.0 },
        "luck": { "type": "integer", "minimum": -5, "maximum": 10 }
      }
    },
    "lua_behavior_hook": {
      "type": "string",
      "description": "Sandboxed Lua code executed during entity update cycles."
    },
    "sprite_prompt": {
      "type": "string",
      "description": "Style-aligned prompt sent to image generation pipeline."
    }
  },
  "required": ["entity_type", "metadata", "stat_modifiers", "lua_behavior_hook", "sprite_prompt"]
}
```
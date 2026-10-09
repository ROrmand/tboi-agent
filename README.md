# Project Technical Plan: Live In-Game AI Content & Modding Assistant

## Project Overview & Architecture

### Core Details
* **Title:** The Binding of Isaac: Live In-Game AI Content & Modding Assistant
* **Target Event:** Nebius x NVIDIA Global AI Hackathon (Track: Coding & Agentic Engineering / Best Apps and Agents)
* **Game Engine Target:** *The Binding of Isaac: Repentance+* (Lua API v3.5 + REPENTOGON C++ Extender)
* **Modding Runtime:** Native Lua 5.3 + REPENTOGON API
* **Generation Infrastructure:** Nebius AI Studio API, used as the required generation provider for item concepts, structured profiles, and visual assets.
* **Target Models:** Nebius-hosted models selected by capability: structured-output LLM for item profiles and image generation model for item/tear sprite source art.
* **Target Latency:** < 2.5s for complete JSON balance sheet + Lua hook execution; < 4.0s for sprite sheet rendering

### Concept Summary
An embedded in-game terminal and prompt overlay operating natively inside *The Binding of Isaac: Repentance*. The system allows players to dynamically prompt, generate, compile, and spawn items, trinkets, monsters, and bosses in real-time mid-run without closing or restarting the game executable.

### Nebius Generation Method

Nebius AI Studio is the generation layer for this project. The local bridge
submits a constrained item prompt and returns a validated profile rather than
executable generated Lua:

1. A player prompt is sent to a Nebius-hosted structured-output model.
2. The model returns an `ItemProfile` JSON document: name, description, stat
   bounds, allowed tear effect, sprite prompt, and sound brief.
3. A Nebius image-generation model produces source art for the item and a
   small set of tear-animation frames. The bridge removes backgrounds, scales
   frames, and packs them into the project's predeclared animation template.
4. The bridge validates the complete payload, writes it into a reserved asset
   slot, and asks Isaac to apply that slot. The game only selects from
   predeclared item IDs, animation templates, and sound IDs.

This keeps Nebius central to the creative generation while preserving the
runtime limits established by the game: new XML IDs and animation definitions
require a restart; data and assets assigned to an existing slot can be applied
during a run.

---

## System Architecture & Tech Stack

### Tech Stack Breakdown
1. **Engine Extender (REPENTOGON):** Injects into the game engine at the C++ layer. Provides native ImGui overlay rendering hooks, low-level memory/entity access, and engine-level hook injection.
2. **Modding Runtime (Native Lua + REPENTOGON):** Runs Lua 5.3 directly in Isaac and uses REPENTOGON callbacks for console commands, runtime sprite replacement, and in-game UI hooks.
3. **Local Bridge Server (Node.js / TypeScript):** Runs locally (`localhost:3000`). Sends constrained requests to Nebius AI Studio, validates the returned `ItemProfile`, post-processes generated sprite frames and audio assets, and writes accepted data into reserved runtime slots.
4. **Nebius AI Studio:** Cloud generation provider for structured item profiles and image assets, accessed from the bridge through its OpenAI-compatible API.

### Technical Flow & Sequence

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      GAME CLIENT (Isaac + REPENTOGON)                   │
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
│                         NEBIUS AI STUDIO                                │
│  - Structured ItemProfile JSON generation                               │
│  - Image generation for item and tear-animation source art              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 3. Returns Payload & Base64 Sprites
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     LOCAL BRIDGE SERVER (Node.js / TS)                  │
│  - Schema validation, asset processing, and parameter bounds checks     │
│  - Writes approved assets and ItemProfile data to a reserved slot        │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 4. IPC Signal / Hot-Reload
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GAME CLIENT (Isaac + REPENTOGON)                   │
│  - Rebinds Texture via Sprite:ReplaceSpritesheet()                      │
│  - Applies whitelisted stats and effects for the selected slot          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Generic Shell Bank Pattern (No-Reboot Hot-Reload Engine)
To bypass *The Binding of Isaac*'s engine restriction where XML configurations (`items.xml`, `entities2.xml`) require a full game restart to load new IDs:
* **Pre-Allocation:** The mod registers generic dummy definitions ahead of time in `items.xml` (`Dynamic_Item_1..20`) and `entities2.xml` (`Dynamic_Monster_1..10`, `Dynamic_Boss_1..4`).
* **Visual Hot-Swapping:** Rebinds entity visual representations dynamically at runtime using `Sprite:ReplaceSpritesheet()` and `Sprite:LoadGraphics()`.
* **Behavior Application:** Nebius returns declarative effect choices. The bridge accepts only whitelisted stat modifiers and effect IDs, which the mod maps to fixed callbacks such as `MC_EVALUATE_CACHE` and `MC_POST_FIRE_TEAR`.

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
1. **Declarative Profile Boundary:** Generated output is JSON, not executable Lua. The game does not evaluate model-produced code or expose file I/O, process execution, or debug APIs to a generated profile.
2. **Schema and Effect Validation:** The bridge enforces an `ItemProfile` schema and accepts only known effect IDs, stat fields, and numeric ranges before a profile can enter a runtime slot.
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
* Build native ImGui overlay rendering panels using REPENTOGON hooks.
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

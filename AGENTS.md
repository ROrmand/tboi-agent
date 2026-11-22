# Agent operating contract

Read this file and `docs/AGENT_SETUP.md` at the start of every thread. Treat each
thread as one bounded task. Use a separate T3 sub-thread and Git worktree for each
independent implementation; do not mix unrelated changes in one branch.

## Stack and architecture

- Node.js >=22.12, npm, and ES modules (`import`/`export`; no CommonJS additions).
- JavaScript owns orchestration, setup, bridge, generation, and filesystem I/O.
- Lua owns Isaac mod behavior; preserve game-loop performance and existing schemas.
- C++ changes are limited to the REPENTOGON/native boundary; keep IPC contracts
  backward compatible unless the task specification explicitly changes them.
- `sharp` is the production image dependency. ComfyUI is optional; all workflows
  must retain the configured placeholder or Nebius path when ComfyUI is absent.
- Keep native, bridge, and mod layers separated. Validate data at process boundaries.
- Preserve existing public formats, reservation ledgers, generated-slot contracts,
  and save safety unless an approved specification says otherwise.

## Small-context execution

- Begin with `git status --short`, then use `rg`, `rg --files`, or LSP references to
  find only the files needed. Do not load the full repository tree into context.
- Read the target file and its nearest tests before editing. Follow local patterns.
- Prefer a surgical ~5-line diff over a complete rewrite. Never reformat unrelated
  code, rename opportunistically, or modify files outside the task boundary.
- For architecture work, obtain an explicit external specification first. In the
  active worktree, implement only that specification; surface ambiguities instead
  of expanding scope.
- Preserve user changes. Never reset, discard, or overwrite unrelated dirty files.

## Setup and safety

- For installation, use the shared CLI: run `inspect --json`, `plan --json`, and an
  `install --dry-run --json`; review results before any mutation.
- Never read, print, or request `NEBIUS_API_KEY`; ask the user to edit `.env` privately.
- Native replacement requires explicit approval and setup-owned backups. Never
  bypass missing runtime pins, change security settings, or delete reservation data.
- Do not operate while Isaac is active. Never select or modify save slots; Save File
  1 is outside testing scope. Offline tests do not prove live acceptance.

## Completion gate

- Run the narrowest relevant checks while iterating.
- Before completion, run `npm test`. For setup, onboarding, packaging, or release
  changes, also run `npm run test:setup`.
- Report commands and outcomes honestly. Do not declare completion with failing or
  skipped required checks, and do not publish or fork merely to verify local work.

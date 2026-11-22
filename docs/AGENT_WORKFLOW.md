# Single-task agent workflow

## 1. Start a task in a clean worktree

Run from the repository root in PowerShell. Use a short kebab-case task name.

```powershell
$Task = "feature-item-cache"
$Worktree = Join-Path (Split-Path $PWD -Parent) $Task
git fetch --prune
git worktree add $Worktree -b $Task HEAD
git -C $Worktree status --short --branch
```

For a branch that already exists locally, omit `-b`:

```powershell
git worktree add ../feature-item-cache feature-item-cache
```

T3 Code should create the isolated checkout when launching a top-level task: choose
the **worktree** workspace strategy, set `baseRef` to the intended parent branch,
and set a unique task branch. For delegated child work, request worktree isolation.
Uncommitted changes in the current checkout are not copied.

Do not put sibling paths such as `../feature-item-cache` in this repository's
`.gitignore`: they are outside this repository and Git cannot track them. In-repo
containers `.claude/worktrees/`, `.worktrees/`, and `worktrees/` are ignored.

## 2. Execute one bounded task

1. Read `AGENTS.md` and the target specification.
2. Confirm the branch and clean state with `git status --short --branch`.
3. Locate code with `rg`, `rg --files`, and LSP references; open only relevant files.
4. Read adjacent tests, make the smallest coherent diff, and run focused checks.
5. Run the completion gates in `AGENTS.md`, then commit and open the PR if requested.

## 3. Clean up after merge

First confirm the worktree is clean and the branch is merged. Replace the values
below; review the printed paths before removal.

```powershell
$Task = "feature-item-cache"
$Worktree = Join-Path (Split-Path $PWD -Parent) $Task
git -C $Worktree status --short --branch
git fetch --prune
git branch --merged
git worktree remove $Worktree
git branch -d $Task
git worktree prune
```

`git branch -d` refuses to delete an unmerged branch. Do not substitute `-D` or use
`git worktree remove --force` unless recovery is understood and explicitly approved.

## T3 Code system prompt

```text
On boot, read AGENTS.md and the task specification. Treat this as an ephemeral,
single-task thread. Run only in the worktree bound to this thread; never create or
switch worktrees from inside the task. Keep one branch and one outcome per thread.

Prune context aggressively: start with git status, rg/rg --files, and LSP symbol or
reference searches. Read only target files, adjacent contracts, and relevant tests.
Do not ingest the whole repository tree or rewrite complete files when a surgical
~5-line diff is sufficient. Preserve unrelated user changes.

Implement only the supplied specification. If the task requires new architecture,
stop implementation and return a compact question/spec request for ChatGPT. Once an
external architecture spec is supplied, execute its explicit acceptance criteria
without broadening scope. Run repository checks from AGENTS.md before completion and
report the exact commands, failures, assumptions, and changed files.
```

## Cursor project rule / system prompt

```text
Read AGENTS.md before acting. This Cursor session is bound to one task and one Git
worktree. Do not edit outside the active worktree, switch branches, or mix cleanup,
refactors, and feature work unless the task explicitly requires them.

Use rg and LSP definitions/references before opening files. Keep context file-level:
target implementation, nearest contract, and relevant tests only. Prefer minimal,
reviewable edits (often ~5 lines) over file rewrites or repository-wide formatting.

Treat an approved ChatGPT architecture prompt as the scope boundary. Implement only
its stated interfaces and acceptance criteria. Escalate missing architectural choices
instead of inventing a larger design. Run focused tests while iterating and all checks
required by AGENTS.md before saying the task is complete.
```

## ChatGPT architecture prompt

```text
Act as the architecture/specification thread, not the implementation thread. Produce
a bounded spec for one task: goal, non-goals, affected interfaces, invariants, exact
files or discovery targets, migration/rollback concerns, acceptance criteria, and
required tests. Minimize code excerpts and context. State unresolved decisions as
questions. The execution agent will implement this spec in an isolated Git worktree
and must not expand its scope.
```

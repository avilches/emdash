# Design: Checkout Branch/Worktree Mode

**Date:** 2026-05-18  
**Status:** Approved

## Problem

When creating a task from the "From Branch" flow, the only option is to create a new branch and worktree. The "Create task branch and worktree" switch, when turned off, silently falls back to a `no-worktree` strategy that runs the task in the project root — not what users want. There is no way to select an existing branch and reuse (or create) its worktree.

## Goal

Allow users to create a task on an existing branch. If that branch already has a worktree, reuse it. If not, create one. If the branch happens to be checked out at the project root, use the project root. One task per branch at all times — no sharing.

---

## Section 1 — UI

### Replace switch with segmented button

Remove the "Should create and push feature branch" collapsible. Replace the "Create task branch and worktree" switch with a two-position `RadioGroup` (same component used in `checkout-mode-group.tsx`), always visible:

- **`Create new branch/worktree`** — current behavior, creates a new branch from `sourceBranch`
- **`Checkout branch/worktree`** — new behavior, selects an existing branch and reuses or creates its worktree

### Branch picker — Create mode

Same as today: `ProjectBranchSelector` picks the source branch to fork from.

Dynamic info message below the picker:

> Will create branch `task/<generated-name>` and worktree at `<pool-path>/<branch>`

"Push branch to remote" switch remains visible below the message in this mode.

### Branch picker — Checkout mode

`ProjectBranchSelector` picks the target branch directly. Each entry shows its location as a secondary line in muted text:

| Secondary line | Condition |
|---|---|
| `Project root: /path/to/project` | Branch is checked out at the project root |
| `Worktree: /path/to/worktree` | Branch has an existing worktree in the pool |
| *(no secondary line)* | Branch exists in git but has no worktree yet |

Branches already used by an active task show `(used by TaskName)` and are grayed out and non-selectable.

Dynamic info message below the picker (updates as the user changes selection):

| Message | Condition |
|---|---|
| `Will reuse existing worktree at <path>` | Branch has a worktree |
| `Will use project root at <path>` | Branch is checked out at the project root |
| `Will create new worktree at <pool-path>/<branch>` | Branch has no worktree |

---

## Section 2 — Backend

### 2a. New IPC: `getProjectBranchesWithStatus(projectId)`

Returns the branch list enriched with worktree and task status. Used by the picker in Checkout mode.

```typescript
type BranchWithStatus = {
  branch: string
  worktreePath?: string                      // existing worktree path in the pool
  isProjectRoot: boolean                     // checked out at the project root
  usedByTask?: { id: string; name: string }  // active task using this branch
}
```

Implementation in the controller:

1. List local and remote branches via git.
2. Parse `git worktree list --porcelain` to get all worktrees and their HEAD branches.
3. Query active (non-archived) tasks for the project where `taskBranch IS NOT NULL`.
4. Cross-reference all three to produce `BranchWithStatus[]`.

### 2b. Strategy change — `create-task-strategy.ts`

`resolveBranchLikeTaskStrategy` currently maps `createBranchAndWorktree = false` to `no-worktree`. Change:

```
Checkout mode + branch selected  →  { kind: 'checkout-existing' }   // new
Checkout mode + no branch        →  { kind: 'no-worktree' }          // edge case, should not occur
Create mode                      →  { kind: 'new-branch', ... }      // unchanged
```

The `checkout-existing` strategy in `createTask.ts` sets `taskBranch = sourceBranch.branch`, stores it in DB, and calls `resolveTaskWorkDir` which already handles reusing an existing worktree or creating a new one via `checkoutExistingBranch`.

### 2c. Fix `checkoutExistingBranch` — project root branch

`checkoutExistingBranch` currently always calls `git worktree add`. If the branch is checked out at the project root, this fails with "already checked out". Fix: before calling `git worktree add`, parse `git worktree list --porcelain` and check if the branch matches the first entry (the main worktree). If it does, return the project root path directly without creating a new worktree.

---

## Data Flow (Checkout mode)

```
User selects "Checkout branch/worktree"
  → UI calls getProjectBranchesWithStatus(projectId)
  → Picker shows branches with worktree paths and in-use labels
  → User selects branch X
  → UI shows dynamic message (reuse / root / create)
  → User confirms
  → createTask({ strategy: { kind: 'checkout-existing' }, sourceBranch: X })
  → createTask stores taskBranch = X in DB
  → provisionTask → resolveTaskWorkDir(task)
      → getWorktree(X) → found → return worktree path
      → getWorktree(X) → not found → checkoutExistingBranch(X)
          → X is project root branch → return project root path
          → X is not root → git worktree add → return new worktree path
```

---

## Out of Scope

- No changes to the From PR flow.
- No changes to the From Issue flow.
- Merging or rebasing when checking out an existing branch is not handled — the branch is used as-is.

## Remote-only Branches

Remote-only branches (exist on remote, no local checkout) are supported without additional work. The UI shows them with no secondary line (no worktree yet) and the message `Will create new worktree at <pool-path>/<branch>`. On confirm, `checkoutExistingBranch` fetches the remote, creates a local tracking branch, and runs `git worktree add` — this flow already exists.

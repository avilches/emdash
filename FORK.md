# Fork Maintenance

This fork adds features on top of [generalaction/emdash](https://github.com/generalaction/emdash).

## Syncing with upstream

```bash
git fetch upstream
git rebase upstream/main
# resolve conflicts, then push
git push --force-with-lease origin main
```

Last synced upstream commit: `8d33c58e` (test(tasks): cover PR branch fetch fallback)

---

## Custom features

### 1. Checkout branch/worktree mode in create task modal

**PR:** #1  
**Status:** open  
**Spec:** `docs/superpowers/specs/2026-05-18-checkout-branch-worktree-design.md`

**What it does:**  
Adds a "Checkout branch/worktree" mode to the create-task modal. Instead of always creating a new branch+worktree, the user can select an existing branch and reuse its worktree (or create one if missing). If the branch is checked out at the project root, the task uses the root. Branches already used by an active task appear disabled in the picker with a "(used by X)" label.

**Files touched — watch these in upstream diffs:**

| File | What we changed | Risk on upstream change |
|---|---|---|
| `src/main/core/projects/worktrees/worktree-service.ts` | Added `getAllCheckedOutBranches()` and `getWorktreePoolPath()` | Low — additive methods. Watch for refactors to the class constructor or `findCheckedOutPathForBranch`. |
| `src/main/core/projects/operations/getProjectBranchesWithStatus.ts` | New file | Low — new operation. Watch if upstream adds a similar operation. |
| `src/main/core/projects/controller.ts` | Registered new operation | Low — one line added. Auto-merge usually works. |
| `src/shared/projects.ts` | Added `BranchWithStatus`, `ProjectBranchesStatusResult` types | Low — additive. Watch if upstream adds conflicting type names. |
| `src/renderer/lib/components/branch-selector.tsx` | Added `getExtraProps` prop for subtitle/badge/disabled per branch | **Medium** — upstream actively develops this component (added remote selector in the sync we just did). Check every upstream change here. |
| `src/renderer/lib/components/project-branch-selector.tsx` | Added `getExtraProps` pass-through, `showRemoteSelectorFooter` already merged | **Medium** — same risk as above. |
| `src/renderer/features/tasks/create-task-modal/use-branch-selection.ts` | Replaced `createBranchAndWorktree: boolean` with `branchMode: BranchMode`. Parameter `createBranchAndWorktreeByDefault` kept for caller compatibility. | **High** — upstream was also migrating this API (we saw a conflict here). Any upstream change to this file needs manual review. |
| `src/renderer/features/tasks/create-task-modal/branch-picker-field.tsx` | Full rewrite: removed collapsible+switch, added RadioGroup mode selector, dynamic info messages | **High** — this is the main UI entry point. If upstream changes the branch picker layout or adds new options, expect conflicts. |
| `src/renderer/features/tasks/create-task-modal/use-from-branch-mode.ts` | Added `branchStatuses` React Query | Medium — additive. Watch if upstream restructures this hook. |
| `src/renderer/features/tasks/create-task-modal/from-branch-content.tsx` | Added `taskBranchName` prop and forwards `branchStatuses` | Low — additive props. |
| `src/renderer/features/tasks/create-task-modal/create-task-strategy.ts` | `branchMode: BranchMode` replaces `createBranchAndWorktree: boolean` in `resolveBranchLikeTaskStrategy` | Medium — if upstream changes task creation strategy logic, check this function. |
| `src/renderer/features/tasks/create-task-modal/create-task-modal.tsx` | Updated calls to use `branchMode`, passes `taskBranchName` | Medium — large file, upstream changes it frequently. |

**What to check when merging upstream:**

1. **`branch-selector.tsx` and `project-branch-selector.tsx`** — if upstream adds new props or changes the combobox item structure, verify that `getExtraProps` still composes correctly and subtitle/badge still renders.

2. **`use-branch-selection.ts`** — if upstream touches the branch selection state, check whether `branchMode` and `createBranchAndWorktreeByDefault` still make sense together.

3. **`branch-picker-field.tsx`** — if upstream adds a new UI option to the "from branch" flow (e.g., a new switch or a new collapsible), it won't be in our rewritten version. Compare upstream's version side-by-side.

4. **`create-task-modal.tsx`** — if upstream adds a new mode to `CreateTaskStrategy` or changes how `resolveBranchLikeTaskStrategy` is called, check `create-task-strategy.ts` as well.

5. **If upstream adds its own "use existing branch" feature** — this whole feature may be superseded. Evaluate whether to drop our implementation in favor of theirs.

---

## Upstream sync log

| Date | Upstream SHA | Notes |
|---|---|---|
| 2026-05-18 | `8d33c58e` | First sync. 50 upstream commits. Conflicts in `branch-selector.tsx`, `project-branch-selector.tsx`, `use-branch-selection.ts`, `branch-picker-field.tsx`. All resolved cleanly. |

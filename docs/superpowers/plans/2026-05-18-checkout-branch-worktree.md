# Checkout Branch/Worktree Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Create task branch and worktree" switch with a two-position mode selector ("Create new branch/worktree" / "Checkout branch/worktree") that lets users pick an existing branch, reusing its worktree (or creating one), and shows contextual information about what will happen.

**Architecture:** Add a `getAllCheckedOutBranches` method to `WorktreeService` and a new `getProjectBranchesWithStatus` IPC operation to provide the renderer with per-branch worktree paths and in-use task data. The renderer uses this to decorate the branch picker and show a dynamic preview message. The existing `checkout-existing` strategy already handles the backend flow correctly (including the project-root case via `findCheckedOutPathForBranch`).

**Tech Stack:** Vitest, Drizzle ORM, React Query, MobX, Radix UI primitives (RadioGroup, Combobox)

**Spec:** `docs/superpowers/specs/2026-05-18-checkout-branch-worktree-design.md`

---

## File Map

**Create:**
- `src/main/core/projects/operations/getProjectBranchesWithStatus.ts`

**Modify:**
- `src/shared/projects.ts` — add `BranchWithStatus` and `ProjectBranchesStatusResult` types
- `src/main/core/projects/worktrees/worktree-service.ts` — add `getAllCheckedOutBranches()` and `getWorktreePoolPath()`
- `src/main/core/projects/worktrees/worktree-service.test.ts` — new tests
- `src/main/core/projects/controller.ts` — register new operation
- `src/renderer/lib/components/branch-selector.tsx` — add `subtitle`, `badge`, `getExtraProps`
- `src/renderer/lib/components/project-branch-selector.tsx` — pass `getExtraProps` through
- `src/renderer/features/tasks/create-task-modal/use-branch-selection.ts` — `branchMode` replaces `createBranchAndWorktree`
- `src/renderer/features/tasks/create-task-modal/use-from-branch-mode.ts` — add status query
- `src/renderer/features/tasks/create-task-modal/branch-picker-field.tsx` — full UI rework
- `src/renderer/features/tasks/create-task-modal/create-task-strategy.ts` — `checkout-existing` strategy
- `src/renderer/features/tasks/create-task-modal/create-task-modal.tsx` — pass `branchMode` to strategy

---

## Task 1: WorktreeService — `getAllCheckedOutBranches` + `getWorktreePoolPath`

**Files:**
- Modify: `src/main/core/projects/worktrees/worktree-service.ts`
- Test: `src/main/core/projects/worktrees/worktree-service.test.ts`

- [ ] **Step 1: Write failing tests**

Add inside the `describe('WorktreeService')` block in `worktree-service.test.ts`:

```typescript
describe('getAllCheckedOutBranches', () => {
  it('returns the main worktree branch with isMainWorktree=true', async () => {
    const svc = makeService();
    const result = await svc.getAllCheckedOutBranches();
    expect(result).toEqual([{ branch: 'main', path: repoDir, isMainWorktree: true }]);
  });

  it('includes linked worktrees with isMainWorktree=false', async () => {
    const branchName = 'feature-x';
    const worktreePath = path.join(poolDir, branchName);
    await git(['branch', branchName], { cwd: repoDir });
    await git(['worktree', 'add', worktreePath, branchName], { cwd: repoDir });

    const svc = makeService();
    const result = await svc.getAllCheckedOutBranches();
    expect(result).toContainEqual({ branch: 'main', path: repoDir, isMainWorktree: true });
    expect(result).toContainEqual({ branch: branchName, path: worktreePath, isMainWorktree: false });
  });

  it('returns empty array when git command fails', async () => {
    const svc = makeService({ repoPath: '/nonexistent' });
    const result = await svc.getAllCheckedOutBranches();
    expect(result).toEqual([]);
  });
});

describe('getWorktreePoolPath', () => {
  it('returns the configured pool path', () => {
    const svc = makeService({ worktreePoolPath: poolDir });
    expect(svc.getWorktreePoolPath()).toBe(poolDir);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/avilches/Library/Mobile Documents/com~apple~CloudDocs/Shared/Proy/emdash"
pnpm test -- worktree-service
```

Expected: FAIL — `getAllCheckedOutBranches is not a function`, `getWorktreePoolPath is not a function`

- [ ] **Step 3: Add `getAllCheckedOutBranches` and `getWorktreePoolPath` to WorktreeService**

Add after the `getWorktree` method (line 143 of `worktree-service.ts`):

```typescript
getWorktreePoolPath(): string {
  return this.worktreePoolPath;
}

async getAllCheckedOutBranches(): Promise<
  Array<{ branch: string; path: string; isMainWorktree: boolean }>
> {
  try {
    const { stdout } = await this.ctx.exec('git', ['worktree', 'list', '--porcelain']);
    const blocks = stdout.split('\n\n').filter(Boolean);
    const result: Array<{ branch: string; path: string; isMainWorktree: boolean }> = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const pathMatch = /^worktree (.+)$/m.exec(block);
      const branchMatch = /^branch refs\/heads\/(.+)$/m.exec(block);
      if (!pathMatch || !branchMatch) continue;
      result.push({ branch: branchMatch[1], path: pathMatch[1], isMainWorktree: i === 0 });
    }
    return result;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- worktree-service
```

Expected: PASS for all `getAllCheckedOutBranches` and `getWorktreePoolPath` tests

- [ ] **Step 5: Commit**

```bash
git add src/main/core/projects/worktrees/worktree-service.ts src/main/core/projects/worktrees/worktree-service.test.ts
git commit -m "feat(worktree-service): add getAllCheckedOutBranches and getWorktreePoolPath"
```

---

## Task 2: Test — verify `checkoutExistingBranch` handles the project-root branch

**Files:**
- Test: `src/main/core/projects/worktrees/worktree-service.test.ts`

This verifies existing behavior before touching it.

- [ ] **Step 1: Add test inside `describe('WorktreeService')`**

```typescript
describe('checkoutExistingBranch', () => {
  it('returns the project root path when the branch is checked out there', async () => {
    const svc = makeService();
    // 'main' is checked out at repoDir — no worktree needed
    const result = await svc.checkoutExistingBranch('main');
    expect(result).toEqual(ok(repoDir));
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test -- worktree-service
```

Expected: PASS (behavior already exists via `findCheckedOutPathForBranch`). If it fails, investigate before continuing — do not skip.

- [ ] **Step 3: Commit**

```bash
git add src/main/core/projects/worktrees/worktree-service.test.ts
git commit -m "test(worktree-service): verify checkoutExistingBranch handles project root"
```

---

## Task 3: Shared types + `getProjectBranchesWithStatus` operation

**Files:**
- Modify: `src/shared/projects.ts`
- Create: `src/main/core/projects/operations/getProjectBranchesWithStatus.ts`
- Modify: `src/main/core/projects/controller.ts`

- [ ] **Step 1: Add types to `src/shared/projects.ts`**

Append to the end of the file:

```typescript
export type BranchWithStatus = {
  branch: string;
  worktreePath?: string;
  isProjectRoot: boolean;
  usedByTask?: { id: string; name: string };
};

export type ProjectBranchesStatusResult = {
  worktreePoolPath: string;
  statuses: BranchWithStatus[];
};
```

- [ ] **Step 2: Create `src/main/core/projects/operations/getProjectBranchesWithStatus.ts`**

```typescript
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { ProjectBranchesStatusResult } from '@shared/projects';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import { projectManager } from '../project-manager';

export async function getProjectBranchesWithStatus({
  projectId,
}: {
  projectId: string;
}): Promise<ProjectBranchesStatusResult> {
  const provider = projectManager.getProject(projectId);
  if (!provider) return { worktreePoolPath: '', statuses: [] };

  const [checkedOutBranches, activeTasks] = await Promise.all([
    provider.worktreeService.getAllCheckedOutBranches(),
    db
      .select({ id: tasks.id, name: tasks.name, taskBranch: tasks.taskBranch })
      .from(tasks)
      .where(
        and(eq(tasks.projectId, projectId), isNull(tasks.archivedAt), isNotNull(tasks.taskBranch))
      ),
  ]);

  const worktreeMap = new Map(checkedOutBranches.map((w) => [w.branch, w]));
  const taskMap = new Map(
    activeTasks.map((t) => [t.taskBranch!, { id: t.id, name: t.name }])
  );

  const result: ProjectBranchesStatusResult['statuses'] = [];

  for (const [branch, worktree] of worktreeMap) {
    result.push({
      branch,
      worktreePath: worktree.path,
      isProjectRoot: worktree.isMainWorktree,
      usedByTask: taskMap.get(branch),
    });
  }

  for (const [branch, task] of taskMap) {
    if (!worktreeMap.has(branch)) {
      result.push({ branch, isProjectRoot: false, usedByTask: task });
    }
  }

  return { worktreePoolPath: provider.worktreeService.getWorktreePoolPath(), statuses: result };
}
```

- [ ] **Step 3: Register in `src/main/core/projects/controller.ts`**

```typescript
import { createRPCController } from '@shared/ipc/rpc';
import { createProject, inspectProjectPath } from './operations/createProject';
import { deleteProject } from './operations/deleteProject';
import { getProjectBranchesWithStatus } from './operations/getProjectBranchesWithStatus';
import { getProjects } from './operations/getProjects';
import { openProject } from './operations/openProject';
import { updateProjectConnection } from './operations/updateProjectConnection';
import {
  getProjectSettingsPage,
  shareProjectSettingsToConfig,
  updateProjectSettings,
} from './settings/project-settings-service';

export const projectController = createRPCController({
  createProject,
  inspectProjectPath,
  getProjects,
  deleteProject,
  getProjectSettingsPage,
  updateProjectSettings,
  shareProjectSettingsToConfig,
  updateProjectConnection,
  openProject,
  getProjectBranchesWithStatus,
});
```

- [ ] **Step 4: Run typecheck to verify IPC wiring**

```bash
pnpm run typecheck
```

Expected: no errors in the modified files

- [ ] **Step 5: Commit**

```bash
git add src/shared/projects.ts src/main/core/projects/operations/getProjectBranchesWithStatus.ts src/main/core/projects/controller.ts
git commit -m "feat: add getProjectBranchesWithStatus IPC operation"
```

---

## Task 4: Enhance `BranchSelector` with subtitle/badge/disabled per-item

**Files:**
- Modify: `src/renderer/lib/components/branch-selector.tsx`
- Modify: `src/renderer/lib/components/project-branch-selector.tsx`

- [ ] **Step 1: Add `getExtraProps` to `BranchSelectorProps` and apply it**

In `branch-selector.tsx`, change the `BranchSelectorProps` interface and `options` memo:

```typescript
interface BranchSelectorProps {
  branches: Branch[];
  value?: Branch;
  onValueChange: (value: Branch) => void;
  remoteOnly?: boolean;
  trigger?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  getExtraProps?: (branch: Branch) => {
    subtitle?: string;
    badge?: string;
    disabled?: boolean;
  };
}
```

Update the `options` memo (replace the existing one):

```typescript
const options = useMemo(
  () =>
    filteredBranches.map((branch) => {
      const extra = getExtraProps?.(branch);
      return {
        value: branch,
        label: getBranchLabel(branch),
        disabled: branch.branch.startsWith('_reserve') || (extra?.disabled ?? false),
        subtitle: extra?.subtitle,
        badge: extra?.badge,
      };
    }),
  [filteredBranches, getExtraProps]
);
```

Update the `ComboboxList` render (replace existing):

```tsx
<ComboboxList>
  {(item) => (
    <ComboboxItem value={item} disabled={item.disabled}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span>{item.label}</span>
          {item.badge && (
            <span className="text-xs text-foreground-muted">{item.badge}</span>
          )}
        </div>
        {item.subtitle && (
          <span className="text-xs text-foreground-muted truncate">{item.subtitle}</span>
        )}
      </div>
    </ComboboxItem>
  )}
</ComboboxList>
```

- [ ] **Step 2: Pass `getExtraProps` through in `project-branch-selector.tsx`**

```typescript
export interface ProjectBranchSelectorProps {
  projectId: string;
  value?: Branch;
  onValueChange: (value: Branch) => void;
  remoteOnly?: boolean;
  trigger?: React.ReactNode;
  getExtraProps?: (branch: Branch) => { subtitle?: string; badge?: string; disabled?: boolean };
}

export const ProjectBranchSelector = observer(function ProjectBranchSelector({
  projectId,
  value,
  onValueChange,
  remoteOnly,
  trigger,
  getExtraProps,
}: ProjectBranchSelectorProps) {
  const repo = getRepositoryStore(projectId);
  const configuredRemoteName = repo?.configuredRemote.name ?? 'origin';

  const branches: Branch[] = repo
    ? repo.branches.filter(
        (b) => b.type === 'local' || (b.type === 'remote' && b.remote.name === configuredRemoteName)
      )
    : [];

  return (
    <BranchSelector
      branches={branches}
      value={value}
      onValueChange={onValueChange}
      remoteOnly={remoteOnly}
      trigger={trigger}
      onRefresh={() => repo?.refresh()}
      isRefreshing={repo?.loading ?? false}
      getExtraProps={getExtraProps}
    />
  );
});
```

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/lib/components/branch-selector.tsx src/renderer/lib/components/project-branch-selector.tsx
git commit -m "feat(branch-selector): add subtitle, badge, and per-branch disabled support"
```

---

## Task 5: Update `use-branch-selection.ts` — replace boolean with `branchMode`

**Files:**
- Modify: `src/renderer/features/tasks/create-task-modal/use-branch-selection.ts`

- [ ] **Step 1: Replace `createBranchAndWorktree` boolean with `branchMode`**

Replace the entire file content:

```typescript
import { useCallback, useState } from 'react';
import type { Branch } from '@shared/git';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';

export type BranchMode = 'new-branch' | 'checkout';
export type BranchSelectionState = ReturnType<typeof useBranchSelection>;

export function useBranchSelection(
  selectedProjectId: string | undefined,
  defaultBranch: Branch | undefined,
  isUnborn: boolean,
  currentBranchName?: string | null
) {
  const { value: project } = useAppSettingsKey('project');
  const pushOnCreateByDefault = project?.pushOnCreate ?? true;

  const [branchModePreference, setBranchModePreference] = useState<BranchMode>('new-branch');
  const [pushBranchOverride, setPushBranchOverride] = useState<boolean | undefined>(undefined);

  const branchMode: BranchMode = isUnborn ? 'checkout' : branchModePreference;
  const pushBranch = pushBranchOverride ?? pushOnCreateByDefault;

  const [branchOverride, setBranchOverride] = useState<
    { projectId: string; branch: Branch } | undefined
  >(undefined);

  const defaultSelectedBranch: Branch | undefined =
    currentBranchName ? { type: 'local', branch: currentBranchName } : defaultBranch;

  const selectedBranch: Branch | undefined =
    branchOverride !== undefined && branchOverride.projectId === selectedProjectId
      ? branchOverride.branch
      : branchMode === 'new-branch'
        ? defaultBranch
        : defaultSelectedBranch;

  const setSelectedBranch = useCallback(
    (branch: Branch | undefined) => {
      if (!selectedProjectId || !branch) {
        setBranchOverride(undefined);
        return;
      }
      setBranchOverride({ projectId: selectedProjectId, branch });
    },
    [selectedProjectId]
  );

  const setPushBranch = useCallback((value: boolean) => {
    setPushBranchOverride(value);
  }, []);

  const setBranchMode = useCallback(
    (value: BranchMode) => {
      if (isUnborn) return;
      setBranchModePreference(value);
      setBranchOverride(undefined);
    },
    [isUnborn]
  );

  return {
    branchMode,
    setBranchMode,
    selectedBranch,
    setSelectedBranch,
    pushBranch,
    setPushBranch,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm run typecheck
```

Expected: errors in callers of `createBranchAndWorktree` — those get fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/tasks/create-task-modal/use-branch-selection.ts
git commit -m "refactor(use-branch-selection): replace createBranchAndWorktree bool with branchMode"
```

---

## Task 6: Update `use-from-branch-mode.ts` — add status query

**Files:**
- Modify: `src/renderer/features/tasks/create-task-modal/use-from-branch-mode.ts`

- [ ] **Step 1: Add `branchStatuses` query**

Replace the entire file:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Branch } from '@shared/git';
import type { ProjectBranchesStatusResult } from '@shared/projects';
import { useTaskSettings } from '@renderer/features/tasks/hooks/useTaskSettings';
import { rpc } from '@renderer/lib/ipc';
import { useBranchSelection } from './use-branch-selection';
import { useTaskName } from './use-task-name';

export type FromBranchModeState = ReturnType<typeof useFromBranchMode>;

export function useFromBranchMode(
  selectedProjectId: string | undefined,
  defaultBranch: Branch | undefined,
  isUnborn: boolean,
  currentBranchName?: string | null
) {
  const branchSelection = useBranchSelection(
    selectedProjectId,
    defaultBranch,
    isUnborn,
    currentBranchName
  );
  const { autoGenerateName } = useTaskSettings();

  const stableKey = useMemo(() => crypto.randomUUID(), []);

  const { data: generatedName, isPending: isGenerating } = useQuery({
    queryKey: ['generateTaskName', 'random', stableKey],
    queryFn: () => rpc.tasks.generateTaskName({}),
    enabled: autoGenerateName,
    refetchOnWindowFocus: false,
  });

  const { data: branchStatuses } = useQuery<ProjectBranchesStatusResult>({
    queryKey: ['branchStatuses', selectedProjectId],
    queryFn: () =>
      rpc.projects.getProjectBranchesWithStatus({ projectId: selectedProjectId! }),
    enabled: branchSelection.branchMode === 'checkout' && !!selectedProjectId,
    refetchOnWindowFocus: false,
  });

  const taskName = useTaskName({
    generatedName: autoGenerateName ? generatedName : undefined,
    isPending: autoGenerateName && isGenerating,
    resetKey: selectedProjectId,
  });

  const isValid =
    taskName.taskName.trim().length > 0 &&
    branchSelection.selectedBranch !== undefined &&
    !taskName.isPending;

  return {
    ...branchSelection,
    ...taskName,
    branchStatuses,
    isValid,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm run typecheck
```

Expected: only errors in downstream consumers (fixed in next tasks)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/tasks/create-task-modal/use-from-branch-mode.ts
git commit -m "feat(use-from-branch-mode): add branch status query for checkout mode"
```

---

## Task 7: Rework `branch-picker-field.tsx`

**Files:**
- Modify: `src/renderer/features/tasks/create-task-modal/branch-picker-field.tsx`

- [ ] **Step 1: Replace entire file**

```typescript
import path from 'path-browserify';
import { ChevronDown, GitBranch } from 'lucide-react';
import { type Branch } from '@shared/git';
import type { BranchWithStatus, ProjectBranchesStatusResult } from '@shared/projects';
import { BranchDisplay } from '@renderer/lib/components/branch-display';
import { ProjectBranchSelector } from '@renderer/lib/components/project-branch-selector';
import { ComboboxTrigger, ComboboxValue } from '@renderer/lib/ui/combobox';
import { Field, FieldLabel } from '@renderer/lib/ui/field';
import { RadioGroup, RadioGroupItem } from '@renderer/lib/ui/radio-group';
import { Switch } from '@renderer/lib/ui/switch';
import { cn } from '@renderer/utils/utils';
import type { BranchMode, BranchSelectionState } from './use-branch-selection';

interface BranchPickerFieldProps {
  state: BranchSelectionState;
  projectId?: string;
  currentBranch?: string | null;
  label?: string;
  className?: string;
  isUnborn?: boolean;
  branchStatuses?: ProjectBranchesStatusResult;
  taskBranchName?: string;
}

function getBranchStatus(
  branch: Branch | undefined,
  branchStatuses: ProjectBranchesStatusResult | undefined
): BranchWithStatus | undefined {
  if (!branch || !branchStatuses) return undefined;
  return branchStatuses.statuses.find((s) => s.branch === branch.branch);
}

function CheckoutInfoMessage({
  branch,
  branchStatuses,
}: {
  branch: Branch | undefined;
  branchStatuses: ProjectBranchesStatusResult | undefined;
}) {
  const status = getBranchStatus(branch, branchStatuses);
  if (!branch) return null;

  if (!status || (!status.worktreePath && !status.usedByTask)) {
    const poolPath = branchStatuses?.worktreePoolPath;
    const newPath = poolPath ? path.join(poolPath, branch.branch) : undefined;
    return (
      <p className="text-xs text-foreground-muted px-2 py-1.5">
        {newPath ? `Will create new worktree at ${newPath}` : 'Will create new worktree'}
      </p>
    );
  }

  if (status.isProjectRoot) {
    return (
      <p className="text-xs text-foreground-muted px-2 py-1.5">
        Will use project root at {status.worktreePath}
      </p>
    );
  }

  if (status.worktreePath) {
    return (
      <p className="text-xs text-foreground-muted px-2 py-1.5">
        Will reuse existing worktree at {status.worktreePath}
      </p>
    );
  }

  return null;
}

function NewBranchInfoMessage({
  taskBranchName,
  poolPath,
}: {
  taskBranchName?: string;
  poolPath?: string;
}) {
  if (!taskBranchName) return null;
  const worktreePath = poolPath ? path.join(poolPath, taskBranchName) : undefined;
  return (
    <p className="text-xs text-foreground-muted px-2 py-1.5">
      {worktreePath
        ? `Will create branch '${taskBranchName}' and worktree at ${worktreePath}`
        : `Will create branch '${taskBranchName}'`}
    </p>
  );
}

export function BranchPickerField({
  state,
  projectId,
  currentBranch,
  label = 'From Branch',
  className,
  isUnborn = false,
  branchStatuses,
  taskBranchName,
}: BranchPickerFieldProps) {
  const { branchMode, setBranchMode, pushBranch, setPushBranch, selectedBranch, setSelectedBranch } =
    state;

  function getExtraProps(branch: Branch) {
    const status = branchStatuses?.statuses.find((s) => s.branch === branch.branch);
    if (!status) return {};
    const subtitle = status.isProjectRoot
      ? `Project root: ${status.worktreePath}`
      : status.worktreePath
        ? `Worktree: ${status.worktreePath}`
        : undefined;
    const badge = status.usedByTask ? `(used by ${status.usedByTask.name})` : undefined;
    const disabled = !!status.usedByTask;
    return { subtitle, badge, disabled };
  }

  return (
    <div className={cn('border border-border rounded-md overflow-hidden', className)}>
      {!isUnborn && (
        <div className="border-b border-border p-2">
          <RadioGroup
            value={branchMode}
            onValueChange={(v) => setBranchMode(v as BranchMode)}
            className="flex gap-2"
          >
            <Field orientation="horizontal">
              <RadioGroupItem value="new-branch" />
              <FieldLabel>Create new branch/worktree</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem value="checkout" />
              <FieldLabel>Checkout branch/worktree</FieldLabel>
            </Field>
          </RadioGroup>
        </div>
      )}

      {projectId ? (
        <ProjectBranchSelector
          projectId={projectId}
          value={selectedBranch}
          onValueChange={setSelectedBranch}
          getExtraProps={branchMode === 'checkout' ? getExtraProps : undefined}
          trigger={
            <ComboboxTrigger className="flex w-full items-center gap-2 justify-between hover:bg-background-1 data-popup-open:bg-background-1 p-2 outline-none">
              <div className="flex flex-col text-left text-sm gap-0.5">
                <span className="text-foreground-passive text-xs">{label}</span>
                <span className="flex items-center gap-1">
                  <GitBranch
                    absoluteStrokeWidth
                    strokeWidth={2}
                    className="size-3.5 shrink-0 text-foreground-muted"
                  />
                  <ComboboxValue placeholder="Select a branch" />
                </span>
              </div>
              <ChevronDown className="size-4 shrink-0 text-foreground-muted" />
            </ComboboxTrigger>
          }
        />
      ) : currentBranch ? (
        <BranchDisplay label={label} branchName={currentBranch} />
      ) : null}

      <div className="border-t border-border">
        {branchMode === 'checkout' ? (
          <CheckoutInfoMessage branch={selectedBranch} branchStatuses={branchStatuses} />
        ) : (
          <>
            <NewBranchInfoMessage
              taskBranchName={taskBranchName}
              poolPath={branchStatuses?.worktreePoolPath}
            />
            {!isUnborn && (
              <div className="px-2 py-1.5">
                <Field orientation="horizontal">
                  <Switch checked={pushBranch} onCheckedChange={setPushBranch} />
                  <FieldLabel>Push branch to remote</FieldLabel>
                </Field>
              </div>
            )}
          </>
        )}
      </div>

      {isUnborn && (
        <p className="border-t border-border bg-background-1 px-2 py-1 text-xs text-foreground-muted">
          Create an initial commit to enable branch-based tasks.
        </p>
      )}
    </div>
  );
}
```

Note: `path-browserify` may need to be installed if not already available. Check with:
```bash
grep -r "path-browserify" package.json
```
If missing, use string concatenation: `poolPath + '/' + branchName` instead.

- [ ] **Step 2: Check if `path-browserify` is available**

```bash
cd "/Users/avilches/Library/Mobile Documents/com~apple~CloudDocs/Shared/Proy/emdash"
grep "path-browserify" package.json
```

If not found, replace the import and `path.join` calls with:
```typescript
function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}
```
And use `joinPath(poolPath, branch.branch)` instead of `path.join(poolPath, branch.branch)`.

- [ ] **Step 3: Update `from-branch-content.tsx` to pass new props**

The `FromBranchContent` component needs to forward `branchStatuses` and `taskBranchName`. In `from-branch-content.tsx`:

```typescript
import { BranchPickerField } from './branch-picker-field';
import {
  InitialConversationField,
  type InitialConversationState,
} from './initial-conversation-section';
import { TaskNameField } from './task-name-field';
import { type FromBranchModeState } from './use-from-branch-mode';

interface FromBranchContentProps {
  state: FromBranchModeState;
  projectId?: string;
  currentBranch?: string | null;
  isUnborn?: boolean;
  initialConversation: InitialConversationState;
  taskBranchName?: string;
}

export function FromBranchContent({
  state,
  projectId,
  currentBranch,
  isUnborn,
  initialConversation,
  taskBranchName,
}: FromBranchContentProps) {
  return (
    <div className="flex flex-col gap-4">
      <BranchPickerField
        state={state}
        projectId={projectId}
        currentBranch={currentBranch}
        isUnborn={isUnborn}
        branchStatuses={state.branchStatuses}
        taskBranchName={taskBranchName}
      />
      <TaskNameField state={state} />
      <InitialConversationField state={initialConversation} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm run typecheck
```

Expected: errors in `create-task-modal.tsx` where `createBranchAndWorktree` is still referenced. Fixed in next task.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/tasks/create-task-modal/branch-picker-field.tsx src/renderer/features/tasks/create-task-modal/from-branch-content.tsx
git commit -m "feat(branch-picker-field): new mode selector UI with status preview"
```

---

## Task 8: Update strategy + wire `create-task-modal.tsx`

**Files:**
- Modify: `src/renderer/features/tasks/create-task-modal/create-task-strategy.ts`
- Modify: `src/renderer/features/tasks/create-task-modal/create-task-modal.tsx`

- [ ] **Step 1: Update `resolveBranchLikeTaskStrategy` in `create-task-strategy.ts`**

Replace the `resolveBranchLikeTaskStrategy` function:

```typescript
import type { CreateTaskStrategy } from '@shared/tasks';
import type { BranchMode } from './use-branch-selection';

type BranchLikeTaskStrategy = Extract<CreateTaskStrategy, { kind: 'new-branch' | 'no-worktree' | 'checkout-existing' }>;
type PullRequestTaskStrategy = Extract<CreateTaskStrategy, { kind: 'from-pull-request' }>;

export function resolveBranchLikeTaskStrategy(input: {
  isUnborn: boolean;
  branchMode: BranchMode;
  taskBranch: string;
  pushBranch: boolean;
}): BranchLikeTaskStrategy {
  if (input.isUnborn) {
    return { kind: 'no-worktree' };
  }
  if (input.branchMode === 'checkout') {
    return { kind: 'checkout-existing' };
  }
  return {
    kind: 'new-branch',
    taskBranch: input.taskBranch,
    pushBranch: input.pushBranch,
  };
}
```

Keep `resolvePullRequestTaskStrategy` unchanged.

- [ ] **Step 2: Find usages of `createBranchAndWorktree` and `resolveBranchLikeTaskStrategy` in `create-task-modal.tsx`**

```bash
grep -n "createBranchAndWorktree\|resolveBranchLikeTaskStrategy\|taskBranch\|FromBranchContent" \
  "/Users/avilches/Library/Mobile Documents/com~apple~CloudDocs/Shared/Proy/emdash/src/renderer/features/tasks/create-task-modal/create-task-modal.tsx"
```

Note the line numbers. Then update the call to `resolveBranchLikeTaskStrategy` to pass `branchMode` instead of `createBranchAndWorktree`, and pass `taskBranchName` to `FromBranchContent`.

The call site looks like:
```typescript
// Before:
resolveBranchLikeTaskStrategy({
  isUnborn,
  createBranchAndWorktree: fromBranchState.createBranchAndWorktree,
  taskBranch: fromBranchState.taskName,
  pushBranch: fromBranchState.pushBranch,
})

// After:
resolveBranchLikeTaskStrategy({
  isUnborn,
  branchMode: fromBranchState.branchMode,
  taskBranch: fromBranchState.taskName,
  pushBranch: fromBranchState.pushBranch,
})
```

And add `taskBranchName` to `FromBranchContent` usage:
```tsx
<FromBranchContent
  state={fromBranchState}
  projectId={selectedProjectId}
  currentBranch={currentBranch}
  isUnborn={isUnborn}
  initialConversation={initialConversation}
  taskBranchName={fromBranchState.taskName}
/>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
pnpm run format && pnpm run lint && pnpm run typecheck && pnpm test
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/tasks/create-task-modal/create-task-strategy.ts src/renderer/features/tasks/create-task-modal/create-task-modal.tsx
git commit -m "feat: checkout branch/worktree mode in create task modal"
```

---

## Self-Review

**Spec coverage:**
- ✅ Segmented button replacing collapsible+switch
- ✅ Checkout mode shows branch picker with subtitle (worktree/project root path) and badge (used by task)
- ✅ In-use branches grayed out and non-selectable
- ✅ Dynamic message below picker for checkout mode (reuse/root/create new)
- ✅ Dynamic message for new-branch mode (shows branch name and path)
- ✅ Remote-only branches: `checkoutExistingBranch` already handles them; they show with no subtitle
- ✅ Backend: `checkout-existing` strategy for checkout mode
- ✅ Backend: project root branch handled via existing `findCheckedOutPathForBranch`

**Type consistency:**
- `BranchMode` defined in `use-branch-selection.ts`, imported in `create-task-strategy.ts` and `branch-picker-field.tsx`
- `ProjectBranchesStatusResult` and `BranchWithStatus` defined in `src/shared/projects.ts`, used in `use-from-branch-mode.ts` and `branch-picker-field.tsx`
- `getAllCheckedOutBranches` defined in Task 1, used in Task 3 operation
- `getWorktreePoolPath` defined in Task 1, used in Task 3 operation

**Potential issues:**
- `path-browserify` availability checked in Task 7 Step 2 with a fallback
- The `create-task-modal.tsx` Step 2 requires grepping actual line numbers — the plan flags this explicitly

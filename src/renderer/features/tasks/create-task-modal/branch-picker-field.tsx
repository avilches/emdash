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

function joinPath(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

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

  if (status?.isProjectRoot && status.worktreePath) {
    return (
      <p className="text-xs text-foreground-muted px-2 py-1.5">
        Will use project root at {status.worktreePath}
      </p>
    );
  }

  if (status?.worktreePath) {
    return (
      <p className="text-xs text-foreground-muted px-2 py-1.5">
        Will reuse existing worktree at {status.worktreePath}
      </p>
    );
  }

  const poolPath = branchStatuses?.worktreePoolPath;
  const newPath = poolPath ? joinPath(poolPath, branch.branch) : undefined;
  return (
    <p className="text-xs text-foreground-muted px-2 py-1.5">
      {newPath ? `Will create new worktree at ${newPath}` : 'Will create new worktree'}
    </p>
  );
}

function NewBranchInfoMessage({
  taskBranchName,
  poolPath,
}: {
  taskBranchName?: string;
  poolPath?: string;
}) {
  if (!taskBranchName) return null;
  const worktreePath = poolPath ? joinPath(poolPath, taskBranchName) : undefined;
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
            className="flex gap-4"
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
          showRemoteSelectorFooter
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

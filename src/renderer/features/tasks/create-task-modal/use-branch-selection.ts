import { useCallback, useState } from 'react';
import type { Branch } from '@shared/git';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';

export type BranchMode = 'new-branch' | 'checkout';
export type BranchSelectionState = ReturnType<typeof useBranchSelection>;

export function useBranchSelection(
  selectedProjectId: string | undefined,
  defaultBranch: Branch | undefined,
  isUnborn: boolean,
  currentBranchName?: string | null,
  createBranchAndWorktreeByDefault = true
) {
  const { value: project } = useAppSettingsKey('project');
  const pushOnCreateByDefault = project?.pushOnCreate ?? true;

  const [branchModePreference, setBranchModePreference] = useState<BranchMode>(
    createBranchAndWorktreeByDefault ? 'new-branch' : 'checkout'
  );
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

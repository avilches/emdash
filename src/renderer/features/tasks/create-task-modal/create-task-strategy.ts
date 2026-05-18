import type { CreateTaskStrategy } from '@shared/tasks';
import type { BranchMode } from './use-branch-selection';

type BranchLikeTaskStrategy = Extract<
  CreateTaskStrategy,
  { kind: 'new-branch' | 'no-worktree' | 'checkout-existing' }
>;
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

export function resolvePullRequestTaskStrategy(input: {
  checkoutMode: 'checkout' | 'new-branch';
  prNumber: number;
  headBranch: string;
  headRepositoryUrl: string;
  isFork: boolean;
  taskBranch: string;
  pushBranch: boolean;
}): PullRequestTaskStrategy {
  if (input.checkoutMode === 'checkout') {
    return {
      kind: 'from-pull-request',
      prNumber: input.prNumber,
      headBranch: input.headBranch,
      headRepositoryUrl: input.headRepositoryUrl,
      isFork: input.isFork,
    };
  }

  return {
    kind: 'from-pull-request',
    prNumber: input.prNumber,
    headBranch: input.headBranch,
    headRepositoryUrl: input.headRepositoryUrl,
    isFork: input.isFork,
    taskBranch: input.taskBranch,
    pushBranch: input.pushBranch,
  };
}

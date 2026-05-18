import { describe, expect, it } from 'vitest';
import {
  resolveBranchLikeTaskStrategy,
  resolvePullRequestTaskStrategy,
} from '@renderer/features/tasks/create-task-modal/create-task-strategy';

describe('resolveBranchLikeTaskStrategy', () => {
  it('returns new-branch with pushBranch when branchMode is new-branch', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: false,
        branchMode: 'new-branch',
        taskBranch: 'issue-task',
        pushBranch: false,
      })
    ).toEqual({
      kind: 'new-branch',
      taskBranch: 'issue-task',
      pushBranch: false,
    });
  });

  it('returns checkout-existing when branchMode is checkout', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: false,
        branchMode: 'checkout',
        taskBranch: 'issue-task',
        pushBranch: true,
      })
    ).toEqual({ kind: 'checkout-existing' });
  });

  it('returns no-worktree for unborn repositories', () => {
    expect(
      resolveBranchLikeTaskStrategy({
        isUnborn: true,
        branchMode: 'new-branch',
        taskBranch: 'issue-task',
        pushBranch: true,
      })
    ).toEqual({ kind: 'no-worktree' });
  });
});

describe('resolvePullRequestTaskStrategy', () => {
  it('includes taskBranch and pushBranch in new-branch mode', () => {
    expect(
      resolvePullRequestTaskStrategy({
        checkoutMode: 'new-branch',
        prNumber: 42,
        headBranch: 'feature/pr-head',
        headRepositoryUrl: 'https://github.com/contributor/repo',
        isFork: false,
        taskBranch: 'pr-task',
        pushBranch: false,
      })
    ).toEqual({
      kind: 'from-pull-request',
      prNumber: 42,
      headBranch: 'feature/pr-head',
      headRepositoryUrl: 'https://github.com/contributor/repo',
      isFork: false,
      taskBranch: 'pr-task',
      pushBranch: false,
    });
  });

  it('omits taskBranch and pushBranch in checkout mode', () => {
    expect(
      resolvePullRequestTaskStrategy({
        checkoutMode: 'checkout',
        prNumber: 42,
        headBranch: 'feature/pr-head',
        headRepositoryUrl: 'https://github.com/contributor/repo',
        isFork: false,
        taskBranch: 'pr-task',
        pushBranch: false,
      })
    ).toEqual({
      kind: 'from-pull-request',
      prNumber: 42,
      headBranch: 'feature/pr-head',
      headRepositoryUrl: 'https://github.com/contributor/repo',
      isFork: false,
    });
  });
});

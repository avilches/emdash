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
  // Project not mounted — return empty result rather than throwing.
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
    activeTasks.flatMap((t) =>
      t.taskBranch ? [[t.taskBranch, { id: t.id, name: t.name }] as const] : []
    )
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

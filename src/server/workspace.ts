import { mkdir } from "node:fs/promises";
import path from "node:path";

const PROJECT_ID_PATTERN = /^project_[A-Za-z0-9_-]+$/;

export type ProjectWorkspace = {
  projectId: string;
  root: string;
  uploads: string;
  analysis: string;
  renders: string;
  qa: string;
  planPath: string;
};

export async function createProjectWorkspace(workspaceRoot: string, projectId: string): Promise<ProjectWorkspace> {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("Invalid project ID");
  }

  const root = path.join(workspaceRoot, projectId);
  const uploads = path.join(root, "uploads");
  const analysis = path.join(root, "analysis");
  const renders = path.join(root, "renders");
  const qa = path.join(root, "qa");

  await Promise.all([uploads, analysis, renders, qa].map((dir) => mkdir(dir, { recursive: true })));

  return {
    projectId,
    root,
    uploads,
    analysis,
    renders,
    qa,
    planPath: path.join(root, "edit-plan.json")
  };
}

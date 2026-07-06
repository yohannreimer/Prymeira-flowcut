import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { editPlanSchema, type EditPlan } from "./edit-plan";

export type ProjectOrientation = "vertical" | "horizontal" | "original";
export type ProjectLibraryStatus = "missing_plan" | "invalid_plan" | "planned" | "captioned" | "music" | "rendered" | "processing" | "failed";
export type ProjectVersionKind = "rough_cut" | "final_export" | "captions_file" | "music" | "captions_plan";

export type ProjectVersion = {
  kind: ProjectVersionKind;
  label: string;
  createdAt: string;
};

export type ProjectLibraryItem = {
  id: string;
  name: string;
  sourceFileName: string | null;
  createdAt: string;
  updatedAt: string;
  durationSec: number | null;
  orientation: ProjectOrientation;
  status: ProjectLibraryStatus;
  counts: {
    cuts: number;
    captions: number;
  };
  versions: ProjectVersion[];
  outputUrl: string | null;
  finalExportUrl: string | null;
  error: string | null;
};

const PROJECT_ID_PATTERN = /^project_[A-Za-z0-9_-]+$/;
const RECENT_PARTIAL_RENDER_MS = 5 * 60_000;

export async function listProjectLibrary(workspaceRoot: string): Promise<ProjectLibraryItem[]> {
  const entries = await readdir(workspaceRoot, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });

  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && PROJECT_ID_PATTERN.test(entry.name))
      .map((entry) => readProjectLibraryItem(workspaceRoot, entry.name))
  );

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function readProjectLibraryItem(workspaceRoot: string, projectId: string): Promise<ProjectLibraryItem> {
  const projectRoot = path.join(workspaceRoot, projectId);
  const projectStats = await stat(projectRoot);
  const fallbackDate = projectStats.birthtime.toISOString();
  const planPath = path.join(projectRoot, "edit-plan.json");
  const planStats = await stat(planPath).catch(() => null);

  if (!planStats) {
    return {
      id: projectId,
      name: projectId,
      sourceFileName: null,
      createdAt: fallbackDate,
      updatedAt: projectStats.mtime.toISOString(),
      durationSec: null,
      orientation: "original",
      status: "missing_plan",
      counts: { cuts: 0, captions: 0 },
      versions: [],
      outputUrl: null,
      finalExportUrl: null,
      error: null
    };
  }

  const planResult = editPlanSchema.safeParse(JSON.parse(await readFile(planPath, "utf8")));
  if (!planResult.success) {
    return {
      id: projectId,
      name: projectId,
      sourceFileName: null,
      createdAt: fallbackDate,
      updatedAt: newestDate([projectStats.mtime, planStats.mtime]).toISOString(),
      durationSec: null,
      orientation: "original",
      status: "invalid_plan",
      counts: { cuts: 0, captions: 0 },
      versions: [],
      outputUrl: null,
      finalExportUrl: null,
      error: "Plano do projeto inválido."
    };
  }

  const plan = planResult.data;
  const roughCutPath = path.join(projectRoot, "renders", "rough-cut.mp4");
  const captionsPath = path.join(projectRoot, "renders", "captions.vtt");
  const finalExport = await findLatestFinalExport(path.join(projectRoot, "renders"));
  const [roughCutStats, captionsStats, finalExportStats] = await Promise.all([
    stat(roughCutPath).catch(() => null),
    stat(captionsPath).catch(() => null),
    finalExport ? stat(finalExport.filePath).catch(() => null) : null
  ]);
  const versions = buildVersions(plan, roughCutStats?.mtime ?? null, finalExportStats?.mtime ?? null, captionsStats?.mtime ?? null);
  const status = getStatus(plan, roughCutStats?.mtime ?? null);
  const error = getProjectError(plan, roughCutStats?.mtime ?? null);
  const updatedAt = newestDate([
    projectStats.mtime,
    planStats.mtime,
    roughCutStats?.mtime ?? null,
    finalExportStats?.mtime ?? null,
    captionsStats?.mtime ?? null
  ]).toISOString();

  return {
    id: projectId,
    name: getProjectName(plan),
    sourceFileName: path.basename(plan.source.path),
    createdAt: plan.createdAt,
    updatedAt,
    durationSec: plan.source.durationSec,
    orientation: getOrientation(plan),
    status,
    counts: {
      cuts: plan.removed.length,
      captions: plan.captions.length
    },
    versions,
    outputUrl: status === "rendered" && roughCutStats ? `/media/${encodeURIComponent(projectId)}/rough-cut.mp4` : null,
    finalExportUrl: finalExport ? `/media/${encodeURIComponent(projectId)}/${encodeURIComponent(finalExport.fileName)}` : null,
    error
  };
}

function buildVersions(
  plan: EditPlan,
  roughCutMtime: Date | null,
  finalExportMtime: Date | null,
  captionsMtime: Date | null
): ProjectVersion[] {
  const versions: ProjectVersion[] = [];
  if (roughCutMtime) {
    versions.push({ kind: "rough_cut", label: "Rough cut", createdAt: roughCutMtime.toISOString() });
  }
  if (finalExportMtime) {
    versions.push({ kind: "final_export", label: "Final export", createdAt: finalExportMtime.toISOString() });
  }
  if (captionsMtime) {
    versions.push({ kind: "captions_file", label: "Captions file", createdAt: captionsMtime.toISOString() });
  }
  if (plan.audio.music) {
    versions.push({ kind: "music", label: "Music track", createdAt: plan.createdAt });
  }
  if (plan.captions.length > 0) {
    versions.push({ kind: "captions_plan", label: "Plan captions", createdAt: plan.createdAt });
  }
  return versions;
}

function getProjectName(plan: EditPlan) {
  const sourceFileName = path.basename(plan.source.path);
  return sourceFileName || plan.projectId;
}

function getOrientation(plan: EditPlan): ProjectOrientation {
  if (plan.source.height > plan.source.width) return "vertical";
  if (plan.source.width > plan.source.height) return "horizontal";
  return "original";
}

function getStatus(plan: EditPlan, roughCutMtime: Date | null): ProjectLibraryStatus {
  const hasRoughCut = roughCutMtime !== null;
  if (plan.qa.status === "failed") return "failed";
  if (hasRoughCut && plan.qa.status === "not_run" && isRecentPartialRender(roughCutMtime)) return "processing";
  if (hasRoughCut && plan.qa.status === "not_run") return "failed";
  if (hasRoughCut) return "rendered";
  if (plan.audio.music) return "music";
  if (plan.captions.length > 0) return "captioned";
  return "planned";
}

function getProjectError(plan: EditPlan, roughCutMtime: Date | null): string | null {
  const hasRoughCut = roughCutMtime !== null;
  if (plan.qa.status === "failed") {
    return plan.qa.warnings[0] ?? "Processamento falhou.";
  }

  if (hasRoughCut && plan.qa.status === "not_run" && isRecentPartialRender(roughCutMtime)) {
    return null;
  }

  if (hasRoughCut && plan.qa.status === "not_run") {
    return "Render interrompido antes da verificação de qualidade.";
  }

  return null;
}

function isRecentPartialRender(roughCutMtime: Date | null) {
  return roughCutMtime !== null && Date.now() - roughCutMtime.getTime() < RECENT_PARTIAL_RENDER_MS;
}

function newestDate(dates: Array<Date | null>) {
  return new Date(Math.max(...dates.filter((date): date is Date => date !== null).map((date) => date.getTime())));
}

async function findLatestFinalExport(rendersRoot: string): Promise<{ fileName: string; filePath: string } | null> {
  const entries = await readdir(rendersRoot, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".mp4") &&
      entry.name !== "rough-cut.mp4" &&
      entry.name !== "preview-sample.mp4"
    )
    .map((entry) => ({
      fileName: entry.name,
      filePath: path.join(rendersRoot, entry.name)
    }));

  if (candidates.length === 0) return null;
  const withStats = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      mtimeMs: (await stat(candidate.filePath)).mtimeMs
    }))
  );
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0] ?? null;
}

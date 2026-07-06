import { writeFile } from "node:fs/promises";
import { getCutPreset, type CutPresetId } from "../../shared/cut-presets";
import { editPlanSchema, type EditPlan } from "../../shared/edit-plan";
import { analyzeSilence } from "../analyzers/silence";
import type { SilenceInterval } from "../analyzers/silence";
import { probeMedia } from "../media/probe";
import { createEditPlanFromSilences } from "../planner/create-edit-plan";
import { runBasicQa } from "../qa/basic-qa";
import { renderRoughCut } from "../render/render-rough-cut";
import type { ProjectWorkspace } from "../workspace";
import type { JobStore } from "./job-store";
import { runVerticalProjectJob as defaultRunVerticalProjectJob, type RunVerticalProjectJobInput } from "./run-vertical-project-job";

export const DEFAULT_SILENCE_NOISE_DB = -35;
export const DEFAULT_SILENCE_MIN_DURATION_SEC = 0.7;
export const MIN_SILENCE_ANALYSIS_TIMEOUT_MS = 120000;
export const MAX_SILENCE_ANALYSIS_TIMEOUT_MS = 60 * 60 * 1000;

export type RunProjectJobDeps = {
  probeMedia?: typeof probeMedia;
  analyzeSilence?: typeof analyzeSilence;
  createEditPlanFromSilences?: typeof createEditPlanFromSilences;
  renderRoughCut?: typeof renderRoughCut;
  runBasicQa?: typeof runBasicQa;
  runVerticalProjectJob?: (input: RunVerticalProjectJobInput) => Promise<void>;
  now?: () => Date;
};

export type RunProjectJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  sourcePath: string;
  jobs: JobStore;
  cutPresetId?: CutPresetId;
};

function getQaCompletionMessage(status: "passed" | "warning" | "failed") {
  if (status === "passed") {
    return "Rough cut draft passed basic QA";
  }

  if (status === "failed") {
    return "Rough cut draft failed QA";
  }

  return "Rough cut draft is ready with warnings";
}

function getQaCompletionStage(status: "passed" | "warning" | "failed") {
  return status === "failed" ? "qa_failed" : "complete";
}

export function getSilenceAnalysisTimeoutMs(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return MIN_SILENCE_ANALYSIS_TIMEOUT_MS;
  }

  const estimatedTimeoutMs = MIN_SILENCE_ANALYSIS_TIMEOUT_MS + Math.ceil(durationSec * 1500);
  return Math.min(MAX_SILENCE_ANALYSIS_TIMEOUT_MS, Math.max(MIN_SILENCE_ANALYSIS_TIMEOUT_MS, estimatedTimeoutMs));
}

async function writePlanWithQa(plan: EditPlan, planPath: string, qa: { status: "passed" | "warning" | "failed"; warnings: string[] }) {
  plan.qa = {
    status: qa.status,
    warnings: qa.warnings
  };
  await writeFile(planPath, JSON.stringify(editPlanSchema.parse(plan), null, 2));
}

export async function runProjectJob(input: RunProjectJobInput, deps: RunProjectJobDeps = {}) {
  const probe = deps.probeMedia ?? probeMedia;
  const analyze = deps.analyzeSilence ?? analyzeSilence;
  const createPlan = deps.createEditPlanFromSilences ?? createEditPlanFromSilences;
  const render = deps.renderRoughCut ?? renderRoughCut;
  const qaRunner = deps.runBasicQa ?? runBasicQa;
  const now = deps.now ?? (() => new Date());
  const cutPreset = getCutPreset(input.cutPresetId);
  let plan: EditPlan | null = null;
  let qaStarted = false;
  let activeStage = "queued";

  try {
    activeStage = "probe";
    input.jobs.update(input.jobId, { status: "running", stage: "probe", message: "Reading media metadata" });
    const metadata = await probe(input.sourcePath);
    if (metadata.height > metadata.width) {
      const runVerticalProjectJob = deps.runVerticalProjectJob ?? defaultRunVerticalProjectJob;
      await runVerticalProjectJob({
        jobId: input.jobId,
        workspace: input.workspace,
        sourcePath: input.sourcePath,
        jobs: input.jobs,
        metadata
      });
      return;
    }

    let silences: SilenceInterval[] = [];
    if (metadata.hasAudio) {
      activeStage = "analysis";
      input.jobs.update(input.jobId, { status: "running", stage: "analysis", message: "Detecting silence" });
      silences = await analyze(input.sourcePath, {
        noiseDb: cutPreset.noiseDb,
        minDurationSec: cutPreset.minDurationSec,
        timeoutMs: getSilenceAnalysisTimeoutMs(metadata.durationSec)
      });
    }

    activeStage = "planning";
    input.jobs.update(input.jobId, { status: "running", stage: "planning", message: "Creating edit plan" });
    plan = editPlanSchema.parse(
      createPlan({
        projectId: input.workspace.projectId,
        sourcePath: input.sourcePath,
        durationSec: metadata.durationSec,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        hasAudio: metadata.hasAudio,
        silences,
        marginSec: cutPreset.marginSec,
        now: now().toISOString()
      })
    );
    await writeFile(input.workspace.planPath, JSON.stringify(plan, null, 2));

    activeStage = "render";
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "render",
      message: `Rendering ${plan.segments.length} kept segments`,
      planPath: input.workspace.planPath
    });
    const outputPath = await render(plan, input.workspace);

    activeStage = "qa";
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "qa",
      message: "Checking rendered draft",
      outputPath,
      planPath: input.workspace.planPath
    });
    qaStarted = true;
    const qa = await qaRunner(outputPath, { expectedHasAudio: plan.source.hasAudio });
    await writePlanWithQa(plan, input.workspace.planPath, qa);

    input.jobs.update(input.jobId, {
      status: qa.status,
      stage: getQaCompletionStage(qa.status),
      message: getQaCompletionMessage(qa.status),
      outputPath,
      planPath: input.workspace.planPath,
      warnings: qa.warnings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (plan) {
      try {
        await writePlanWithQa(plan, input.workspace.planPath, {
          status: "failed",
          warnings: [qaStarted ? `QA failed to complete: ${message}` : `Render failed during ${activeStage}: ${message}`]
        });
      } catch {
        // Preserve job failure reporting even if the best-effort plan update fails.
      }
    }

    input.jobs.update(input.jobId, {
      status: "failed",
      stage: activeStage,
      message: "Project job failed",
      planPath: plan ? input.workspace.planPath : undefined,
      error: message
    });
  }
}

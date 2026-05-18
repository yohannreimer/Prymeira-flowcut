import { readFile, writeFile } from "node:fs/promises";
import { colorAdjustmentsSchema, colorPresetSchema } from "../../shared/color-presets";
import { editPlanSchema, type EditPlan } from "../../shared/edit-plan";
import type { ManualCut, ManualRenderRequest } from "../../shared/manual-edits";
import { createTimelineSegments } from "../planner/create-edit-plan";
import { runBasicQa } from "../qa/basic-qa";
import { renderRoughCut } from "../render/render-rough-cut";
import type { ProjectWorkspace } from "../workspace";
import type { JobStore } from "./job-store";

export type RunManualRenderJobDeps = {
  renderRoughCut?: typeof renderRoughCut;
  runBasicQa?: typeof runBasicQa;
  now?: () => Date;
};

export type RunManualRenderJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  jobs: JobStore;
  activeCutIds: string[];
  activeCuts?: ManualCut[];
  colorPresetId?: string;
  colorAdjustments?: unknown;
  flipHorizontal?: boolean;
  musicPath?: string | null;
  audioCleanup?: boolean;
  audioDucking?: boolean;
  preview?: ManualRenderRequest["preview"];
};

function getQaCompletionMessage(status: "passed" | "warning" | "failed") {
  if (status === "passed") return "Manual edit passed basic QA";
  if (status === "failed") return "Manual edit failed QA";
  return "Manual edit is ready with warnings";
}

function getQaCompletionStage(status: "passed" | "warning" | "failed") {
  return status === "failed" ? "qa_failed" : "complete";
}

async function readPlan(planPath: string): Promise<EditPlan> {
  return editPlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
}

function getRenderedDurationSec(plan: EditPlan) {
  return plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
}

function sourceToTimelineSec(plan: EditPlan, sourceSec: number) {
  if (sourceSec <= 0) return 0;
  for (const segment of plan.segments) {
    if (sourceSec >= segment.sourceStartSec && sourceSec <= segment.sourceEndSec) {
      return segment.timelineStartSec + (sourceSec - segment.sourceStartSec);
    }
    if (sourceSec < segment.sourceStartSec) {
      return segment.timelineStartSec;
    }
  }
  return getRenderedDurationSec(plan);
}

function createPreviewPlan(plan: EditPlan, preview: NonNullable<ManualRenderRequest["preview"]>) {
  const renderedDurationSec = getRenderedDurationSec(plan);
  const durationSec = Math.min(preview.durationSec ?? 20, renderedDurationSec);
  const requestedFocusSec = preview.focusSourceSec !== undefined
    ? sourceToTimelineSec(plan, preview.focusSourceSec)
    : preview.focusTimelineSec ?? 0;
  const focusSec = Math.min(Math.max(0, requestedFocusSec), renderedDurationSec);
  const startSec = Math.max(0, Math.min(focusSec - durationSec / 2, renderedDurationSec - durationSec));
  const endSec = Math.min(renderedDurationSec, startSec + durationSec);
  let timelineCursor = 0;
  const segments = plan.segments.flatMap((segment, index) => {
    const overlapStartSec = Math.max(segment.timelineStartSec, startSec);
    const overlapEndSec = Math.min(segment.timelineEndSec, endSec);
    if (overlapEndSec <= overlapStartSec) return [];
    const sourceStartSec = segment.sourceStartSec + (overlapStartSec - segment.timelineStartSec);
    const sourceEndSec = segment.sourceStartSec + (overlapEndSec - segment.timelineStartSec);
    const previewSegment = {
      ...segment,
      id: `preview_${index}_${segment.id}`,
      sourceStartSec,
      sourceEndSec,
      timelineStartSec: timelineCursor,
      timelineEndSec: timelineCursor + (sourceEndSec - sourceStartSec)
    };
    timelineCursor = previewSegment.timelineEndSec;
    return [previewSegment];
  });

  return editPlanSchema.parse({
    ...plan,
    segments,
    sections: [],
    captions: [],
    overlays: []
  });
}

export async function runManualRenderJob(input: RunManualRenderJobInput, deps: RunManualRenderJobDeps = {}) {
  const renderer = deps.renderRoughCut ?? renderRoughCut;
  const qaRunner = deps.runBasicQa ?? runBasicQa;
  const now = deps.now ?? (() => new Date());
  const activeCutIds = new Set(input.activeCutIds);
  let outputPath: string | null = null;

  try {
    input.jobs.update(input.jobId, { status: "running", stage: "planning", message: "Applying manual cuts" });
    const currentPlan = await readPlan(input.workspace.planPath);
    const manualCuts = new Map((input.activeCuts ?? []).map((cut) => [cut.id, cut]));
    const removed = currentPlan.removed
      .filter((cut) => activeCutIds.has(cut.id))
      .map((cut) => {
        const manualCut = manualCuts.get(cut.id);
        return manualCut ? { ...cut, startSec: manualCut.startSec, endSec: manualCut.endSec } : cut;
      });
    const segments = createTimelineSegments(currentPlan.source.durationSec, removed);
    const cutsChanged = !sameRemovedIntervals(currentPlan.removed, removed);
    const colorPresetId = colorPresetSchema.catch("neutral").parse(input.colorPresetId ?? currentPlan.color.presetId);
    const colorAdjustments = colorAdjustmentsSchema.parse({
      ...currentPlan.color.adjustments,
      ...(input.colorAdjustments && typeof input.colorAdjustments === "object" ? input.colorAdjustments : {})
    });
    const nextPlan = editPlanSchema.parse({
      ...currentPlan,
      segments,
      removed,
      captions: cutsChanged ? [] : currentPlan.captions,
      overlays: cutsChanged ? [] : currentPlan.overlays,
      color: { presetId: colorPresetId, label: colorPresetId, adjustments: colorAdjustments },
      video: {
        ...currentPlan.video,
        ...(input.flipHorizontal !== undefined ? { flipHorizontal: input.flipHorizontal } : {})
      },
      audio: {
        ...currentPlan.audio,
        music: input.musicPath ? { path: input.musicPath, gainDb: -20, duckUnderSpeechDb: -14 } : null
      },
      qa: { status: "not_run", warnings: [] },
      createdAt: now().toISOString()
    });

    await writeFile(input.workspace.planPath, JSON.stringify(nextPlan, null, 2));

    const preview = input.preview?.enabled === false ? null : input.preview ?? { enabled: true, durationSec: 20 };
    const renderPlan = preview ? createPreviewPlan(nextPlan, preview) : nextPlan;
    const outputFileName = preview ? "preview-sample.mp4" : "rough-cut.mp4";
    const commandLogFileName = preview ? "preview-sample-command.json" : "rough-cut-command.json";
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "render",
      message: preview
        ? `Rendering ${Math.round(preview.durationSec ?? 20)} second edit preview`
        : `Rendering ${segments.length} manually kept segments`,
      planPath: input.workspace.planPath
    });
    outputPath = await renderer(renderPlan, input.workspace, undefined, {
      outputFileName,
      commandLogFileName,
      audioCleanup: input.audioCleanup,
      audioDucking: input.audioDucking
    });

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "qa",
      message: "Checking manual render",
      outputPath,
      planPath: input.workspace.planPath
    });
    const qa = await qaRunner(outputPath, { expectedHasAudio: nextPlan.source.hasAudio });
    const finalPlan = editPlanSchema.parse({ ...nextPlan, qa });
    await writeFile(input.workspace.planPath, JSON.stringify(finalPlan, null, 2));

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
    input.jobs.update(input.jobId, {
      status: "failed",
      stage: "failed",
      message: "Manual render failed",
      outputPath,
      planPath: input.workspace.planPath,
      error: message
    });
  }
}

function sameRemovedIntervals(left: EditPlan["removed"], right: EditPlan["removed"]) {
  if (left.length !== right.length) return false;
  return left.every((cut, index) => {
    const other = right[index];
    return cut.id === other.id
      && cut.reason === other.reason
      && cut.startSec === other.startSec
      && cut.endSec === other.endSec;
  });
}

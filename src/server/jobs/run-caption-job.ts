import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CAPTION_STYLE_ID, type CaptionStyleId } from "../../shared/caption-styles";
import { editPlanSchema } from "../../shared/edit-plan";
import { createVtt, transcribeWithWhisper, type WhisperSegment } from "../captions/whisper";
import { runBasicQa } from "../qa/basic-qa";
import type { ProjectWorkspace } from "../workspace";
import type { JobStore } from "./job-store";

export type RunCaptionJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  jobs: JobStore;
  captionStyleId?: CaptionStyleId;
};

export type RunCaptionJobDeps = {
  transcribeWithWhisper?: typeof transcribeWithWhisper;
  runBasicQa?: typeof runBasicQa;
};

export async function runCaptionJob(input: RunCaptionJobInput, deps: RunCaptionJobDeps = {}) {
  const transcribe = deps.transcribeWithWhisper ?? transcribeWithWhisper;
  const qaRunner = deps.runBasicQa ?? runBasicQa;
  try {
    input.jobs.update(input.jobId, { status: "running", stage: "captions", message: "Transcribing with Whisper" });
    const plan = editPlanSchema.parse(JSON.parse(await readFile(input.workspace.planPath, "utf8")));
    const renderPath = path.join(input.workspace.renders, "rough-cut.mp4");
    const segments = await transcribe(renderPath);
    const renderedDurationSec = getRenderedDurationSec(plan);
    const normalizedSegments = normalizeSegmentsToRenderedDuration(segments, renderedDurationSec);
    const captions = normalizedSegments.map((segment, index) => ({
      id: `cap_${index + 1}`,
      startSec: Number(segment.startSec.toFixed(3)),
      endSec: Number(segment.endSec.toFixed(3)),
      text: segment.text,
      styleId: input.captionStyleId ?? DEFAULT_CAPTION_STYLE_ID,
      words: segment.words.map((word, wordIndex) => {
        const startSec = Math.max(segment.startSec, word.startSec);
        const endSec = Math.min(segment.endSec, word.endSec);
        return {
          id: `cap_${index + 1}_w${wordIndex + 1}`,
          startSec: Number(startSec.toFixed(3)),
          endSec: Number(endSec.toFixed(3)),
          text: word.text
        };
      }).filter((word) => word.endSec > word.startSec)
    }));
    const nextPlan = editPlanSchema.parse({ ...plan, captions });
    await writeFile(input.workspace.planPath, JSON.stringify(nextPlan, null, 2));
    await writeFile(path.join(input.workspace.renders, "captions.vtt"), createVtt(normalizedSegments));

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "qa",
      message: "Checking caption timeline",
      outputPath: renderPath,
      planPath: input.workspace.planPath
    });
    const qa = await qaRunner(renderPath, { expectedHasAudio: nextPlan.source.hasAudio });
    const finalPlan = editPlanSchema.parse({ ...nextPlan, qa });
    await writeFile(input.workspace.planPath, JSON.stringify(finalPlan, null, 2));

    input.jobs.update(input.jobId, {
      status: qa.status,
      stage: qa.status === "failed" ? "qa_failed" : "complete",
      message: `Generated ${captions.length} captions`,
      outputPath: renderPath,
      planPath: input.workspace.planPath,
      warnings: qa.warnings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    input.jobs.update(input.jobId, {
      status: "failed",
      stage: "failed",
      message: "Whisper captions failed",
      planPath: input.workspace.planPath,
      error: message
    });
  }
}

function normalizeSegmentsToRenderedDuration(segments: WhisperSegment[], renderedDurationSec: number): WhisperSegment[] {
  return segments
    .map((segment) => {
      const startSec = clampTime(segment.startSec, renderedDurationSec);
      const endSec = clampTime(segment.endSec, renderedDurationSec);
      return {
        ...segment,
        startSec,
        endSec,
        words: segment.words
          .map((word) => ({
            ...word,
            startSec: clampTime(word.startSec, renderedDurationSec),
            endSec: clampTime(word.endSec, renderedDurationSec)
          }))
          .filter((word) => word.endSec > word.startSec)
      };
    })
    .filter((segment) => segment.endSec > segment.startSec && segment.text.trim().length > 0);
}

function clampTime(value: number, renderedDurationSec: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, value), renderedDurationSec);
}

function getRenderedDurationSec(plan: ReturnType<typeof editPlanSchema.parse>) {
  return plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
}

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { editPlanSchema, type Caption } from "../../shared/edit-plan";
import { transcribeWithWhisper, type WhisperSegment } from "../captions/whisper";
import { planMotionWithAI } from "../motion/ai-motion-planner";
import type { ProjectWorkspace } from "../workspace";
import type { JobStore } from "./job-store";

export type RunMotionJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  jobs: JobStore;
};

export type RunMotionJobDeps = {
  transcribeWithWhisper?: typeof transcribeWithWhisper;
  planMotionWithAI?: typeof planMotionWithAI;
};

export async function runMotionJob(input: RunMotionJobInput, deps: RunMotionJobDeps = {}) {
  const transcribe = deps.transcribeWithWhisper ?? transcribeWithWhisper;
  const planWithAI = deps.planMotionWithAI ?? planMotionWithAI;

  try {
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "motion_transcript",
      message: "Preparing transcript for AI motion",
      planPath: input.workspace.planPath
    });

    const plan = editPlanSchema.parse(JSON.parse(await readFile(input.workspace.planPath, "utf8")));
    const transcript = plan.captions.length > 0
      ? captionsToTranscript(plan.captions)
      : await transcribe(await pickTranscriptionSource(input.workspace, plan.source.path));

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "motion_ai",
      message: "Planning Remotion edits with AI",
      planPath: input.workspace.planPath
    });

    const motionTreatments = await planWithAI(plan, transcript);
    const sections = plan.sections.map((section, index) => ({
      ...section,
      treatments: {
        ...section.treatments,
        motion: motionTreatments[index] ?? { enabled: false, slots: [] },
        captions: section.treatments.captions ?? { enabled: false }
      }
    }));
    const motionCount = motionTreatments.reduce((total, treatment) => total + treatment.slots.length, 0);
    const nextPlan = editPlanSchema.parse({ ...plan, sections });
    await writeFile(input.workspace.planPath, JSON.stringify(nextPlan, null, 2));

    input.jobs.update(input.jobId, {
      status: motionCount > 0 ? "passed" : "warning",
      stage: "complete",
      message: `Planned ${motionCount} AI motions`,
      outputPath: path.join(input.workspace.renders, "rough-cut.mp4"),
      planPath: input.workspace.planPath,
      warnings: motionCount > 0 ? [] : ["A IA nao encontrou bons pontos de motion no video."]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown motion error";
    input.jobs.update(input.jobId, {
      status: "failed",
      stage: "failed",
      message: "AI motion planning failed",
      planPath: input.workspace.planPath,
      error: message
    });
  }
}

function captionsToTranscript(captions: Caption[]): WhisperSegment[] {
  return captions.map((caption) => ({
    startSec: caption.startSec,
    endSec: caption.endSec,
    text: caption.text,
    words: caption.words.map((word) => ({
      startSec: word.startSec,
      endSec: word.endSec,
      text: word.text
    }))
  }));
}

async function pickTranscriptionSource(workspace: ProjectWorkspace, fallbackSourcePath: string) {
  const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
  return access(roughCutPath).then(() => roughCutPath, () => fallbackSourcePath);
}

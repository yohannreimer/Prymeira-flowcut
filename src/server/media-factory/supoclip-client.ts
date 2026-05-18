import fs from "node:fs/promises";
import path from "node:path";
import { createSupoClipAuthHeaders } from "./supoclip-auth";
import { silentProgressReporter, type ProgressReporter } from "./progress";

export type SupoClipFetch = typeof fetch;

export type SupoClipClientInput = {
  backendUrl: string;
  userId: string;
  authSecret?: string;
  fetch?: SupoClipFetch;
};

export type SupoClipUploadInput = SupoClipClientInput & {
  sourcePath: string;
};

export type SupoClipCreateTaskInput = SupoClipClientInput & {
  videoPath: string;
  title?: string;
  captionTemplate: string;
  processingMode: "fast" | "balanced" | "quality";
  outputFormat: "vertical" | "original";
  addSubtitles: boolean;
  cutLongPauses: boolean;
};

export type SupoClipTaskInput = SupoClipClientInput & {
  taskId: string;
};

export type SupoClipWaitInput = SupoClipTaskInput & {
  progress?: ProgressReporter;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
};

export type SupoClipClipDownloadInput = SupoClipTaskInput & {
  clipId: string;
};

export type SupoClipTaskStatus = {
  status: string;
  [key: string]: unknown;
};

export type SupoClipClip = {
  clip_id: string;
  [key: string]: unknown;
};

export async function checkSupoClipHealth(input: SupoClipClientInput): Promise<boolean> {
  const response = await request(input, "/health");
  await assertOk(response, "/health");

  const body = (await response.json()) as { ok?: unknown; status?: unknown };
  return body.ok === true || body.status === "healthy";
}

export async function uploadSupoClipVideo(input: SupoClipUploadInput): Promise<string> {
  const bytes = await fs.readFile(input.sourcePath);
  const form = new FormData();
  form.append("video", new Blob([bytes]), path.basename(input.sourcePath));

  const response = await request(input, "/upload", {
    method: "POST",
    body: form
  });
  await assertOk(response, "/upload");

  const body = (await response.json()) as { video_path?: unknown };
  if (typeof body.video_path !== "string" || body.video_path.length === 0) {
    throw new Error("SupoClip /upload returned an invalid video_path");
  }
  return body.video_path;
}

export async function createSupoClipTask(input: SupoClipCreateTaskInput): Promise<string> {
  const response = await request(input, "/tasks/", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      source: {
        url: input.videoPath,
        title: input.title
      },
      caption_template: input.captionTemplate,
      processing_mode: input.processingMode,
      output_format: input.outputFormat,
      add_subtitles: input.addSubtitles,
      cut_long_pauses: input.cutLongPauses
    })
  });
  await assertOk(response, "/tasks/");

  const body = (await response.json()) as { task_id?: unknown };
  if (typeof body.task_id !== "string" || body.task_id.length === 0) {
    throw new Error("SupoClip /tasks returned an invalid task_id");
  }
  return body.task_id;
}

export async function waitForSupoClipTask(input: SupoClipWaitInput): Promise<SupoClipTaskStatus> {
  const progress = input.progress ?? silentProgressReporter;
  const maxPollAttempts = input.maxPollAttempts ?? 120;
  const pollIntervalMs = input.pollIntervalMs ?? 5000;

  for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
    progress.poll(`SupoClip processando task ${input.taskId}...`);
    const endpoint = `/tasks/${encodeURIComponent(input.taskId)}`;
    const response = await request(input, endpoint);
    await assertOk(response, endpoint);

    const status = (await response.json()) as SupoClipTaskStatus;
    if (status.status === "completed") return status;
    if (status.status === "error" || status.status === "failed") {
      throw new Error(`SupoClip task ${input.taskId} ended with status ${status.status}`);
    }

    if (attempt < maxPollAttempts) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`SupoClip task ${input.taskId} did not complete after ${maxPollAttempts} attempts`);
}

export async function listSupoClipClips(input: SupoClipTaskInput): Promise<SupoClipClip[]> {
  const endpoint = `/tasks/${encodeURIComponent(input.taskId)}/clips`;
  const response = await request(input, endpoint);
  await assertOk(response, endpoint);

  const body = (await response.json()) as { clips?: unknown };
  if (!Array.isArray(body.clips)) {
    throw new Error(`SupoClip ${endpoint} returned an invalid clips list`);
  }
  const normalizedClips = body.clips.map((clip, index) => {
    const normalized = normalizeSupoClipClip(clip);
    if (!normalized) {
      throw new Error(`SupoClip ${endpoint} returned an invalid clip at index ${index}`);
    }
    return normalized;
  });
  return normalizedClips;
}

export async function downloadSupoClipClip(input: SupoClipClipDownloadInput): Promise<Uint8Array> {
  const endpoint = `/tasks/${encodeURIComponent(input.taskId)}/clips/${encodeURIComponent(input.clipId)}/file`;
  const response = await request(input, endpoint);
  await assertOk(response, endpoint);

  return new Uint8Array(await response.arrayBuffer());
}

export async function processSupoClipVideo(input: {
  backendUrl: string;
  userId: string;
  authSecret?: string;
  sourcePath: string;
  title?: string;
  captionTemplate: string;
  processingMode: "fast" | "balanced" | "quality";
  outputFormat: "vertical" | "original";
  addSubtitles: boolean;
  cutLongPauses: boolean;
  fetch?: SupoClipFetch;
  progress?: ProgressReporter;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<{ taskId: string; clips: Array<SupoClipClip & { bytes: Uint8Array }> }> {
  const progress = input.progress ?? silentProgressReporter;
  const client = {
    backendUrl: input.backendUrl,
    userId: input.userId,
    authSecret: input.authSecret,
    fetch: input.fetch
  };

  const healthy = await checkSupoClipHealth(client);
  if (!healthy) {
    throw new Error("SupoClip /health returned unhealthy status");
  }

  progress.info("SupoClip enviando video...");
  const videoPath = await uploadSupoClipVideo({
    ...client,
    sourcePath: input.sourcePath
  });

  progress.info("SupoClip criando task...");
  const taskId = await createSupoClipTask({
    ...client,
    videoPath,
    title: input.title,
    captionTemplate: input.captionTemplate,
    processingMode: input.processingMode,
    outputFormat: input.outputFormat,
    addSubtitles: input.addSubtitles,
    cutLongPauses: input.cutLongPauses
  });

  await waitForSupoClipTask({
    ...client,
    taskId,
    progress,
    maxPollAttempts: input.maxPollAttempts,
    pollIntervalMs: input.pollIntervalMs
  });

  const clips = await listSupoClipClips({ ...client, taskId });
  const clipsWithBytes = await Promise.all(
    clips.map(async (clip) => ({
      ...clip,
      bytes: await downloadSupoClipClip({ ...client, taskId, clipId: clip.clip_id })
    }))
  );

  return {
    taskId,
    clips: clipsWithBytes
  };
}

async function request(input: SupoClipClientInput, endpoint: string, init: RequestInit = {}): Promise<Response> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(
    createSupoClipAuthHeaders({
      userId: input.userId,
      secret: input.authSecret
    })
  )) {
    headers.set(key, value);
  }

  return fetchImpl(new URL(endpoint, normalizedBaseUrl(input.backendUrl)), {
    ...init,
    headers
  });
}

async function assertOk(response: Response, endpoint: string): Promise<void> {
  if (response.ok) return;

  throw new Error(`SupoClip ${endpoint} failed with status ${response.status} ${response.statusText}`.trim());
}

function normalizedBaseUrl(backendUrl: string): string {
  return backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`;
}

function normalizeSupoClipClip(value: unknown): SupoClipClip | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const clip = value as Record<string, unknown>;
  const clipId = typeof clip.clip_id === "string" ? clip.clip_id : typeof clip.id === "string" ? clip.id : "";
  if (clipId.trim().length === 0) {
    return null;
  }

  const score =
    typeof clip.score === "number"
      ? clip.score
      : typeof clip.relevance_score === "number"
        ? clip.relevance_score
        : undefined;

  return {
    ...clip,
    ...(score === undefined ? {} : { score }),
    clip_id: clipId
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

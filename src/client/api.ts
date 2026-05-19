import type { CutPresetId } from "../shared/cut-presets";
import type { ColorAdjustments, ColorPresetId } from "../shared/color-presets";
import type {
  Caption,
  CaptionSettings,
  PublishReadiness,
  RemovedInterval,
  TimelineSection,
  TimelineSegment
} from "../shared/edit-plan";
import type { ExportSettings } from "../shared/export-settings";
import type { CaptionStyleId } from "../shared/caption-styles";
import type { ManualCut } from "../shared/manual-edits";
import type { ProjectLibraryItem } from "../shared/project-library";

export type ProjectJob = {
  id: string;
  projectId: string;
  status: "queued" | "running" | "passed" | "warning" | "failed";
  stage: string;
  message: string;
  sourcePath: string;
  outputPath: string | null;
  outputUrl: string | null;
  planPath: string | null;
  warnings: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UploadConfig = {
  uploadFileSizeLimitBytes: number;
};

export type YoutubePackageSummary = {
  status: "missing" | "incomplete" | "ready";
  title: string | null;
  description: string | null;
  chapters: string | null;
  transcriptAvailable: boolean;
  thumbnailPrompt: string | null;
  thumbnailIdeas: Array<{
    index: number;
    title: string;
    prompt: string;
  }>;
  missing: string[];
  assets: Array<{
    kind: "thumbnail_reference" | "identity_clip" | "generated_thumbnail";
    name: string;
    url: string;
  }>;
};

export type EditPlanSummary = {
  projectId: string;
  sourceUrl: string;
  captionsVttUrl: string | null;
  source: {
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
  };
  segments: TimelineSegment[];
  removed: RemovedInterval[];
  sections: TimelineSection[];
  captions: Caption[];
  captionSettings: CaptionSettings;
  color: { presetId: string; label: string; adjustments: ColorAdjustments };
  video: { flipHorizontal: boolean };
  audio: { music: { path: string; gainDb: number; duckUnderSpeechDb: number } | null; voiceTargetLufs: number };
  qa: {
    status: "not_run" | "passed" | "warning" | "failed";
    warnings: string[];
  };
  publishReadiness: PublishReadiness;
};

type FetchOptions = {
  signal?: AbortSignal;
};

type UploadVideoOptions = {
  uploadFileSizeLimitBytes?: number;
  cutPresetId?: CutPresetId;
};

type ApiAuthTokenProvider = (() => Promise<string | null> | string | null) | null;

let authTokenProvider: ApiAuthTokenProvider = null;

export function configureApiAuth(provider: ApiAuthTokenProvider): void {
  authTokenProvider = provider;
}

export async function listProjects(options: FetchOptions = {}): Promise<ProjectLibraryItem[]> {
  const response = await request("/api/projects", { signal: options.signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.projects;
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function uploadVideo(
  file: File,
  options: UploadVideoOptions = {}
): Promise<{ projectId: string; job: ProjectJob }> {
  if (options.uploadFileSizeLimitBytes !== undefined && file.size > options.uploadFileSizeLimitBytes) {
    throw new Error(
      `Arquivo maior que o limite local (${formatBytes(file.size)} de ${formatBytes(options.uploadFileSizeLimitBytes)}).`
    );
  }

  const form = new FormData();
  form.append("video", file);
  if (options.cutPresetId) {
    form.append("cutPreset", options.cutPresetId);
  }
  const response = await request("/api/projects", { method: "POST", body: form });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json();
}

export async function fetchJob(jobId: string, options: FetchOptions = {}): Promise<ProjectJob> {
  const response = await request(`/api/projects/jobs/${encodeURIComponent(jobId)}`, { signal: options.signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.job;
}

export async function fetchUploadConfig(): Promise<UploadConfig> {
  const response = await request("/api/config");
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json();
}

export async function fetchEditPlan(projectId: string, options: FetchOptions = {}): Promise<EditPlanSummary> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/plan`, { signal: options.signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.plan;
}

export type RerenderProjectInput = {
  activeCuts: ManualCut[];
  colorPresetId?: ColorPresetId;
  colorAdjustments?: Partial<ColorAdjustments>;
  flipHorizontal?: boolean;
  musicPath?: string | null;
  audioCleanup?: boolean;
  audioDucking?: boolean;
  preview?: {
    enabled?: boolean;
    durationSec?: number;
    focusTimelineSec?: number;
    focusSourceSec?: number;
  };
};

export async function rerenderProject(projectId: string, input: RerenderProjectInput | string[]): Promise<ProjectJob> {
  const body = Array.isArray(input) ? { activeCutIds: input } : input;
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.job;
}

export async function exportProject(projectId: string, settings: ExportSettings): Promise<ProjectJob> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.job;
}

export async function uploadMusic(projectId: string, file: File): Promise<{ musicPath: string }> {
  const form = new FormData();
  form.append("music", file);
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/music`, { method: "POST", body: form });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json();
}

export type GenerateCaptionsInput = {
  captionStyleId?: CaptionStyleId;
};

export async function generateCaptions(projectId: string, input: GenerateCaptionsInput = {}): Promise<ProjectJob> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/captions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.job;
}

export async function generateAIMotion(projectId: string): Promise<ProjectJob> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/motion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.job;
}

export async function generateYoutubePackage(projectId: string): Promise<ProjectJob> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/youtube-package`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.job;
}

export async function fetchYoutubePackageSummary(
  projectId: string,
  options: FetchOptions = {}
): Promise<YoutubePackageSummary> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/youtube-package/summary`, {
    signal: options.signal
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.summary;
}

export type UpdateCaptionInput = {
  text?: string;
  styleId?: CaptionStyleId;
};

export async function updateCaption(projectId: string, captionId: string, input: UpdateCaptionInput): Promise<EditPlanSummary> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/captions/${encodeURIComponent(captionId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.plan;
}

export async function updateCaptionSettings(projectId: string, input: Partial<CaptionSettings>): Promise<EditPlanSummary> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/captions/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.plan;
}

export type UpdateSectionInput = Omit<Partial<TimelineSection>, "id">;

export async function updateSection(
  projectId: string,
  sectionId: string,
  input: UpdateSectionInput
): Promise<EditPlanSummary> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.plan;
}

export async function fetchPublishReadiness(projectId: string): Promise<PublishReadiness> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/publish-readiness`);
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.publishReadiness;
}

export type PublishYoutubeVideoInput = {
  title: string;
  description: string;
  privacyStatus: "private" | "unlisted" | "public";
  thumbnailName?: string | null;
};

export type PublishYoutubeVideoResult = {
  externalId: string;
  url: string;
};

export async function publishYoutubeVideo(
  projectId: string,
  input: PublishYoutubeVideoInput
): Promise<PublishYoutubeVideoResult> {
  const response = await request(`/api/projects/${encodeURIComponent(projectId)}/youtube-publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const data = await response.json();
  return data.publication;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function request(input: RequestInfo | URL, init: RequestInit = {}) {
  try {
    const token = authTokenProvider ? await authTokenProvider() : null;
    const headers = mergeRequestHeaders(init.headers, token);
    return await fetch(input, {
      ...init,
      ...(Object.keys(headers).length > 0 ? { headers } : {})
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error(
      "Nao consegui conectar na API local em localhost:4317. Confere se o servidor ainda esta rodando e tenta de novo."
    );
  }
}

function mergeRequestHeaders(headersInit: HeadersInit | undefined, token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (headersInit instanceof Headers) {
    headersInit.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(headersInit)) {
    for (const [key, value] of headersInit) {
      headers[key] = value;
    }
  } else if (headersInit) {
    Object.assign(headers, headersInit);
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    if (typeof body?.error === "string") return body.error;
  }
  return response.text();
}

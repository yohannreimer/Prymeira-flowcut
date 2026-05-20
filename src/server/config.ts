import path from "node:path";

export type AppConfig = {
  nodeEnv?: string;
  workspaceRoot: string;
  ffmpegPath: string;
  ffprobePath: string;
  autoEditorPath: string;
  uploadFileSizeLimitBytes: number;
  projectRetentionMinutes: number;
  prymeiraAccountApiUrl: string | null;
  prymeiraProductKey: string;
};

const DEFAULT_UPLOAD_FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_PROJECT_RETENTION_MINUTES = 30;

function parseUploadFileSizeLimit(rawLimit = process.env.AI_EDITOR_UPLOAD_LIMIT_BYTES) {
  if (rawLimit === undefined || rawLimit === "") {
    return DEFAULT_UPLOAD_FILE_SIZE_LIMIT_BYTES;
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid AI_EDITOR_UPLOAD_LIMIT_BYTES "${rawLimit}". Expected a positive integer.`);
  }
  return limit;
}

function parseProjectRetentionMinutes(rawRetention = process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES) {
  if (rawRetention === undefined || rawRetention === "") {
    return DEFAULT_PROJECT_RETENTION_MINUTES;
  }

  const retentionMinutes = Number(rawRetention);
  if (!Number.isInteger(retentionMinutes) || retentionMinutes < 1) {
    throw new Error(
      `Invalid AI_EDITOR_PROJECT_RETENTION_MINUTES "${rawRetention}". Expected a positive integer.`
    );
  }
  return retentionMinutes;
}

function normalizeOptionalUrl(rawUrl = process.env.PRYMEIRA_ACCOUNT_API_URL) {
  const trimmed = rawUrl?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : null;
}

export function getConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    workspaceRoot: path.resolve(process.env.AI_EDITOR_WORKSPACE ?? path.resolve(process.cwd(), "workspace")),
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
    autoEditorPath: process.env.AUTO_EDITOR_PATH ?? "auto-editor",
    uploadFileSizeLimitBytes: parseUploadFileSizeLimit(),
    projectRetentionMinutes: parseProjectRetentionMinutes(),
    prymeiraAccountApiUrl: normalizeOptionalUrl(),
    prymeiraProductKey: process.env.PRYMEIRA_PRODUCT_KEY?.trim() || "media"
  };
}

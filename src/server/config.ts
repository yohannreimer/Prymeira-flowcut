import path from "node:path";
import { getAllowedOrigins, normalizeOrigin } from "./security";

export type AppConfig = {
  nodeEnv?: string;
  localMode: boolean;
  workspaceRoot: string;
  ffmpegPath: string;
  ffprobePath: string;
  autoEditorPath: string;
  uploadFileSizeLimitBytes: number;
  projectRetentionMinutes: number;
  prymeiraAccountApiUrl: string | null;
  prymeiraProductKey: string;
  publicAppUrl: string | null;
  allowedOrigins: string[];
  jsonBodyLimitBytes: number;
};

const DEFAULT_UPLOAD_FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_PROJECT_RETENTION_MINUTES = 30;
const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

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

function parseJsonBodyLimit(rawLimit = process.env.FLOWCUT_JSON_BODY_LIMIT_BYTES) {
  if (rawLimit === undefined || rawLimit === "") {
    return DEFAULT_JSON_BODY_LIMIT_BYTES;
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid FLOWCUT_JSON_BODY_LIMIT_BYTES "${rawLimit}". Expected a positive integer.`);
  }
  return limit;
}

function normalizeOptionalUrl(rawUrl = process.env.PRYMEIRA_ACCOUNT_API_URL) {
  const trimmed = rawUrl?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : null;
}

function normalizeOptionalPublicUrl(rawUrl = process.env.FLOWCUT_PUBLIC_APP_URL) {
  const trimmed = rawUrl?.trim();
  return trimmed ? normalizeOrigin(trimmed) : null;
}

function parseBooleanFlag(rawValue = process.env.FLOWCUT_LOCAL_MODE) {
  return rawValue?.trim().toLowerCase() === "true";
}

export function getConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    localMode: parseBooleanFlag(),
    workspaceRoot: path.resolve(process.env.AI_EDITOR_WORKSPACE ?? path.resolve(process.cwd(), "workspace")),
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
    autoEditorPath: process.env.AUTO_EDITOR_PATH ?? "auto-editor",
    uploadFileSizeLimitBytes: parseUploadFileSizeLimit(),
    projectRetentionMinutes: parseProjectRetentionMinutes(),
    prymeiraAccountApiUrl: normalizeOptionalUrl(),
    prymeiraProductKey: process.env.PRYMEIRA_PRODUCT_KEY?.trim() || "media",
    publicAppUrl: normalizeOptionalPublicUrl(),
    allowedOrigins: getAllowedOrigins(),
    jsonBodyLimitBytes: parseJsonBodyLimit()
  };
}

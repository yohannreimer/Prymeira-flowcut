import path from "node:path";

export type AppConfig = {
  workspaceRoot: string;
  ffmpegPath: string;
  ffprobePath: string;
  autoEditorPath: string;
  uploadFileSizeLimitBytes: number;
};

const DEFAULT_UPLOAD_FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

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

export function getConfig(): AppConfig {
  return {
    workspaceRoot: path.resolve(process.env.AI_EDITOR_WORKSPACE ?? path.resolve(process.cwd(), "workspace")),
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
    autoEditorPath: process.env.AUTO_EDITOR_PATH ?? "auto-editor",
    uploadFileSizeLimitBytes: parseUploadFileSizeLimit()
  };
}

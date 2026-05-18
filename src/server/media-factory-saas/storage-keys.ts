export function sanitizeObjectKeyPart(value: string, fallback = "item"): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (/^\.+$/.test(cleaned)) return fallback;
  return cleaned || fallback;
}

export function createJobStoragePrefix({
  workspaceId,
  jobId
}: {
  workspaceId: string;
  jobId: string;
}): string {
  return [
    "workspaces",
    sanitizeObjectKeyPart(workspaceId, "workspace"),
    "jobs",
    sanitizeObjectKeyPart(jobId, "job")
  ].join("/");
}

export function createSourceObjectKey({
  workspaceId,
  jobId,
  fileName
}: {
  workspaceId: string;
  jobId: string;
  fileName: string;
}): string {
  return [
    createJobStoragePrefix({ workspaceId, jobId }),
    "source",
    sanitizeObjectKeyPart(fileName, "source.mp4")
  ].join("/");
}

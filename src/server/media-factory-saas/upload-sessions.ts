import { randomUUID } from "node:crypto";
import { createSourceObjectKey } from "./storage-keys";

export type UploadSessionStatus = "pending" | "uploaded";

export type UploadSession = {
  id: string;
  jobId: string;
  workspaceId: string;
  uploaderCustomerId: string | null;
  status: UploadSessionStatus;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
  uploadedAt: string | null;
};

export type UploadSessionRepository = {
  create(session: UploadSession): Promise<UploadSession>;
  findById(id: string): Promise<UploadSession | null>;
  update(session: UploadSession): Promise<UploadSession>;
};

export class UploadSessionError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "UploadSessionError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class InMemoryUploadSessionRepository implements UploadSessionRepository {
  private sessions = new Map<string, UploadSession>();

  async create(session: UploadSession): Promise<UploadSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<UploadSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async update(session: UploadSession): Promise<UploadSession> {
    this.sessions.set(session.id, session);
    return session;
  }
}

export async function createUploadSession({
  repo,
  workspaceId,
  uploaderCustomerId,
  fileName,
  contentType,
  sizeBytes,
  limits,
  now = new Date()
}: {
  repo: UploadSessionRepository;
  workspaceId: string;
  uploaderCustomerId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  limits: Record<string, unknown>;
  now?: Date;
}): Promise<UploadSession> {
  assertPositiveIntegerSize(sizeBytes);
  const maxUploadBytes = typeof limits.max_upload_bytes === "number" ? limits.max_upload_bytes : null;
  if (maxUploadBytes !== null && sizeBytes > maxUploadBytes) {
    throw new UploadSessionError(413, "upload_too_large", "Uploaded video exceeds the workspace limit.");
  }

  if (!contentType.startsWith("video/")) {
    throw new UploadSessionError(400, "invalid_content_type", "Upload must be a video file.");
  }

  const id = `upload_${randomUUID()}`;
  const jobId = `job_${randomUUID()}`;
  const session: UploadSession = {
    id,
    jobId,
    workspaceId,
    uploaderCustomerId,
    status: "pending",
    fileName,
    contentType,
    sizeBytes,
    storageKey: createSourceObjectKey({ workspaceId, jobId, fileName }),
    createdAt: now.toISOString(),
    uploadedAt: null
  };

  return repo.create(session);
}

export async function completeUploadSession({
  repo,
  workspaceId,
  uploadId,
  observedSizeBytes,
  now = new Date()
}: {
  repo: UploadSessionRepository;
  workspaceId: string;
  uploadId: string;
  observedSizeBytes: number;
  now?: Date;
}): Promise<UploadSession> {
  assertPositiveIntegerSize(observedSizeBytes);
  const session = await repo.findById(uploadId);
  if (!session) {
    throw new UploadSessionError(404, "upload_not_found", "Upload session not found.");
  }

  if (session.workspaceId !== workspaceId) {
    throw new UploadSessionError(404, "upload_not_found", "Upload session not found.");
  }

  if (session.status !== "pending") {
    throw new UploadSessionError(409, "upload_already_completed", "Upload session is already completed.");
  }

  if (session.sizeBytes !== observedSizeBytes) {
    throw new UploadSessionError(400, "upload_size_mismatch", "Uploaded object size does not match the session.");
  }

  return repo.update({
    ...session,
    status: "uploaded",
    uploadedAt: now.toISOString()
  });
}

function assertPositiveIntegerSize(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new UploadSessionError(400, "invalid_upload_size", "Upload size must be a positive integer.");
  }
}

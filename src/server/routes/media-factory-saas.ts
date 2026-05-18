import express from "express";
import { z } from "zod";
import { MediaFactoryAccessError, requireMediaFactoryAccess } from "../media-factory-saas/access";
import {
  UploadSessionError,
  completeUploadSession,
  createUploadSession,
  type UploadSession,
  type UploadSessionRepository
} from "../media-factory-saas/upload-sessions";

const createUploadBodySchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  sizeBytes: z.number().int().positive()
}).strict();

export type MediaFactoryObjectStorage = {
  createSignedUploadUrl(input: {
    storageKey: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<string>;
  getUploadedObjectSize(storageKey: string): Promise<number>;
};

export type MediaFactorySaasRouterOptions = {
  accountApiUrl: string;
  repo: UploadSessionRepository;
  storage: MediaFactoryObjectStorage;
  fetch?: typeof fetch;
};

export function createMediaFactorySaasRouter({
  accountApiUrl,
  repo,
  storage,
  fetch: fetchImpl
}: MediaFactorySaasRouterOptions) {
  const router = express.Router();

  router.post("/uploads", async (req, res, next) => {
    try {
      const access = await requireMediaFactoryAccess({
        authorization: req.get("authorization"),
        accountApiUrl,
        fetch: fetchImpl
      });
      const body = createUploadBodySchema.parse(req.body);
      const upload = await createUploadSession({
        repo,
        workspaceId: access.workspaceId,
        uploaderCustomerId: null,
        fileName: body.fileName,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        limits: access.limits
      });
      const uploadUrl = await storage.createSignedUploadUrl({
        storageKey: upload.storageKey,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes
      });

      res.status(201).json({ upload: serializeUpload(upload), uploadUrl });
    } catch (error) {
      handleKnownRouterError(error, res, next);
    }
  });

  router.post("/uploads/:uploadId/complete", async (req, res, next) => {
    try {
      const access = await requireMediaFactoryAccess({
        authorization: req.get("authorization"),
        accountApiUrl,
        fetch: fetchImpl
      });
      const existingUpload = await repo.findById(req.params.uploadId);
      if (!existingUpload || existingUpload.workspaceId !== access.workspaceId) {
        throw new UploadSessionError(404, "upload_not_found", "Upload session not found.");
      }

      const observedSizeBytes = await storage.getUploadedObjectSize(existingUpload.storageKey);
      const upload = await completeUploadSession({
        repo,
        workspaceId: access.workspaceId,
        uploadId: existingUpload.id,
        observedSizeBytes
      });

      res.json({
        upload: serializeUpload(upload),
        job: {
          id: upload.jobId,
          status: "queued"
        }
      });
    } catch (error) {
      handleKnownRouterError(error, res, next);
    }
  });

  return router;
}

function serializeUpload(upload: UploadSession) {
  return {
    id: upload.id,
    jobId: upload.jobId,
    workspaceId: upload.workspaceId,
    uploaderCustomerId: upload.uploaderCustomerId,
    status: upload.status,
    fileName: upload.fileName,
    contentType: upload.contentType,
    sizeBytes: upload.sizeBytes,
    storageKey: upload.storageKey,
    createdAt: upload.createdAt,
    uploadedAt: upload.uploadedAt
  };
}

function handleKnownRouterError(
  error: unknown,
  res: express.Response,
  next: express.NextFunction
): void {
  if (error instanceof MediaFactoryAccessError || error instanceof UploadSessionError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: "invalid_request",
        message: "Invalid request body."
      }
    });
    return;
  }

  next(error);
}

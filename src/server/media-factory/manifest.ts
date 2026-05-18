import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  mediaFactoryOrientationValues,
  mediaFactoryPipelineValues,
  type MediaFactoryOrientation,
  type MediaFactoryPipeline
} from "./router";

const manifestStatusValues = [
  "detected",
  "processing",
  "packaged",
  "ready_to_approve",
  "approved",
  "publishing",
  "published",
  "failed"
] as const;

const packageRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !path.isAbsolute(value), "Path must be package-relative")
  .refine((value) => {
    const normalizedInput = value.replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(normalizedInput)) {
      return false;
    }
    if (normalizedInput.split("/").includes("..")) {
      return false;
    }
    const normalized = path.posix.normalize(normalizedInput);
    return normalized !== "." && !normalized.startsWith("../") && normalized !== "..";
  }, "Path cannot escape the package");

export const mediaFactoryManifestSchema = z
  .object({
    id: z.string().trim().min(1),
    status: z.enum(manifestStatusValues),
    source: z
      .object({
        path: z.string().trim().min(1),
        hash: z.string().trim().min(1),
        orientation: z.enum(mediaFactoryOrientationValues),
        durationSec: z.number().finite().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        hasAudio: z.boolean()
      })
      .strict(),
    pipeline: z.enum(mediaFactoryPipelineValues),
    outputs: z
      .array(
        z
          .object({
            type: z.string().trim().min(1),
            path: packageRelativePathSchema
          })
          .strict()
      ),
    publishPlan: z.record(z.unknown()),
    publishResults: z.array(
      z
        .object({
          platform: z.string().trim().min(1),
          mode: z.enum(["disabled", "dry-run", "live"]),
          status: z.enum(["pending", "passed", "failed"]),
          externalId: z.string().trim().min(1).optional(),
          url: z.string().trim().min(1).optional(),
          error: z.string().trim().min(1).optional(),
          retryCount: z.number().int().nonnegative().default(0)
        })
        .strict()
    ),
    error: z
      .object({
        stage: z.string().trim().min(1),
        message: z.string().trim().min(1)
      })
      .strict()
      .optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export type MediaFactoryManifest = z.infer<typeof mediaFactoryManifestSchema>;

type InitialManifestInput = {
  id: MediaFactoryManifest["id"];
  status: MediaFactoryManifest["status"];
  source: MediaFactoryManifest["source"];
  pipeline: MediaFactoryManifest["pipeline"];
  now?: string | Date;
};

type UpdateManifestInput = {
  manifest: MediaFactoryManifest;
  now?: string | Date;
};

type ManifestPatch = Partial<Omit<MediaFactoryManifest, "createdAt" | "updatedAt">>;

export function createInitialManifest(input: InitialManifestInput): MediaFactoryManifest {
  const now = toIsoString(input.now);

  return mediaFactoryManifestSchema.parse({
    id: input.id,
    status: input.status,
    source: input.source,
    pipeline: input.pipeline,
    outputs: [],
    publishPlan: {},
    publishResults: [],
    createdAt: now,
    updatedAt: now
  });
}

export function updateManifest(input: MediaFactoryManifest | UpdateManifestInput, patch: ManifestPatch): MediaFactoryManifest {
  const { manifest, now } = "manifest" in input ? input : { manifest: input, now: undefined };

  return mediaFactoryManifestSchema.parse({
    ...manifest,
    ...patch,
    updatedAt: toIsoString(now)
  });
}

export async function writeManifest(manifestPath: string, manifest: MediaFactoryManifest): Promise<void> {
  const validatedManifest = mediaFactoryManifestSchema.parse(manifest);
  const tempPath = path.join(path.dirname(manifestPath), `.${path.basename(manifestPath)}.${randomUUID()}.tmp`);

  try {
    await fs.writeFile(tempPath, `${JSON.stringify(validatedManifest, null, 2)}\n`);
    await fs.rename(tempPath, manifestPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function toIsoString(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? new Date().toISOString();
}

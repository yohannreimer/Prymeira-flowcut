import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  publishYouTubeVideo as defaultPublishYouTubeVideo,
  type YouTubeOAuthCredentials
} from "../media-factory/youtube-publisher";
import type { ProjectWorkspace } from "../workspace";

const verticalPackageSchema = z.object({
  projectId: z.string().min(1),
  clips: z.array(z.object({
    id: z.string().min(1),
    rank: z.number().int().positive(),
    payloads: z.object({
      youtubeShorts: z.string().min(1)
    }).passthrough()
  }))
});

const youtubeShortsPayloadSchema = z.object({
  video: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  description: z.string().default(""),
  hashtags: z.array(z.string()).default(["#shorts"]),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private")
});

const publicationSchema = z.object({
  clipId: z.string().min(1),
  rank: z.number().int().positive(),
  externalId: z.string().min(1),
  url: z.string().min(1),
  status: z.literal("published"),
  createdAt: z.string().datetime()
});

const publicationLedgerSchema = z.object({
  version: z.literal(1),
  publications: z.array(publicationSchema)
});

export type VerticalYouTubeShortsPublication = Omit<z.infer<typeof publicationSchema>, "createdAt">;

export async function publishVerticalYouTubeShorts({
  workspace,
  credentials,
  privacyStatus,
  publishYouTubeVideo = defaultPublishYouTubeVideo,
  now = new Date()
}: {
  workspace: ProjectWorkspace;
  credentials: YouTubeOAuthCredentials;
  privacyStatus?: "private" | "unlisted" | "public";
  publishYouTubeVideo?: typeof defaultPublishYouTubeVideo;
  now?: Date;
}): Promise<{ publications: VerticalYouTubeShortsPublication[]; skipped: string[] }> {
  const verticalPackage = verticalPackageSchema.parse(
    JSON.parse(await readFile(path.join(workspace.root, "vertical-package.json"), "utf8"))
  );
  const ledgerPath = path.join(workspace.root, "vertical-youtube-shorts-publications.json");
  const ledger = await readPublicationLedger(ledgerPath);
  const nextPublications = [...ledger.publications];
  const publications: VerticalYouTubeShortsPublication[] = [];
  const skipped: string[] = [];

  for (const clip of verticalPackage.clips) {
    if (nextPublications.some((publication) => publication.clipId === clip.id)) {
      skipped.push(clip.id);
      continue;
    }

    const payloadPath = resolveWorkspaceRelativePath(workspace.root, clip.payloads.youtubeShorts);
    const payload = youtubeShortsPayloadSchema.parse(JSON.parse(await readFile(payloadPath, "utf8")));
    const videoPath = resolveWorkspaceRelativePath(workspace.root, payload.video);
    const result = await publishYouTubeVideo({
      videoPath,
      title: payload.title,
      description: ensureShortsHashtag(payload.description, payload.hashtags),
      hashtags: normalizeShortsHashtags(payload.hashtags),
      privacyStatus: privacyStatus ?? payload.privacyStatus,
      credentials
    });
    const publication = {
      clipId: clip.id,
      rank: clip.rank,
      externalId: result.externalId,
      url: result.url,
      status: "published" as const,
      createdAt: now.toISOString()
    };
    nextPublications.push(publication);
    publications.push(withoutCreatedAt(publication));
    await writePublicationLedger(ledgerPath, {
      version: 1,
      publications: nextPublications
    });
  }

  return { publications, skipped };
}

async function readPublicationLedger(ledgerPath: string): Promise<z.infer<typeof publicationLedgerSchema>> {
  try {
    return publicationLedgerSchema.parse(JSON.parse(await readFile(ledgerPath, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { version: 1, publications: [] };
    }
    throw error;
  }
}

async function writePublicationLedger(ledgerPath: string, ledger: z.infer<typeof publicationLedgerSchema>) {
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, `${JSON.stringify(publicationLedgerSchema.parse(ledger), null, 2)}\n`);
}

function resolveWorkspaceRelativePath(workspaceRoot: string, relativePath: string) {
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(path.resolve(workspaceRoot), absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid vertical Shorts package path: ${relativePath}`);
  }
  return absolutePath;
}

function normalizeShortsHashtags(hashtags: string[]) {
  const normalized = hashtags.map((tag) => tag.trim()).filter(Boolean);
  if (normalized.some((tag) => tag.toLowerCase() === "#shorts" || tag.toLowerCase() === "shorts")) {
    return normalized;
  }
  return ["#shorts", ...normalized];
}

function ensureShortsHashtag(description: string, hashtags: string[]) {
  const normalizedTags = normalizeShortsHashtags(hashtags);
  const hasShorts = /\B#shorts\b/i.test(description);
  if (hasShorts) return description;
  return `${description.trim()}\n\n${normalizedTags.join(" ")}`.trim();
}

function withoutCreatedAt(publication: z.infer<typeof publicationSchema>): VerticalYouTubeShortsPublication {
  return {
    clipId: publication.clipId,
    rank: publication.rank,
    externalId: publication.externalId,
    url: publication.url,
    status: publication.status
  };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getYouTubeCredentialsFromEnv, type YouTubeOAuthCredentials } from "../media-factory/youtube-publisher";
import { sanitizeObjectKeyPart } from "../media-factory-saas/storage-keys";

export type StoredYouTubeOAuthCredentials = {
  refreshToken: string;
  connectedAt?: string;
};

export function getYouTubeClientConfigFromEnv(env: NodeJS.ProcessEnv = process.env): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function getYouTubeOAuthCredentialsPath({
  workspaceRoot,
  workspaceId
}: {
  workspaceRoot: string;
  workspaceId: string | null;
}): string {
  if (!workspaceId) {
    return path.join(workspaceRoot, ".integrations", "youtube-oauth.json");
  }

  return path.join(
    workspaceRoot,
    "workspaces",
    sanitizeObjectKeyPart(workspaceId, "workspace"),
    "integrations",
    "youtube-oauth.json"
  );
}

export async function writeStoredYouTubeOAuthCredentials({
  workspaceRoot,
  workspaceId,
  refreshToken,
  connectedAt = new Date().toISOString()
}: {
  workspaceRoot: string;
  workspaceId: string | null;
  refreshToken: string;
  connectedAt?: string;
}): Promise<void> {
  const credentialsPath = getYouTubeOAuthCredentialsPath({ workspaceRoot, workspaceId });
  await mkdir(path.dirname(credentialsPath), { recursive: true });
  await writeFile(credentialsPath, `${JSON.stringify({ refreshToken, connectedAt }, null, 2)}\n`);
}

export async function readStoredYouTubeOAuthCredentials({
  workspaceRoot,
  workspaceId
}: {
  workspaceRoot: string;
  workspaceId: string | null;
}): Promise<StoredYouTubeOAuthCredentials | null> {
  try {
    const raw = await readFile(getYouTubeOAuthCredentialsPath({ workspaceRoot, workspaceId }), "utf8");
    const parsed = JSON.parse(raw) as { refreshToken?: unknown; connectedAt?: unknown };
    if (typeof parsed.refreshToken !== "string" || !parsed.refreshToken.trim()) {
      return null;
    }
    return {
      refreshToken: parsed.refreshToken.trim(),
      connectedAt: typeof parsed.connectedAt === "string" ? parsed.connectedAt : undefined
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function resolveYouTubeOAuthCredentials({
  workspaceRoot,
  workspaceId,
  env = process.env
}: {
  workspaceRoot: string;
  workspaceId: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<YouTubeOAuthCredentials | null> {
  const clientConfig = getYouTubeClientConfigFromEnv(env);
  if (clientConfig) {
    const stored = await readStoredYouTubeOAuthCredentials({ workspaceRoot, workspaceId });
    if (stored) {
      return {
        ...clientConfig,
        refreshToken: stored.refreshToken
      };
    }
  }

  return getYouTubeCredentialsFromEnv(env);
}

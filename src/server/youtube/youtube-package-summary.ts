import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type YoutubePackageAssetKind = "thumbnail_reference" | "identity_clip" | "generated_thumbnail";

export type YoutubePackageAsset = {
  kind: YoutubePackageAssetKind;
  name: string;
  url: string;
};

export type YoutubePackageSummary = {
  status: "missing" | "incomplete" | "ready";
  title: string | null;
  description: string | null;
  transcriptAvailable: boolean;
  thumbnailPrompt: string | null;
  missing: string[];
  assets: YoutubePackageAsset[];
};

const REQUIRED_TEXT_FILES = ["titulo.txt", "descricao.txt", "transcricao.txt", "prompt-thumbnail.txt"] as const;

export async function readYoutubePackageSummary(projectRoot: string, projectId: string): Promise<YoutubePackageSummary> {
  const packageDir = path.join(projectRoot, "download", "youtube-package");
  let entries: string[];

  try {
    entries = await readdir(packageDir);
  } catch (error) {
    if (isNotFound(error)) {
      return createEmptySummary("missing", REQUIRED_TEXT_FILES.slice());
    }
    throw error;
  }

  const missing = REQUIRED_TEXT_FILES.filter((fileName) => !entries.includes(fileName));
  const [title, description, transcript, thumbnailPrompt] = await Promise.all([
    readOptionalText(packageDir, "titulo.txt"),
    readOptionalText(packageDir, "descricao.txt"),
    readOptionalText(packageDir, "transcricao.txt"),
    readOptionalText(packageDir, "prompt-thumbnail.txt")
  ]);

  return {
    status: missing.length === 0 ? "ready" : "incomplete",
    title,
    description,
    transcriptAvailable: Boolean(transcript),
    thumbnailPrompt,
    missing,
    assets: entries
      .filter(isPackageAssetName)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        kind: getAssetKind(name),
        name,
        url: `/api/projects/${encodeURIComponent(projectId)}/youtube-package/assets/${encodeURIComponent(name)}`
      }))
  };
}

export function isYoutubePackageAssetName(name: string): boolean {
  return path.basename(name) === name && isPackageAssetName(name);
}

function createEmptySummary(status: YoutubePackageSummary["status"], missing: string[]): YoutubePackageSummary {
  return {
    status,
    title: null,
    description: null,
    transcriptAvailable: false,
    thumbnailPrompt: null,
    missing,
    assets: []
  };
}

async function readOptionalText(packageDir: string, fileName: string) {
  try {
    return (await readFile(path.join(packageDir, fileName), "utf8")).trim() || null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function isPackageAssetName(name: string): boolean {
  return /^thumbnail-ref-\d{2}\.jpe?g$/i.test(name)
    || /^identity-ref-\d{2}\.mp4$/i.test(name)
    || /^thumbnail-(?:option|generated)-\d{2}\.(?:png|jpe?g|webp)$/i.test(name);
}

function getAssetKind(name: string): YoutubePackageAssetKind {
  if (/^identity-ref-/i.test(name)) return "identity_clip";
  if (/^thumbnail-ref-/i.test(name)) return "thumbnail_reference";
  return "generated_thumbnail";
}

function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

import { createHash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const supportedSourceExtensions = new Set([".mp4", ".mov", ".m4v", ".mkv"]);
const maxPackageBasenameLength = 60;
const maxHumanPackageTitleLength = 54;

export type MediaFactoryFolders = {
  inputDir: string;
  outputDir: string;
  readyToApproveDir: string;
  approvedDir: string;
  publishedDir: string;
  failedDir: string;
  processedSourcesDir: string;
  failedSourcesDir: string;
};

export async function createMediaFactoryFolders({
  inputDir,
  outputDir
}: {
  inputDir: string;
  outputDir: string;
}): Promise<MediaFactoryFolders> {
  const sourceRootDir = path.dirname(inputDir);
  const folders = {
    inputDir,
    outputDir,
    readyToApproveDir: path.join(outputDir, "ready-to-approve"),
    approvedDir: path.join(outputDir, "approved"),
    publishedDir: path.join(outputDir, "published"),
    failedDir: path.join(outputDir, "failed"),
    processedSourcesDir: path.join(sourceRootDir, "Processados"),
    failedSourcesDir: path.join(sourceRootDir, "Falhou")
  };

  await Promise.all(Object.values(folders).map((folder) => fs.mkdir(folder, { recursive: true })));

  return folders;
}

export async function archiveSourceFile({
  sourcePath,
  archiveDir,
  sourceHash
}: {
  sourcePath: string;
  archiveDir: string;
  sourceHash?: string | null;
}): Promise<string> {
  await fs.mkdir(archiveDir, { recursive: true });
  const targetPath = await getAvailableArchivePath({ sourcePath, archiveDir, sourceHash });
  await fs.rename(sourcePath, targetPath);
  return targetPath;
}

export async function discoverSourceFiles(inputDir: string): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(inputDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && supportedSourceExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(inputDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export async function isStableFile(
  filePath: string,
  {
    checks = 3,
    intervalMs = 1000,
    statFile = getFileStabilitySnapshot,
    sleepMs = sleep
  }: {
    checks?: number;
    intervalMs?: number;
    statFile?: (filePath: string) => Promise<FileStabilitySnapshot>;
    sleepMs?: (intervalMs: number) => Promise<void>;
  } = {}
): Promise<boolean> {
  const totalChecks = Math.max(1, checks);
  let previousSnapshot = await statFile(filePath);

  for (let check = 1; check < totalChecks; check += 1) {
    await sleepMs(intervalMs);

    const currentSnapshot = await statFile(filePath);
    if (
      currentSnapshot.size !== previousSnapshot.size ||
      currentSnapshot.mtimeMs !== previousSnapshot.mtimeMs
    ) {
      return false;
    }

    previousSnapshot = currentSnapshot;
  }

  return true;
}

export function getFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

export function getPackageSlug({
  filePath,
  hash,
  now
}: {
  filePath: string;
  hash: string;
  now: Date;
}): string {
  const date = now.toISOString().slice(0, 10);
  const baseName = path.basename(filePath, path.extname(filePath));
  const safeName = capSlugBasename(slugify(baseName)) || "video";

  return `${date}-${safeName}-${hash.slice(0, 8).toLowerCase()}`;
}

export function getHumanPackageName({
  kind,
  title,
  now
}: {
  kind: "Horizontal" | "Shorts";
  title: string;
  now: Date;
}): string {
  const date = now.toISOString().slice(0, 10);
  const safeTitle = capHumanTitle(sanitizeHumanTitle(title)) || "Video";
  return `${date} - ${kind} - ${safeTitle}`;
}

export async function renamePackageDirectory({
  packageDir,
  desiredName
}: {
  packageDir: string;
  desiredName: string;
}): Promise<string> {
  const parentDir = path.dirname(packageDir);
  const targetPath = await getAvailableDirectoryPath({
    preferredPath: path.join(parentDir, desiredName),
    currentPath: packageDir
  });

  if (targetPath === packageDir) {
    return packageDir;
  }

  await fs.rename(packageDir, targetPath);
  return targetPath;
}

type FileStabilitySnapshot = {
  size: number;
  mtimeMs: number;
};

async function getFileStabilitySnapshot(filePath: string): Promise<FileStabilitySnapshot> {
  const stat = await fs.stat(filePath);

  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
}

function capSlugBasename(value: string): string {
  return value.slice(0, maxPackageBasenameLength).replace(/-+$/g, "");
}

function capHumanTitle(value: string): string {
  if (value.length <= maxHumanPackageTitleLength) {
    return value;
  }

  const capped = value.slice(0, maxHumanPackageTitleLength).replace(/\s+$/g, "");
  const lastSpaceIndex = capped.lastIndexOf(" ");
  if (lastSpaceIndex > 20) {
    return capped.slice(0, lastSpaceIndex);
  }

  return capped;
}

function sanitizeHumanTitle(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sleep(intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, intervalMs);
  });
}

async function getAvailableArchivePath({
  sourcePath,
  archiveDir,
  sourceHash
}: {
  sourcePath: string;
  archiveDir: string;
  sourceHash?: string | null;
}): Promise<string> {
  const extension = path.extname(sourcePath);
  const basename = path.basename(sourcePath, extension);
  const hashSuffix = sourceHash?.slice(0, 8).toLowerCase();
  const candidates = [
    path.join(archiveDir, path.basename(sourcePath)),
    ...(hashSuffix ? [path.join(archiveDir, `${basename}-${hashSuffix}${extension}`)] : [])
  ];

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = path.join(
      archiveDir,
      `${basename}${hashSuffix ? `-${hashSuffix}` : ""}-${suffix}${extension}`
    );
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }
}

async function getAvailableDirectoryPath({
  preferredPath,
  currentPath
}: {
  preferredPath: string;
  currentPath: string;
}): Promise<string> {
  if (preferredPath === currentPath || !(await pathExists(preferredPath))) {
    return preferredPath;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${preferredPath} - ${suffix}`;
    if (candidate === currentPath || !(await pathExists(candidate))) {
      return candidate;
    }
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

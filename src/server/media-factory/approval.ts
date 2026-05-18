import fs from "node:fs/promises";
import path from "node:path";
import { mediaFactoryManifestSchema, updateManifest, writeManifest, type MediaFactoryManifest } from "./manifest";
import { createMediaFactoryFolders } from "./files";
import { silentProgressReporter, type ProgressReporter } from "./progress";

export type ApproveReadyPackagesInput = {
  rootDir: string;
  packageIds?: string[];
  now?: Date;
  progress?: ProgressReporter;
};

export type ApproveReadyPackagesResult = {
  approved: string[];
  skipped: Array<{ packageDir: string; reason: string }>;
};

export async function approveReadyPackages(input: ApproveReadyPackagesInput): Promise<ApproveReadyPackagesResult> {
  const progress = input.progress ?? silentProgressReporter;
  const inputDir = path.join(input.rootDir, "Entrada");
  const outputDir = path.join(input.rootDir, "Saida");
  const folders = await createMediaFactoryFolders({ inputDir, outputDir });
  const selectedPackageIds = input.packageIds?.length ? new Set(input.packageIds) : null;
  const candidates = await listReadyPackageDirs(folders.readyToApproveDir);
  const approved: string[] = [];
  const skipped: ApproveReadyPackagesResult["skipped"] = [];

  for (const packageDir of candidates) {
    const packageId = path.basename(packageDir);
    if (selectedPackageIds && !selectedPackageIds.has(packageId)) {
      continue;
    }

    const manifestPath = path.join(packageDir, "manifest.json");
    let manifest;
    try {
      const rawManifest = await fs.readFile(manifestPath, "utf8");
      manifest = mediaFactoryManifestSchema.parse(JSON.parse(rawManifest));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "manifest invalido";
      skipped.push({ packageDir, reason });
      progress.warn(`Ignorado na aprovacao: ${packageDir} (${reason})`);
      continue;
    }

    if (manifest.status !== "ready_to_approve") {
      skipped.push({ packageDir, reason: `status ${manifest.status}` });
      progress.warn(`Ignorado na aprovacao: ${packageDir} (status ${manifest.status})`);
      continue;
    }

    const approvedManifest = await pruneManifestForExistingFiles(packageDir, manifest);
    await writeManifest(manifestPath, updateManifest({ manifest: approvedManifest, now: input.now }, { status: "approved" }));
    const approvedPath = await getAvailablePackagePath(path.join(folders.approvedDir, packageId));
    await fs.rename(packageDir, approvedPath);
    approved.push(approvedPath);
    progress.info(`Aprovado: ${approvedPath}`);
  }

  return { approved, skipped };
}

async function pruneManifestForExistingFiles(
  packageDir: string,
  manifest: MediaFactoryManifest
): Promise<MediaFactoryManifest> {
  return mediaFactoryManifestSchema.parse({
    ...manifest,
    outputs: (await Promise.all(
      manifest.outputs.map(async (output) => ({
        output,
        exists: await pathExists(path.join(packageDir, output.path))
      }))
    ))
      .filter(({ exists }) => exists)
      .map(({ output }) => output),
    publishPlan: await prunePublishPlanValue(packageDir, manifest.publishPlan)
  });
}

async function prunePublishPlanValue(packageDir: string, value: unknown): Promise<unknown> {
  if (Array.isArray(value)) {
    const items = await Promise.all(
      value.map(async (item) => ({
        item,
        keep: typeof item !== "string" || !isPackageRelativeFileReference(item) || await pathExists(path.join(packageDir, item))
      }))
    );
    return items.filter(({ keep }) => keep).map(({ item }) => item);
  }

  if (typeof value === "string") {
    if (isPackageRelativeFileReference(value) && !(await pathExists(path.join(packageDir, value)))) {
      return null;
    }
    return value;
  }

  if (typeof value === "object" && value !== null) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, child]) => [key, await prunePublishPlanValue(packageDir, child)] as const)
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function isPackageRelativeFileReference(value: string): boolean {
  if (!value.trim() || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
    return false;
  }

  return value.includes("/") || /\.[a-z0-9]{2,5}$/i.test(value);
}

async function listReadyPackageDirs(readyToApproveDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(readyToApproveDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(readyToApproveDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function getAvailablePackagePath(preferredPath: string): Promise<string> {
  if (!(await pathExists(preferredPath))) {
    return preferredPath;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${preferredPath}-${suffix}`;
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveSourceFile,
  createMediaFactoryFolders,
  discoverSourceFiles,
  getHumanPackageName,
  getFileSha256,
  getPackageSlug,
  isStableFile,
  renamePackageDirectory
} from "./files";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(tmpdir(), "media-factory-files-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe("createMediaFactoryFolders", () => {
  it("creates and returns the media factory folder set", async () => {
    const inputDir = path.join(tempDir, "Entrada");
    const outputDir = path.join(tempDir, "Saida");

    const folders = await createMediaFactoryFolders({ inputDir, outputDir });

    expect(folders).toEqual({
      inputDir,
      outputDir,
      readyToApproveDir: path.join(outputDir, "ready-to-approve"),
      approvedDir: path.join(outputDir, "approved"),
      publishedDir: path.join(outputDir, "published"),
      failedDir: path.join(outputDir, "failed"),
      processedSourcesDir: path.join(tempDir, "Processados"),
      failedSourcesDir: path.join(tempDir, "Falhou")
    });

    await expectDirectory(folders.inputDir);
    await expectDirectory(folders.outputDir);
    await expectDirectory(folders.readyToApproveDir);
    await expectDirectory(folders.approvedDir);
    await expectDirectory(folders.publishedDir);
    await expectDirectory(folders.failedDir);
    await expectDirectory(folders.processedSourcesDir);
    await expectDirectory(folders.failedSourcesDir);
  });
});

describe("archiveSourceFile", () => {
  it("moves a source file into the requested archive directory", async () => {
    const sourcePath = path.join(tempDir, "Entrada", "video.mp4");
    const archiveDir = path.join(tempDir, "Processados");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, "video");

    const archivedPath = await archiveSourceFile({ sourcePath, archiveDir });

    expect(archivedPath).toBe(path.join(archiveDir, "video.mp4"));
    await expect(fs.readFile(archivedPath, "utf8")).resolves.toBe("video");
    await expect(fs.stat(sourcePath)).rejects.toThrow();
  });

  it("avoids overwriting an existing archived file by adding the source hash", async () => {
    const sourcePath = path.join(tempDir, "Entrada", "video.mp4");
    const archiveDir = path.join(tempDir, "Processados");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(sourcePath, "new video");
    await fs.writeFile(path.join(archiveDir, "video.mp4"), "old video");

    const archivedPath = await archiveSourceFile({
      sourcePath,
      archiveDir,
      sourceHash: "abcdef1234567890"
    });

    expect(archivedPath).toBe(path.join(archiveDir, "video-abcdef12.mp4"));
    await expect(fs.readFile(archivedPath, "utf8")).resolves.toBe("new video");
    await expect(fs.readFile(path.join(archiveDir, "video.mp4"), "utf8")).resolves.toBe("old video");
  });
});

describe("discoverSourceFiles", () => {
  it("returns sorted supported top-level media files and ignores nested files", async () => {
    const inputDir = path.join(tempDir, "Entrada");
    const nestedDir = path.join(inputDir, "nested");
    await fs.mkdir(nestedDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(inputDir, "zeta.mov"), "video"),
      fs.writeFile(path.join(inputDir, "alpha.MP4"), "video"),
      fs.writeFile(path.join(inputDir, "middle.m4v"), "video"),
      fs.writeFile(path.join(inputDir, "clip.mkv"), "video"),
      fs.writeFile(path.join(inputDir, "notes.txt"), "ignore"),
      fs.writeFile(path.join(nestedDir, "nested.mp4"), "ignore")
    ]);

    await expect(discoverSourceFiles(inputDir)).resolves.toEqual([
      path.join(inputDir, "alpha.MP4"),
      path.join(inputDir, "clip.mkv"),
      path.join(inputDir, "middle.m4v"),
      path.join(inputDir, "zeta.mov")
    ]);
  });

  it("returns an empty array when the input folder is missing", async () => {
    await expect(discoverSourceFiles(path.join(tempDir, "missing"))).resolves.toEqual([]);
  });
});

describe("isStableFile", () => {
  it("returns true when the file size stays the same", async () => {
    const filePath = path.join(tempDir, "stable.mp4");
    await fs.writeFile(filePath, "stable");

    await expect(isStableFile(filePath, { checks: 3, intervalMs: 1 })).resolves.toBe(true);
  });

  it("returns false when the file size changes between deterministic checks", async () => {
    const filePath = path.join(tempDir, "changing.mp4");
    const statFile = vi
      .fn()
      .mockResolvedValueOnce({ size: 6, mtimeMs: 100 })
      .mockResolvedValueOnce({ size: 12, mtimeMs: 200 });
    const sleepMs = vi.fn().mockResolvedValue(undefined);

    await expect(isStableFile(filePath, { checks: 3, intervalMs: 10, statFile, sleepMs })).resolves.toBe(false);
    expect(statFile).toHaveBeenCalledTimes(2);
    expect(sleepMs).toHaveBeenCalledTimes(1);
    expect(sleepMs).toHaveBeenCalledWith(10);
  });

  it("returns false when the file mtime changes even if size stays the same", async () => {
    const filePath = path.join(tempDir, "same-size-rewrite.mp4");
    const statFile = vi
      .fn()
      .mockResolvedValueOnce({ size: 10, mtimeMs: 100 })
      .mockResolvedValueOnce({ size: 10, mtimeMs: 200 });
    const sleepMs = vi.fn().mockResolvedValue(undefined);

    await expect(isStableFile(filePath, { checks: 3, intervalMs: 10, statFile, sleepMs })).resolves.toBe(false);
  });
});

describe("getFileSha256", () => {
  it("streams the file and returns its SHA-256 hex digest", async () => {
    const filePath = path.join(tempDir, "hash.mp4");
    await fs.writeFile(filePath, "hello media factory");

    await expect(getFileSha256(filePath)).resolves.toBe(
      "edbe9e9209327dda4889232efb9396fe149b951a5b8784ffe6954867e272f793"
    );
  });
});

describe("getPackageSlug", () => {
  it("builds a dated package slug from the file name and hash", () => {
    expect(
      getPackageSlug({
        filePath: path.join(tempDir, "Mý Vídeo Final!!.MP4"),
        hash: "abcdef1234567890",
        now: new Date("2026-05-11T12:00:00.000Z")
      })
    ).toBe("2026-05-11-my-video-final-abcdef12");
  });

  it("falls back to video when the file name has no slug-safe text", () => {
    expect(
      getPackageSlug({
        filePath: path.join(tempDir, "!!!.mov"),
        hash: "1234567890abcdef",
        now: new Date("2026-05-11T12:00:00.000Z")
      })
    ).toBe("2026-05-11-video-12345678");
  });

  it("caps long slugified basenames before appending date and hash", () => {
    const slug = getPackageSlug({
      filePath: path.join(
        tempDir,
        "This is a very long video filename that keeps going well past the conservative basename limit.mov"
      ),
      hash: "abcdef1234567890",
      now: new Date("2026-05-11T12:00:00.000Z")
    });

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toBe(
      "2026-05-11-this-is-a-very-long-video-filename-that-keeps-going-well-pas-abcdef12"
    );
  });
});

describe("getHumanPackageName", () => {
  it("builds a readable package name from date, kind and generated title", () => {
    expect(
      getHumanPackageName({
        kind: "Horizontal",
        title: "Como crescer no YouTube? Guia prático / sem enrolação",
        now: new Date("2026-05-12T12:00:00.000Z")
      })
    ).toBe("2026-05-12 - Horizontal - Como crescer no YouTube Guia prático sem enrolação");
  });

  it("caps very long human package titles", () => {
    const name = getHumanPackageName({
      kind: "Shorts",
      title: "Este é um título muito grande que passaria do limite confortável de leitura no Finder",
      now: new Date("2026-05-12T12:00:00.000Z")
    });

    expect(name.length).toBeLessThanOrEqual(90);
    expect(name).toMatch(/^2026-05-12 - Shorts - Este é um título/);
    expect(name).not.toMatch(/\s\w{1,2}$/);
  });
});

describe("renamePackageDirectory", () => {
  it("renames a temporary package directory to a readable available name", async () => {
    const packageDir = path.join(tempDir, "Saida", "ready-to-approve", "2026-05-12-temp-abcdef12");
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(path.join(packageDir, "manifest.json"), "{}");

    const renamedPath = await renamePackageDirectory({
      packageDir,
      desiredName: "2026-05-12 - Horizontal - Titulo Final"
    });

    expect(renamedPath).toBe(path.join(tempDir, "Saida", "ready-to-approve", "2026-05-12 - Horizontal - Titulo Final"));
    await expect(fs.readFile(path.join(renamedPath, "manifest.json"), "utf8")).resolves.toBe("{}");
    await expect(fs.stat(packageDir)).rejects.toThrow();
  });

  it("adds a simple suffix when the readable package name already exists", async () => {
    const packageDir = path.join(tempDir, "Saida", "ready-to-approve", "2026-05-12-temp-abcdef12");
    const existingDir = path.join(tempDir, "Saida", "ready-to-approve", "2026-05-12 - Shorts - Corte Bom");
    await fs.mkdir(packageDir, { recursive: true });
    await fs.mkdir(existingDir, { recursive: true });

    const renamedPath = await renamePackageDirectory({
      packageDir,
      desiredName: "2026-05-12 - Shorts - Corte Bom"
    });

    expect(renamedPath).toBe(path.join(tempDir, "Saida", "ready-to-approve", "2026-05-12 - Shorts - Corte Bom - 2"));
  });
});

async function expectDirectory(dirPath: string): Promise<void> {
  const stat = await fs.stat(dirPath);

  expect(stat.isDirectory()).toBe(true);
}

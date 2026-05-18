import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createProjectWorkspace } from "../workspace";
import { withTempDir } from "../../test/fixtures";
import { createJobStore } from "./job-store";
import { runYoutubePackageJob, selectFrameTimes, selectIdentityClipRanges } from "./run-youtube-package-job";

async function writeCaptionedPlan(planPath: string, sourcePath: string) {
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: sourcePath,
      durationSec: 100,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 100, timelineStartSec: 0, timelineEndSec: 100, reason: "kept speech/content" }
    ],
    removed: [],
    sections: [
      {
        id: "section_hook",
        type: "hook",
        startSec: 0,
        endSec: 18,
        label: "Como automatizar thumbnails",
        confidence: 0.9,
        warnings: [],
        treatments: {}
      }
    ],
    captions: [
      { id: "cap_1", startSec: 0.2, endSec: 2.8, text: "Hoje eu vou mostrar como eu automatizo meu video do YouTube", styleId: "focus_word", words: [] },
      { id: "cap_2", startSec: 5, endSec: 8, text: "A thumbnail precisa vender a ideia antes do clique", styleId: "focus_word", words: [] }
    ],
    overlays: [],
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

async function writePlanWithoutCaptions(planPath: string, sourcePath: string) {
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: sourcePath,
      durationSec: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
    ],
    removed: [],
    captions: [],
    overlays: [],
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

describe("runYoutubePackageJob", () => {
  it("writes YouTube copy files and extracts four reference frames plus two identity clips", async () => {
    await withTempDir("ai-editor-youtube-package-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mp4");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeCaptionedPlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const generateYouTubeThumbnails = vi.fn(async (input: { outputDir: string }) => {
        await mkdir(path.join(input.outputDir, "thumbnails"), { recursive: true });
        await writeFile(path.join(input.outputDir, "thumbnail.png"), "selected");
        await writeFile(path.join(input.outputDir, "thumbnails/opcao-01.png"), "thumb 1");
        await writeFile(path.join(input.outputDir, "thumbnails/opcao-02.png"), "thumb 2");
        await writeFile(path.join(input.outputDir, "thumbnails/opcao-03.png"), "thumb 3");
        await writeFile(path.join(input.outputDir, "thumbnail-brief.json"), "{}");
        return {
          selected: "thumbnail.png" as const,
          options: ["thumbnails/opcao-01.png", "thumbnails/opcao-02.png", "thumbnails/opcao-03.png"],
          brief: "thumbnail-brief.json"
        };
      });
      const generateYoutubePackageCopy = vi.fn().mockResolvedValue({
        title: "Esse Fluxo De YouTube Economiza Horas",
        description: "Uma descricao pronta e estrategica para publicar o video com contexto, promessa e CTA natural.",
        thumbnailPrompts: [
          "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, com rosto grande, expressao intensa, contraste alto, fundo limpo e texto curto de no maximo tres palavras. Variacao de curiosidade focada em maximizar cliques.",
          "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, com rosto grande, expressao de alerta, contraste alto, fundo limpo e texto curto de no maximo tres palavras. Variacao de erro focada em maximizar cliques.",
          "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, com rosto grande, expressao de resultado, contraste alto, fundo limpo e texto curto de no maximo tres palavras. Variacao de ganho focada em maximizar cliques."
        ],
        thumbnailPromptWithoutFace: "Crie uma thumbnail 16:9 sem usar rosto, sem pessoa parecida com o criador, baseada no tema real do video. Use um simbolo central gigante, contraste dramatico, texto curto de ate tres palavras e composicao editorial feita para maximizar cliques."
      });

      await runYoutubePackageJob({ jobId: job.id, workspace, jobs }, processRunner, {
        generateYoutubePackageCopy,
        generateYouTubeThumbnails
      });

      const packageDir = path.join(workspace.root, "download", "youtube-package");
      await expect(readFile(path.join(packageDir, "titulo.txt"), "utf8")).resolves.toContain("Economiza Horas");
      await expect(readFile(path.join(packageDir, "descricao.txt"), "utf8")).resolves.toContain("descricao pronta");
      const thumbnailPrompt = await readFile(path.join(packageDir, "prompt-thumbnail.txt"), "utf8");
      expect(thumbnailPrompt).toContain("VARIACAO 1");
      expect(thumbnailPrompt).toContain("VARIACAO 2");
      expect(thumbnailPrompt).toContain("VARIACAO 3");
      expect(thumbnailPrompt).toContain("THUMB SEM FOTO");
      expect(thumbnailPrompt).toContain("quatro imagens");
      expect(thumbnailPrompt).toContain("identity-ref-01.mp4");
      expect(thumbnailPrompt).toContain("sem usar rosto");
      await expect(readFile(path.join(packageDir, "transcricao.txt"), "utf8")).resolves.toContain("[0:00 - 0:02]");
      await expect(readFile(path.join(packageDir, "thumbnail-generated-01.png"), "utf8")).resolves.toBe("thumb 1");
      await expect(readFile(path.join(packageDir, "thumbnail-generated-02.png"), "utf8")).resolves.toBe("thumb 2");
      await expect(readFile(path.join(packageDir, "thumbnail-generated-03.png"), "utf8")).resolves.toBe("thumb 3");
      expect(generateYoutubePackageCopy).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("A thumbnail precisa vender"));
      expect(generateYouTubeThumbnails).toHaveBeenCalledWith({
        videoPath: roughCutPath,
        outputDir: packageDir,
        title: "Esse Fluxo De YouTube Economiza Horas",
        durationSec: 100
      });
      expect(processRunner).toHaveBeenCalledTimes(6);
      expect(processRunner.mock.calls[0][1]).toEqual(expect.arrayContaining(["-ss", "8", "-i", roughCutPath]));
      expect(processRunner.mock.calls[3][1]).toContain(path.join(packageDir, "thumbnail-ref-04.jpg"));
      expect(processRunner.mock.calls[4][1]).toEqual(expect.arrayContaining([
        "-ss",
        "0.8",
        "-i",
        roughCutPath,
        "-t",
        "4",
        path.join(packageDir, "identity-ref-01.mp4")
      ]));
      expect(processRunner.mock.calls[5][1]).toEqual(expect.arrayContaining([
        "-ss",
        "55",
        "-i",
        roughCutPath,
        "-t",
        "4",
        path.join(packageDir, "identity-ref-02.mp4")
      ]));
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        message: "YouTube package is ready",
        outputPath: packageDir
      });
    });
  });

  it("fails with a useful message when captions are missing", async () => {
    await withTempDir("ai-editor-youtube-package-empty-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mp4");
      await writeFile(sourcePath, "source");
      await writePlanWithoutCaptions(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });

      await runYoutubePackageJob({ jobId: job.id, workspace, jobs }, vi.fn());

      expect(jobs.get(job.id)).toMatchObject({
        status: "failed",
        stage: "failed",
        message: "YouTube package failed",
        error: expect.stringMatching(/legendas/i)
      });
    });
  });

  it("selects four stable frame times across the edited duration", async () => {
    const plan = {
      source: { durationSec: 50 },
      segments: [{ timelineEndSec: 25 }]
    } as Parameters<typeof selectFrameTimes>[0];

    expect(selectFrameTimes(plan)).toEqual([2, 8, 14.5, 21]);
  });

  it("selects two four-second identity clips from hook and later footage", async () => {
    const plan = {
      source: { durationSec: 100 },
      segments: [{ timelineEndSec: 100 }]
    } as Parameters<typeof selectIdentityClipRanges>[0];

    expect(selectIdentityClipRanges(plan)).toEqual([
      { startSec: 0.8, durationSec: 4 },
      { startSec: 55, durationSec: 4 }
    ]);
  });
});

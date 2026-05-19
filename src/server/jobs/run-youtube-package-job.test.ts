import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createProjectWorkspace } from "../workspace";
import { withTempDir } from "../../test/fixtures";
import { createJobStore } from "./job-store";
import { runYoutubePackageJob, selectCandidateFrameTimes, selectIdentityClipRanges } from "./run-youtube-package-job";

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
  it("writes YouTube copy files and extracts six candidate frames plus two identity clips", async () => {
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
      const renderV9ThumbnailImages = vi.fn(async (packageDir: string) => {
        await Promise.all([1, 2, 3, 4, 5, 6].map((index) => (
          writeFile(path.join(packageDir, `thumbnail-generated-${String(index).padStart(2, "0")}.png`), "png")
        )));
      });
      const generateYoutubePackageCopy = vi.fn().mockResolvedValue({
        title: "Esse Fluxo De YouTube Economiza Horas",
        description: "Uma descricao pronta e estrategica para publicar o video com contexto, promessa e CTA natural.",
        chapters: [
          { time: "00:00", title: "A thumbnail precisa vender" },
          { time: "00:30", title: "Como transformar o dia ruim" }
        ],
        thumbnailPrompts: [
          { conceptId: "fiz_mesmo_assim", title: "Fiz Mesmo Assim", renderText: { headline: ["FIZ", "MESMO", "ASSIM"], subhead: "mesmo nos dias ruins", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei mesmo assim", "canal criado"], tags: ["PROCESSO", "REAL", "BASTIDOR"] }, prompt: "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, com rosto grande, expressao intensa, contraste alto, fundo limpo e texto curto de no maximo tres palavras. Variacao de curiosidade focada em maximizar cliques." },
          { conceptId: "conflito_resultado", title: "Conflito Resultado", renderText: { headline: ["CONFLITO", "RESULTADO"], subhead: "do conflito ao resultado", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei mesmo assim", "canal criado"], tags: ["PROCESSO", "REAL", "BASTIDOR"] }, prompt: "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, com rosto grande, expressao de alerta, contraste alto, fundo limpo e texto curto de no maximo tres palavras. Variacao de erro focada em maximizar cliques." },
          { conceptId: "manchete_editorial", title: "Manchete Editorial", renderText: { headline: ["MANCHETE", "EDITORIAL"], subhead: "editorial de resultado", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei mesmo assim", "canal criado"], tags: ["PROCESSO", "REAL", "BASTIDOR"] }, prompt: "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, com rosto grande, expressao de resultado, contraste alto, fundo limpo e texto curto de no maximo tres palavras. Variacao de ganho focada em maximizar cliques." },
          { conceptId: "sistema_status", title: "Sistema Status", renderText: { headline: ["SISTEMA", "STATUS"], subhead: "sistema em execucao", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei mesmo assim", "canal criado"], tags: ["PROCESSO", "REAL", "BASTIDOR"] }, prompt: "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, estilo sistema/status, com checklist claro e texto grande." },
          { conceptId: "rede_social_negocio", title: "Rede Social Negocio", renderText: { headline: ["REDE", "SOCIAL", "NEGOCIO"], subhead: "atencao vira ativo", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei mesmo assim", "canal criado"], tags: ["PROCESSO", "REAL", "BASTIDOR"] }, prompt: "Use as quatro imagens anexadas e os dois clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia fiel do rosto do criador. Crie uma thumbnail 16:9 profissional, estilo rede social/negocio, com cards grandes e tese de atencao." }
        ]
      });
      const selectBestFrame = vi.fn().mockResolvedValue(0);
      const preprocessFrame = vi.fn(async (_input: string, output: string) => {
        await writeFile(output, "jpeg");
      });

      await runYoutubePackageJob(
        { jobId: job.id, workspace, jobs },
        processRunner,
        { generateYoutubePackageCopy, renderV9ThumbnailImages, selectBestFrame, preprocessFrame }
      );

      const packageDir = path.join(workspace.root, "download", "youtube-package");
      await expect(readFile(path.join(packageDir, "titulo.txt"), "utf8")).resolves.toContain("Economiza Horas");
      await expect(readFile(path.join(packageDir, "descricao.txt"), "utf8")).resolves.toContain("descricao pronta");
      await expect(readFile(path.join(packageDir, "chapters.txt"), "utf8")).resolves.toContain("00:30 Como transformar o dia ruim");
      await expect(readFile(path.join(packageDir, "tags.txt"), "utf8")).resolves.toBe("PROCESSO\nREAL\nBASTIDOR\n");
      const thumbnailPrompt = await readFile(path.join(packageDir, "prompt-thumbnail.txt"), "utf8");
      expect(thumbnailPrompt).toContain("VARIACAO 1");
      expect(thumbnailPrompt).toContain("VARIACAO 2");
      expect(thumbnailPrompt).toContain("VARIACAO 3");
      expect(thumbnailPrompt).toContain("VARIACAO 5");
      expect(thumbnailPrompt).not.toContain("THUMB SEM FOTO");
      expect(thumbnailPrompt).toContain("quatro imagens");
      expect(thumbnailPrompt).toContain("identity-ref-01.mp4");
      await expect(readFile(path.join(packageDir, "transcricao.txt"), "utf8")).resolves.toContain("[0:00 - 0:02]");
      await expect(readFile(path.join(packageDir, "thumbnail-idea-01-fiz-mesmo-assim.txt"), "utf8")).resolves.toContain("VARIACAO 1");
      await expect(readFile(path.join(packageDir, "thumbnail-idea-05-rede-social-negocio.txt"), "utf8")).resolves.toContain("VARIACAO 5");
      await expect(access(path.join(packageDir, "thumbnail-generated-01.png"))).resolves.toBeUndefined();
      await expect(access(path.join(packageDir, "thumbnail-generated-06.png"))).resolves.toBeUndefined();
      expect(generateYoutubePackageCopy).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("A thumbnail precisa vender"));
      expect(renderV9ThumbnailImages).toHaveBeenCalledWith(packageDir, expect.objectContaining({
        title: "Esse Fluxo De YouTube Economiza Horas"
      }));
      expect(processRunner).toHaveBeenCalledTimes(8);
      // First 6 calls are candidate frame extractions with thumbnail filter
      expect(processRunner.mock.calls[0][1]).toEqual(
        expect.arrayContaining(["-vf", "thumbnail=60", "-frames:v", "1"])
      );
      // Identity clips are calls 7 and 8
      expect(processRunner.mock.calls[6][1]).toEqual(expect.arrayContaining([
        "-ss",
        "0.8",
        "-i",
        roughCutPath,
        "-t",
        "4",
        path.join(packageDir, "identity-ref-01.mp4")
      ]));
      expect(processRunner.mock.calls[7][1]).toEqual(expect.arrayContaining([
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

  it("uses identity photo library for ref-01 when photos are present", async () => {
    await withTempDir("ai-editor-youtube-package-identity-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mp4");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");

      // Create a per-project identity-photos folder (workspace.root/identity-photos/)
      const identityPhotosDir = path.join(workspace.root, "identity-photos");
      await mkdir(identityPhotosDir, { recursive: true });
      await writeFile(path.join(identityPhotosDir, "expressivo.jpg"), "fake-photo");

      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeCaptionedPlan(workspace.planPath, sourcePath);

      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      const renderV9ThumbnailImages = vi.fn(async (packageDir: string) => {
        await Promise.all([1, 2, 3, 4, 5, 6].map((index) =>
          writeFile(path.join(packageDir, `thumbnail-generated-${String(index).padStart(2, "0")}.png`), "png")
        ));
      });

      const generateYoutubePackageCopy = vi.fn().mockResolvedValue({
        title: "Esse Fluxo De YouTube Economiza Horas",
        description: "Uma descricao pronta.",
        chapters: [{ time: "00:00", title: "Intro" }],
        thumbnailPrompts: [
          { conceptId: "fiz_mesmo_assim", title: "Fiz Mesmo Assim", renderText: { headline: ["FIZ"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
          { conceptId: "conflito_resultado", title: "Conflito", renderText: { headline: ["CONFLITO"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
          { conceptId: "manchete_editorial", title: "Manchete", renderText: { headline: ["MANCHETE"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
          { conceptId: "sistema_status", title: "Sistema", renderText: { headline: ["SISTEMA"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
          { conceptId: "rede_social_negocio", title: "Rede", renderText: { headline: ["REDE"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
        ]
      });

      const selectBestFrame = vi.fn().mockResolvedValue(0);
      const preprocessFrame = vi.fn(async (_input: string, output: string) => {
        await writeFile(output, "jpeg");
      });
      // selectIdentityPhoto returns index 0 → picks expressivo.jpg
      const selectIdentityPhoto = vi.fn().mockResolvedValue(0);
      // cropFaceRegion should NOT be called when identity photos are present
      const cropFaceRegion = vi.fn();

      await runYoutubePackageJob(
        { jobId: job.id, workspace, jobs },
        processRunner,
        { generateYoutubePackageCopy, renderV9ThumbnailImages, selectBestFrame, preprocessFrame, selectIdentityPhoto, cropFaceRegion }
      );

      // selectIdentityPhoto was called with the photo path and the video title
      expect(selectIdentityPhoto).toHaveBeenCalledWith(
        [path.join(identityPhotosDir, "expressivo.jpg")],
        "Esse Fluxo De YouTube Economiza Horas"
      );
      // cropFaceRegion was NOT called — identity photo bypasses face crop
      expect(cropFaceRegion).not.toHaveBeenCalled();
      // Job completed successfully
      expect(jobs.get(job.id)).toMatchObject({ status: "passed", stage: "complete" });
      // The selected identity photo was preprocessed and written as ref-01
      const packageDir = path.join(workspace.root, "download", "youtube-package");
      await expect(access(path.join(packageDir, "thumbnail-ref-01.jpg"))).resolves.toBeUndefined();
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

  it("selects six candidate frame times across the edited duration", async () => {
    const plan = {
      source: { durationSec: 50 },
      segments: [{ timelineEndSec: 25 }]
    } as Parameters<typeof selectCandidateFrameTimes>[0];

    const times = selectCandidateFrameTimes(plan);
    expect(times).toHaveLength(6);
    expect(times[0]).toBeCloseTo(1.25, 0); // 0.05 * 25
    expect(times[5]).toBeCloseTo(22, 0);   // 0.88 * 25
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

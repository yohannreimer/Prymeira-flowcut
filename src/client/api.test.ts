import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureApiAuth,
  deleteProject,
  exportProject,
  fetchEditPlan,
  fetchJob,
  fetchPublishReadiness,
  fetchYoutubePackageSummary,
  fetchUploadConfig,
  generateAIMotion,
  generateCaptions,
  generateYoutubePackage,
  listProjects,
  publishYoutubeVideo,
  rerenderProject,
  touchProjectActivity,
  updateCaption,
  updateCaptionSettings,
  updateSection,
  uploadVideo
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  configureApiAuth(null);
});

describe("api client", () => {
  class FakeUploadXMLHttpRequest {
    static response = {
      status: 201,
      responseText: JSON.stringify({
        projectId: "project_123",
        job: {
          id: "job_123",
          projectId: "project_123",
          status: "queued",
          stage: "queued",
          message: "Waiting",
          sourcePath: "/tmp/source.mov",
          outputPath: null,
          outputUrl: null,
          planPath: null,
          warnings: [],
          error: null
        }
      }),
      contentType: "application/json"
    };
    static instances: FakeUploadXMLHttpRequest[] = [];

    method: string | null = null;
    url: string | null = null;
    async: boolean | null = null;
    requestHeaders: Record<string, string> = {};
    sentBody: BodyInit | null = null;
    status = 0;
    responseText = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;

    constructor() {
      FakeUploadXMLHttpRequest.instances.push(this);
    }

    open(method: string, url: string, async = true) {
      this.method = method;
      this.url = url;
      this.async = async;
    }

    setRequestHeader(name: string, value: string) {
      this.requestHeaders[name] = value;
    }

    getResponseHeader(name: string) {
      return name.toLowerCase() === "content-type" ? FakeUploadXMLHttpRequest.response.contentType : null;
    }

    send(body?: BodyInit | null) {
      this.sentBody = body ?? null;
      queueMicrotask(() => {
        this.status = FakeUploadXMLHttpRequest.response.status;
        this.responseText = FakeUploadXMLHttpRequest.response.responseText;
        this.onload?.();
      });
    }
  }

  function installFakeUploadXhr() {
    FakeUploadXMLHttpRequest.instances = [];
    FakeUploadXMLHttpRequest.response = {
      status: 201,
      responseText: JSON.stringify({
        projectId: "project_123",
        job: {
          id: "job_123",
          projectId: "project_123",
          status: "queued",
          stage: "queued",
          message: "Waiting",
          sourcePath: "/tmp/source.mov",
          outputPath: null,
          outputUrl: null,
          planPath: null,
          warnings: [],
          error: null
        }
      }),
      contentType: "application/json"
    };
    vi.stubGlobal("XMLHttpRequest", FakeUploadXMLHttpRequest);
    return FakeUploadXMLHttpRequest;
  }

  it("attaches the configured Clerk bearer token to JSON requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [] }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    configureApiAuth(() => "clerk-token-123");

    await listProjects();

    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
      headers: { Authorization: "Bearer clerk-token-123" }
    }));
  });

  it("preserves caller headers while attaching auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_motion",
        projectId: "project_123",
        status: "queued",
        stage: "motion_queued",
        message: "AI motion accepted",
        sourcePath: "/tmp/source.mov",
        outputPath: null,
        outputUrl: null,
        planPath: null,
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    configureApiAuth(async () => "clerk-token-123");

    await generateAIMotion("project_123");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/motion", expect.objectContaining({
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer clerk-token-123"
      }
    }));
  });

  it("lists projects from the local library endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      projects: [
        {
          id: "project_123",
          name: "source.mov",
          sourceFileName: "source.mov",
          createdAt: "2026-05-05T00:00:00.000Z",
          updatedAt: "2026-05-05T00:01:00.000Z",
          durationSec: 12,
          orientation: "vertical",
          status: "rendered",
          counts: { cuts: 1, captions: 2 },
          versions: [{ kind: "rough_cut", label: "Rough cut", createdAt: "2026-05-05T00:01:00.000Z" }],
          outputUrl: "/media/project_123/rough-cut.mp4"
        }
      ]
    }), {
      headers: { "content-type": "application/json" }
    })));

    await expect(listProjects()).resolves.toMatchObject([
      { id: "project_123", status: "rendered", outputUrl: "/media/project_123/rough-cut.mp4" }
    ]);
  });

  it("requests an accepted export job with export settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_123",
        projectId: "project_123",
        status: "queued",
        stage: "export_queued",
        message: "Export accepted",
        sourcePath: "/tmp/source.mov",
        outputPath: null,
        outputUrl: null,
        planPath: "/tmp/edit-plan.json",
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await exportProject("project_123", {
      renderMode: "full",
      format: "horizontal",
      resolution: "4k",
      quality: "rapida",
      fileName: "launch-cut.mp4",
      destinationFolder: "/exports",
      audioCleanup: true,
      audioDucking: false,
      sdrMode: "convert_to_sdr",
      captionSettings: {
        enabled: true,
        styleId: "focus_word",
        displayMode: "word_ping",
        fontId: "system_bold",
        fontSizePct: 6,
        wordsPerBlock: 1,
        positionYPct: 82,
        maxWidthPct: 88,
        primaryColor: "#fbfaf4",
        activeColor: "#fcc009",
        outlineColor: "#171716",
        outlineWidthPct: 0.28,
        shadow: false,
        uppercase: false
      }
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        renderMode: "full",
        format: "horizontal",
        resolution: "4k",
        quality: "rapida",
        fileName: "launch-cut.mp4",
        destinationFolder: "/exports",
        audioCleanup: true,
        audioDucking: false,
        sdrMode: "convert_to_sdr",
        captionSettings: {
          enabled: true,
          styleId: "focus_word",
          displayMode: "word_ping",
          fontId: "system_bold",
          fontSizePct: 6,
          wordsPerBlock: 1,
          positionYPct: 82,
          maxWidthPct: 88,
          primaryColor: "#fbfaf4",
          activeColor: "#fcc009",
          outlineColor: "#171716",
          outlineWidthPct: 0.28,
          shadow: false,
          uppercase: false
        }
      })
    });
  });

  it("deletes a project through the local project endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteProject("project_123");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123", { method: "DELETE" });
  });

  it("records project activity for an open workspace session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await touchProjectActivity("project_123");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/activity", { method: "POST" });
  });

  it("uses server-provided output URLs from job responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_123",
        projectId: "project_123",
        status: "passed",
        stage: "complete",
        message: "Ready",
        sourcePath: "/tmp/project_123/uploads/source.mp4",
        outputPath: "/tmp/project_123/renders/rough-cut.mp4",
        outputUrl: "/media/project_123/rough-cut.mp4",
        planPath: "/tmp/project_123/edit-plan.json",
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    })));

    await expect(fetchJob("job_123")).resolves.toMatchObject({
      outputUrl: "/media/project_123/rough-cut.mp4"
    });
  });

  it("parses JSON error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    })));

    await expect(fetchJob("missing")).rejects.toThrow("Job not found");
  });

  it("falls back to response text for non-JSON upload errors", async () => {
    const xhr = installFakeUploadXhr();
    xhr.response = {
      status: 500,
      responseText: "Upload exploded",
      contentType: "text/plain"
    };

    await expect(uploadVideo(new File(["fake"], "sample.mp4", { type: "video/mp4" }))).rejects.toThrow(
      "Upload exploded"
    );
  });

  it("sends the selected cut preset with uploads", async () => {
    const xhr = installFakeUploadXhr();

    await uploadVideo(new File(["fake"], "sample.mov", { type: "video/quicktime" }), { cutPresetId: "aggressive" });

    const request = xhr.instances[0]!;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/api/projects");
    const form = request.sentBody as FormData;
    expect(form.get("cutPreset")).toBe("aggressive");
  });

  it("starts AI motion planning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_motion",
        projectId: "project_123",
        status: "queued",
        stage: "motion_queued",
        message: "AI motion accepted",
        sourcePath: "/tmp/source.mov",
        outputPath: null,
        outputUrl: null,
        planPath: null,
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAIMotion("project_123")).resolves.toMatchObject({ id: "job_motion" });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/motion", expect.objectContaining({
      method: "POST"
    }));
  });

  it("starts YouTube package generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_youtube_package",
        projectId: "project_123",
        status: "queued",
        stage: "youtube_package_queued",
        message: "YouTube package accepted",
        sourcePath: "/tmp/source.mov",
        outputPath: null,
        outputUrl: null,
        planPath: null,
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateYoutubePackage("project_123")).resolves.toMatchObject({ id: "job_youtube_package" });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/youtube-package", expect.objectContaining({
      method: "POST"
    }));
  });

  it("fetches a YouTube package summary", async () => {
    const summary = {
      status: "ready",
      title: "Titulo pronto",
      description: "Descricao pronta",
      chapters: "00:00 Inicio\n00:30 Ideia principal",
      transcriptAvailable: true,
      thumbnailPrompt: "Prompt de thumbnail",
      missing: [],
      assets: [
        {
          kind: "thumbnail_reference",
          name: "thumbnail-ref-01.jpg",
          url: "/api/projects/project_123/youtube-package/assets/thumbnail-ref-01.jpg"
        }
      ]
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ summary }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchYoutubePackageSummary("project_123")).resolves.toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/youtube-package/summary", { signal: undefined });
  });

  it("turns browser network failures into a useful local API message", async () => {
    class FailingXMLHttpRequest extends FakeUploadXMLHttpRequest {
      override send(body?: BodyInit | null) {
        this.sentBody = body ?? null;
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("XMLHttpRequest", FailingXMLHttpRequest);

    await expect(uploadVideo(new File(["fake"], "sample.mp4", { type: "video/mp4" }))).rejects.toThrow(
      /upload|conexao|interrompido/i
    );
  });

  it("rejects files above the configured upload limit before starting the request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["fake"], "sample.mp4", { type: "video/mp4" });

    await expect(uploadVideo(file, { uploadFileSizeLimitBytes: file.size - 1 })).rejects.toThrow(/maior|limite/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the upload configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      uploadFileSizeLimitBytes: 5368709120
    }), {
      headers: { "content-type": "application/json" }
    })));

    await expect(fetchUploadConfig()).resolves.toEqual({ uploadFileSizeLimitBytes: 5368709120 });
  });

  it("fetches sanitized edit plans", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      plan: {
        projectId: "project_123",
        source: { durationSec: 10, width: 1920, height: 1080, fps: 30, hasAudio: true },
        segments: [],
        removed: [{ id: "cut_1", startSec: 2, endSec: 5, reason: "silence" }],
        qa: { status: "passed", warnings: [] }
      }
    }), {
      headers: { "content-type": "application/json" }
    })));

    await expect(fetchEditPlan("project_123")).resolves.toMatchObject({
      removed: [{ id: "cut_1", startSec: 2, endSec: 5 }]
    });
  });

  it("requests manual rerenders with active cut IDs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_123",
        projectId: "project_123",
        status: "queued",
        stage: "queued",
        message: "Waiting",
        sourcePath: "/tmp/source.mov",
        outputPath: null,
        outputUrl: null,
        planPath: null,
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await rerenderProject("project_123", ["cut_1"]);

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeCutIds: ["cut_1"] })
    });
  });

  it("requests Whisper captions with the selected caption style", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job: {
        id: "job_123",
        projectId: "project_123",
        status: "queued",
        stage: "queued",
        message: "Waiting",
        sourcePath: "/tmp/source.mov",
        outputPath: null,
        outputUrl: null,
        planPath: null,
        warnings: [],
        error: null
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await generateCaptions("project_123", { captionStyleId: "focus_word" });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/captions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captionStyleId: "focus_word" })
    });
  });

  it("saves caption text without starting a render job", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      plan: {
        projectId: "project_123",
        sourceUrl: "/media/project_123/source",
        captionsVttUrl: "/media/project_123/captions.vtt",
        source: { durationSec: 10, width: 1920, height: 1080, fps: 30, hasAudio: true },
        segments: [],
        removed: [],
        captions: [{ id: "cap_1", startSec: 0, endSec: 1, text: "texto novo", styleId: "focus_word", words: [] }],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] }
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateCaption("project_123", "cap_1", { text: "texto novo" });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/captions/cap_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "texto novo" })
    });
  });

  it("saves caption settings without rendering", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      plan: {
        projectId: "project_123",
        sourceUrl: "/media/project_123/source",
        captionsVttUrl: "/media/project_123/captions.vtt",
        source: { durationSec: 10, width: 1920, height: 1080, fps: 30, hasAudio: true },
        segments: [],
        removed: [],
        captions: [],
        captionSettings: { enabled: true, displayMode: "block_highlight", styleId: "focus_word" },
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] }
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateCaptionSettings("project_123", { wordsPerBlock: 5, enabled: false });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/captions/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wordsPerBlock: 5, enabled: false })
    });
  });

  it("updates a timeline section", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      plan: {
        projectId: "project_123",
        sourceUrl: "/media/project_123/source",
        captionsVttUrl: null,
        source: { durationSec: 10, width: 1920, height: 1080, fps: 30, hasAudio: true },
        segments: [],
        removed: [],
        sections: [{ id: "section_1", type: "screen", treatments: { captions: { enabled: false } } }],
        captions: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        publishReadiness: { status: "needs_review", checks: [] }
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateSection("project_123", "section_1", { treatments: { captions: { enabled: false } } });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/sections/section_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ treatments: { captions: { enabled: false } } })
    });
  });

  it("fetches publish readiness", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      publishReadiness: { status: "ready", checks: [] }
    }), {
      headers: { "content-type": "application/json" }
    })));

    await expect(fetchPublishReadiness("project_123")).resolves.toEqual({ status: "ready", checks: [] });
  });

  it("publishes the final export to YouTube", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      publication: {
        externalId: "video_123",
        url: "https://www.youtube.com/watch?v=video_123"
      }
    }), {
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(publishYoutubeVideo("project_123", {
      title: "Titulo final",
      description: "Descricao final",
      privacyStatus: "unlisted",
      thumbnailName: "thumbnail-generated-01.png"
    })).resolves.toEqual({
      externalId: "video_123",
      url: "https://www.youtube.com/watch?v=video_123"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/youtube-publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Titulo final",
        description: "Descricao final",
        privacyStatus: "unlisted",
        thumbnailName: "thumbnail-generated-01.png"
      })
    });
  });
});

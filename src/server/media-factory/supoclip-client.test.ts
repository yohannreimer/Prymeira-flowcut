import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSupoClipClips, processSupoClipVideo } from "./supoclip-client";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "supoclip-client-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe("processSupoClipVideo", () => {
  it("uploads a video, creates a task, waits for completion, and downloads clip bytes", async () => {
    const sourcePath = path.join(tempDir, "source.mp4");
    await fs.writeFile(sourcePath, Uint8Array.from([1, 2, 3, 4]));
    const downloadedBytes = Uint8Array.from([9, 8, 7, 6]);
    const progress = {
      info: vi.fn(),
      warn: vi.fn(),
      poll: vi.fn()
    };
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const endpoint = new URL(String(url)).pathname;

      if (endpoint === "/health") {
        return jsonResponse({ status: "healthy" });
      }
      if (endpoint === "/upload") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        const video = (init?.body as FormData).get("video");
        expect(video).toBeInstanceOf(Blob);
        expect((video as File).name).toBe("source.mp4");
        expect(new Uint8Array(await (video as Blob).arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3, 4]));
        return jsonResponse({ video_path: "upload://abc.mp4" });
      }
      if (endpoint === "/tasks/") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          source: {
            url: "upload://abc.mp4",
            title: "Demo video"
          },
          caption_template: "padrao-yohann",
          processing_mode: "balanced",
          output_format: "vertical",
          add_subtitles: true,
          cut_long_pauses: true
        });
        return jsonResponse({ task_id: "task-1" });
      }
      if (endpoint === "/tasks/task-1") {
        return jsonResponse({ status: "completed" });
      }
      if (endpoint === "/tasks/task-1/clips") {
        return jsonResponse({
          clips: [
            { id: "clip-1", title: "Clip one", start_time: 0, end_time: 12.4, relevance_score: 88 },
            { clip_id: "clip-2", title: "Clip two", start_time: 18, end_time: 31 }
          ],
          total_clips: 2
        });
      }
      if (endpoint === "/tasks/task-1/clips/clip-1/file") {
        return bytesResponse(downloadedBytes);
      }
      if (endpoint === "/tasks/task-1/clips/clip-2/file") {
        return bytesResponse(Uint8Array.from([5, 4, 3, 2]));
      }

      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    const result = await processSupoClipVideo({
      backendUrl: "http://supoclip.test",
      userId: "media-factory",
      authSecret: "secret",
      sourcePath,
      title: "Demo video",
      captionTemplate: "padrao-yohann",
      processingMode: "balanced",
      outputFormat: "vertical",
      addSubtitles: true,
      cutLongPauses: true,
      fetch: fetch as typeof globalThis.fetch,
      progress,
      maxPollAttempts: 1,
      pollIntervalMs: 1
    });

    expect(result).toEqual({
      taskId: "task-1",
      clips: [
        {
          id: "clip-1",
          clip_id: "clip-1",
          title: "Clip one",
          start_time: 0,
          end_time: 12.4,
          relevance_score: 88,
          score: 88,
          bytes: downloadedBytes
        },
        { clip_id: "clip-2", title: "Clip two", start_time: 18, end_time: 31, bytes: Uint8Array.from([5, 4, 3, 2]) }
      ]
    });
    expect(progress.poll).toHaveBeenCalledWith("SupoClip processando task task-1...");
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it("reports /health HTTP failures with endpoint and status", async () => {
    const sourcePath = path.join(tempDir, "source.mp4");
    await fs.writeFile(sourcePath, Uint8Array.from([1, 2, 3, 4]));
    const fetch = vi.fn(async () => jsonResponse({ ok: false }, 503, "Service Unavailable"));

    await expect(
      processSupoClipVideo({
        backendUrl: "http://supoclip.test",
        userId: "media-factory",
        sourcePath,
        captionTemplate: "padrao-yohann",
        processingMode: "balanced",
        outputFormat: "vertical",
        addSubtitles: true,
        cutLongPauses: true,
        fetch: fetch as typeof globalThis.fetch
      })
    ).rejects.toThrow("SupoClip /health failed with status 503 Service Unavailable");
  });

  it("passes SupoClip auth headers to fetch without exposing secrets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-05-11T12:40:00.000Z"));
    const sourcePath = path.join(tempDir, "source.mp4");
    await fs.writeFile(sourcePath, Uint8Array.from([1, 2, 3, 4]));
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-supoclip-user-id")).toBe("media-factory");
      expect(headers.get("x-supoclip-ts")).toBe("1715431200");
      expect(headers.get("x-supoclip-signature")).toMatch(/^[a-f0-9]{64}$/);
      expect([...headers.values()]).not.toContain("secret");

      const endpoint = new URL(String(url)).pathname;
      if (endpoint === "/health") {
        return jsonResponse({ ok: true });
      }
      if (endpoint === "/upload") {
        return jsonResponse({ video_path: "upload://abc.mp4" });
      }
      if (endpoint === "/tasks/") {
        return jsonResponse({ task_id: "task-1" });
      }
      if (endpoint === "/tasks/task-1") {
        return jsonResponse({ status: "completed" });
      }
      if (endpoint === "/tasks/task-1/clips") {
        return jsonResponse({ clips: [], total_clips: 0 });
      }

      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    await processSupoClipVideo({
      backendUrl: "http://supoclip.test",
      userId: "media-factory",
      authSecret: "secret",
      sourcePath,
      captionTemplate: "padrao-yohann",
      processingMode: "balanced",
      outputFormat: "vertical",
      addSubtitles: true,
      cutLongPauses: true,
      fetch: fetch as typeof globalThis.fetch,
      maxPollAttempts: 1,
      pollIntervalMs: 1
    });

    expect(fetch).toHaveBeenCalled();
  });
});

describe("listSupoClipClips", () => {
  it("rejects clips without a non-empty clip_id", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        clips: [{ title: "Missing id" }],
        total_clips: 1
      })
    );

    await expect(
      listSupoClipClips({
        backendUrl: "http://supoclip.test",
        userId: "media-factory",
        taskId: "task-1",
        fetch: fetch as typeof globalThis.fetch
      })
    ).rejects.toThrow("SupoClip /tasks/task-1/clips returned an invalid clip at index 0");
  });
});

function jsonResponse(body: unknown, status = 200, statusText = status === 200 ? "OK" : "Error"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body
  } as Response;
}

function bytesResponse(bytes: Uint8Array, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as Response;
}

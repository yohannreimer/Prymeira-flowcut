import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { createProjectWorkspace } from "../workspace";
import { publishVerticalYouTubeShorts } from "./publish-vertical-youtube-shorts";

describe("publishVerticalYouTubeShorts", () => {
  it("publishes unpublished vertical clips using their YouTube Shorts payloads", async () => {
    await withTempDir("flowcut-vertical-shorts-publish-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_vertical");
      await mkdir(path.join(workspace.root, "shorts", "rank-01"), { recursive: true });
      await mkdir(path.join(workspace.root, "shorts", "rank-02"), { recursive: true });
      await writeFile(path.join(workspace.root, "shorts", "rank-01", "clip.mp4"), Buffer.from("clip 1"));
      await writeFile(path.join(workspace.root, "shorts", "rank-02", "clip.mp4"), Buffer.from("clip 2"));
      await writeFile(path.join(workspace.root, "shorts", "rank-01", "youtube-shorts-payload.json"), JSON.stringify({
        video: "shorts/rank-01/clip.mp4",
        title: "Short 1",
        description: "Descricao 1",
        hashtags: ["#shorts", "#flowcut"],
        privacyStatus: "private"
      }));
      await writeFile(path.join(workspace.root, "shorts", "rank-02", "youtube-shorts-payload.json"), JSON.stringify({
        video: "shorts/rank-02/clip.mp4",
        title: "Short 2",
        description: "Descricao 2",
        hashtags: ["#shorts"],
        privacyStatus: "private"
      }));
      await writeFile(path.join(workspace.root, "vertical-package.json"), JSON.stringify({
        projectId: workspace.projectId,
        taskId: "task-123",
        status: "ready",
        clips: [
          { id: "clip-1", rank: 1, payloads: { youtubeShorts: "shorts/rank-01/youtube-shorts-payload.json" } },
          { id: "clip-2", rank: 2, payloads: { youtubeShorts: "shorts/rank-02/youtube-shorts-payload.json" } }
        ],
        warnings: []
      }));
      const publishYouTubeVideo = vi
        .fn()
        .mockResolvedValueOnce({ externalId: "yt-short-1", url: "https://www.youtube.com/watch?v=yt-short-1" })
        .mockResolvedValueOnce({ externalId: "yt-short-2", url: "https://www.youtube.com/watch?v=yt-short-2" });

      const result = await publishVerticalYouTubeShorts({
        workspace,
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        privacyStatus: "unlisted",
        publishYouTubeVideo,
        now: new Date("2026-06-03T12:00:00.000Z")
      });

      expect(publishYouTubeVideo).toHaveBeenCalledTimes(2);
      expect(publishYouTubeVideo).toHaveBeenNthCalledWith(1, expect.objectContaining({
        videoPath: path.join(workspace.root, "shorts/rank-01/clip.mp4"),
        title: "Short 1",
        description: expect.stringContaining("#shorts"),
        hashtags: ["#shorts", "#flowcut"],
        privacyStatus: "unlisted"
      }));
      expect(result.publications).toEqual([
        {
          clipId: "clip-1",
          rank: 1,
          externalId: "yt-short-1",
          url: "https://www.youtube.com/watch?v=yt-short-1",
          status: "published"
        },
        {
          clipId: "clip-2",
          rank: 2,
          externalId: "yt-short-2",
          url: "https://www.youtube.com/watch?v=yt-short-2",
          status: "published"
        }
      ]);
      const ledger = JSON.parse(await readFile(path.join(workspace.root, "vertical-youtube-shorts-publications.json"), "utf8"));
      expect(ledger.publications).toHaveLength(2);
    });
  });

  it("skips clips already published in the project ledger", async () => {
    await withTempDir("flowcut-vertical-shorts-publish-skip-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_vertical");
      await mkdir(path.join(workspace.root, "shorts", "rank-01"), { recursive: true });
      await writeFile(path.join(workspace.root, "shorts", "rank-01", "clip.mp4"), Buffer.from("clip 1"));
      await writeFile(path.join(workspace.root, "shorts", "rank-01", "youtube-shorts-payload.json"), JSON.stringify({
        video: "shorts/rank-01/clip.mp4",
        title: "Short 1",
        description: "Descricao 1",
        hashtags: ["#shorts"],
        privacyStatus: "private"
      }));
      await writeFile(path.join(workspace.root, "vertical-package.json"), JSON.stringify({
        projectId: workspace.projectId,
        taskId: "task-123",
        status: "ready",
        clips: [
          { id: "clip-1", rank: 1, payloads: { youtubeShorts: "shorts/rank-01/youtube-shorts-payload.json" } }
        ],
        warnings: []
      }));
      await writeFile(path.join(workspace.root, "vertical-youtube-shorts-publications.json"), JSON.stringify({
        version: 1,
        publications: [
          {
            clipId: "clip-1",
            rank: 1,
            externalId: "yt-existing",
            url: "https://www.youtube.com/watch?v=yt-existing",
            status: "published",
            createdAt: "2026-06-03T11:00:00.000Z"
          }
        ]
      }));
      const publishYouTubeVideo = vi.fn();

      const result = await publishVerticalYouTubeShorts({
        workspace,
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        publishYouTubeVideo
      });

      expect(publishYouTubeVideo).not.toHaveBeenCalled();
      expect(result.publications).toEqual([]);
      expect(result.skipped).toEqual(["clip-1"]);
    });
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readYoutubePackageSummary } from "./youtube-package-summary";

describe("readYoutubePackageSummary", () => {
  it("returns generated copy and package assets", async () => {
    const root = await makeWorkspace();
    const packageDir = path.join(root, "download", "youtube-package");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "titulo.txt"), "Titulo pronto\n");
    await writeFile(path.join(packageDir, "descricao.txt"), "Descricao pronta\n");
    await writeFile(path.join(packageDir, "transcricao.txt"), "[00:00 - 00:01] Oi\n");
    await writeFile(path.join(packageDir, "prompt-thumbnail.txt"), "VARIACAO 1\nFiz Mesmo Assim\n\nPrompt A\n\n---\n\nVARIACAO 2\nConflito Resultado\n\nPrompt B\n");
    await writeFile(path.join(packageDir, "thumbnail-ref-01.jpg"), "jpg");
    await writeFile(path.join(packageDir, "thumbnail-generated-01.png"), "png");
    await writeFile(path.join(packageDir, "identity-ref-01.mp4"), "mp4");

    await expect(readYoutubePackageSummary(root, "project_abc")).resolves.toEqual({
      status: "ready",
      title: "Titulo pronto",
      description: "Descricao pronta",
      transcriptAvailable: true,
      thumbnailPrompt: "VARIACAO 1\nFiz Mesmo Assim\n\nPrompt A\n\n---\n\nVARIACAO 2\nConflito Resultado\n\nPrompt B",
      thumbnailIdeas: [
        { index: 1, title: "Fiz Mesmo Assim", prompt: "Prompt A" },
        { index: 2, title: "Conflito Resultado", prompt: "Prompt B" }
      ],
      missing: [],
      assets: [
        {
          kind: "identity_clip",
          name: "identity-ref-01.mp4",
          url: "/api/projects/project_abc/youtube-package/assets/identity-ref-01.mp4"
        },
        {
          kind: "generated_thumbnail",
          name: "thumbnail-generated-01.png",
          url: "/api/projects/project_abc/youtube-package/assets/thumbnail-generated-01.png"
        },
        {
          kind: "thumbnail_reference",
          name: "thumbnail-ref-01.jpg",
          url: "/api/projects/project_abc/youtube-package/assets/thumbnail-ref-01.jpg"
        }
      ]
    });
  });

  it("reports missing files without throwing", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "download", "youtube-package"), { recursive: true });

    await expect(readYoutubePackageSummary(root, "project_abc")).resolves.toEqual({
      status: "incomplete",
      title: null,
      description: null,
      transcriptAvailable: false,
      thumbnailPrompt: null,
      thumbnailIdeas: [],
      missing: ["titulo.txt", "descricao.txt", "transcricao.txt", "prompt-thumbnail.txt"],
      assets: []
    });
  });

  it("returns missing when the package directory does not exist", async () => {
    const root = await makeWorkspace();

    await expect(readYoutubePackageSummary(root, "project_abc")).resolves.toEqual({
      status: "missing",
      title: null,
      description: null,
      transcriptAvailable: false,
      thumbnailPrompt: null,
      thumbnailIdeas: [],
      missing: ["titulo.txt", "descricao.txt", "transcricao.txt", "prompt-thumbnail.txt"],
      assets: []
    });
  });
});

async function makeWorkspace() {
  return mkdtemp(path.join(tmpdir(), "youtube-package-summary-"));
}

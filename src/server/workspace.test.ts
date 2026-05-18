import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectWorkspace } from "./workspace";

describe("createProjectWorkspace", () => {
  it("creates predictable artifact directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ai-editor-"));
    try {
      const workspace = await createProjectWorkspace(root, "project_abc");
      await expect(stat(workspace.root)).resolves.toBeTruthy();
      await expect(stat(workspace.uploads)).resolves.toBeTruthy();
      await expect(stat(workspace.analysis)).resolves.toBeTruthy();
      await expect(stat(workspace.renders)).resolves.toBeTruthy();
      await expect(stat(workspace.qa)).resolves.toBeTruthy();
      expect(workspace.planPath).toBe(path.join(workspace.root, "edit-plan.json"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe project IDs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ai-editor-"));
    try {
      await expect(createProjectWorkspace(root, "../outside")).rejects.toThrow("Invalid project ID");
      await expect(createProjectWorkspace(root, "/tmp/project_bad")).rejects.toThrow("Invalid project ID");
      await expect(createProjectWorkspace(root, "project/a")).rejects.toThrow("Invalid project ID");
      await expect(createProjectWorkspace(root, ".")).rejects.toThrow("Invalid project ID");
      await expect(createProjectWorkspace(root, "..")).rejects.toThrow("Invalid project ID");
      await expect(createProjectWorkspace(root, "abc")).rejects.toThrow("Invalid project ID");
      await expect(createProjectWorkspace(root, "")).rejects.toThrow("Invalid project ID");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

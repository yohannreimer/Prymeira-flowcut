import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "./config";

describe("getConfig", () => {
  const originalWorkspace = process.env.AI_EDITOR_WORKSPACE;

  afterEach(() => {
    if (originalWorkspace === undefined) {
      delete process.env.AI_EDITOR_WORKSPACE;
    } else {
      process.env.AI_EDITOR_WORKSPACE = originalWorkspace;
    }
  });

  it("resolves configured workspace roots to absolute paths", () => {
    process.env.AI_EDITOR_WORKSPACE = "relative-workspace";

    expect(getConfig().workspaceRoot).toBe(path.resolve("relative-workspace"));
  });
});

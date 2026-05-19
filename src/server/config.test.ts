import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "./config";

describe("getConfig", () => {
  const originalWorkspace = process.env.AI_EDITOR_WORKSPACE;
  const originalPrymeiraAccountApiUrl = process.env.PRYMEIRA_ACCOUNT_API_URL;
  const originalPrymeiraProductKey = process.env.PRYMEIRA_PRODUCT_KEY;

  afterEach(() => {
    if (originalWorkspace === undefined) {
      delete process.env.AI_EDITOR_WORKSPACE;
    } else {
      process.env.AI_EDITOR_WORKSPACE = originalWorkspace;
    }
    if (originalPrymeiraAccountApiUrl === undefined) {
      delete process.env.PRYMEIRA_ACCOUNT_API_URL;
    } else {
      process.env.PRYMEIRA_ACCOUNT_API_URL = originalPrymeiraAccountApiUrl;
    }
    if (originalPrymeiraProductKey === undefined) {
      delete process.env.PRYMEIRA_PRODUCT_KEY;
    } else {
      process.env.PRYMEIRA_PRODUCT_KEY = originalPrymeiraProductKey;
    }
  });

  it("resolves configured workspace roots to absolute paths", () => {
    process.env.AI_EDITOR_WORKSPACE = "relative-workspace";

    expect(getConfig().workspaceRoot).toBe(path.resolve("relative-workspace"));
  });

  it("defaults Prymeira product key to media", () => {
    delete process.env.PRYMEIRA_PRODUCT_KEY;

    expect(getConfig().prymeiraProductKey).toBe("media");
  });

  it("reads Prymeira Account configuration from env", () => {
    process.env.PRYMEIRA_ACCOUNT_API_URL = "https://account-api.test/";
    process.env.PRYMEIRA_PRODUCT_KEY = "media";

    expect(getConfig()).toMatchObject({
      prymeiraAccountApiUrl: "https://account-api.test",
      prymeiraProductKey: "media"
    });
  });
});

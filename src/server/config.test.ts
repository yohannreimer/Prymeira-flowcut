import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "./config";

describe("getConfig", () => {
  const originalWorkspace = process.env.AI_EDITOR_WORKSPACE;
  const originalPrymeiraAccountApiUrl = process.env.PRYMEIRA_ACCOUNT_API_URL;
  const originalPrymeiraProductKey = process.env.PRYMEIRA_PRODUCT_KEY;
  const originalProjectRetentionMinutes = process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES;

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
    if (originalProjectRetentionMinutes === undefined) {
      delete process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES;
    } else {
      process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES = originalProjectRetentionMinutes;
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

  it("defaults project retention to 30 minutes", () => {
    delete process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES;

    expect(getConfig().projectRetentionMinutes).toBe(30);
  });

  it("reads project retention from env", () => {
    process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES = "15";

    expect(getConfig().projectRetentionMinutes).toBe(15);
  });

  it("rejects invalid project retention values", () => {
    process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES = "0";

    expect(() => getConfig()).toThrow("Invalid AI_EDITOR_PROJECT_RETENTION_MINUTES");
  });
});

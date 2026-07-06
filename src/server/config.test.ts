import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "./config";

describe("getConfig", () => {
  const originalWorkspace = process.env.AI_EDITOR_WORKSPACE;
  const originalPrymeiraAccountApiUrl = process.env.PRYMEIRA_ACCOUNT_API_URL;
  const originalPrymeiraProductKey = process.env.PRYMEIRA_PRODUCT_KEY;
  const originalProjectRetentionMinutes = process.env.AI_EDITOR_PROJECT_RETENTION_MINUTES;
  const originalLocalMode = process.env.FLOWCUT_LOCAL_MODE;
  const originalAllowedOrigins = process.env.FLOWCUT_ALLOWED_ORIGINS;
  const originalPublicAppUrl = process.env.FLOWCUT_PUBLIC_APP_URL;
  const originalJsonBodyLimitBytes = process.env.FLOWCUT_JSON_BODY_LIMIT_BYTES;

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
    if (originalLocalMode === undefined) {
      delete process.env.FLOWCUT_LOCAL_MODE;
    } else {
      process.env.FLOWCUT_LOCAL_MODE = originalLocalMode;
    }
    if (originalAllowedOrigins === undefined) {
      delete process.env.FLOWCUT_ALLOWED_ORIGINS;
    } else {
      process.env.FLOWCUT_ALLOWED_ORIGINS = originalAllowedOrigins;
    }
    if (originalPublicAppUrl === undefined) {
      delete process.env.FLOWCUT_PUBLIC_APP_URL;
    } else {
      process.env.FLOWCUT_PUBLIC_APP_URL = originalPublicAppUrl;
    }
    if (originalJsonBodyLimitBytes === undefined) {
      delete process.env.FLOWCUT_JSON_BODY_LIMIT_BYTES;
    } else {
      process.env.FLOWCUT_JSON_BODY_LIMIT_BYTES = originalJsonBodyLimitBytes;
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

  it("defaults local mode to false", () => {
    delete process.env.FLOWCUT_LOCAL_MODE;

    expect(getConfig().localMode).toBe(false);
  });

  it("enables local mode from FLOWCUT_LOCAL_MODE", () => {
    process.env.FLOWCUT_LOCAL_MODE = "true";

    expect(getConfig().localMode).toBe(true);
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

  it("reads public app URL, allowed origins, and JSON body limit from env", () => {
    process.env.FLOWCUT_PUBLIC_APP_URL = "https://flowcut.prymeiradigital.com.br/";
    process.env.FLOWCUT_ALLOWED_ORIGINS = "https://flowcut.prymeiradigital.com.br, http://localhost:5173";
    process.env.FLOWCUT_JSON_BODY_LIMIT_BYTES = "2048";

    expect(getConfig()).toMatchObject({
      publicAppUrl: "https://flowcut.prymeiradigital.com.br",
      allowedOrigins: ["https://flowcut.prymeiradigital.com.br", "http://localhost:5173"],
      jsonBodyLimitBytes: 2048
    });
  });
});

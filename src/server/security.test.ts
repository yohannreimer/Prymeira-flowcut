import { describe, expect, it } from "vitest";
import {
  buildCorsHeaders,
  getAllowedOrigins,
  isAllowedOrigin,
  sanitizeInternalErrorMessage
} from "./security";

describe("security helpers", () => {
  it("allows only configured production origins by default", () => {
    const origins = getAllowedOrigins({
      NODE_ENV: "production",
      FLOWCUT_PUBLIC_APP_URL: "https://flowcut.prymeiradigital.com.br"
    });

    expect(origins).toEqual(["https://flowcut.prymeiradigital.com.br"]);
    expect(isAllowedOrigin("https://flowcut.prymeiradigital.com.br", origins)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", origins)).toBe(false);
  });

  it("reflects CORS headers only for allowed origins", () => {
    const allowed = ["https://flowcut.prymeiradigital.com.br"];

    expect(buildCorsHeaders("https://flowcut.prymeiradigital.com.br", allowed)).toMatchObject({
      "access-control-allow-origin": "https://flowcut.prymeiradigital.com.br",
      vary: "Origin"
    });
    expect(buildCorsHeaders("https://evil.example", allowed)).not.toHaveProperty(
      "access-control-allow-origin"
    );
  });

  it("does not expose raw internal error messages in production", () => {
    expect(sanitizeInternalErrorMessage(new Error("ffmpeg failed: /tmp/secret/source.mp4"), "production")).toBe(
      "Internal server error"
    );
    expect(sanitizeInternalErrorMessage(new Error("useful dev error"), "development")).toBe("useful dev error");
  });
});

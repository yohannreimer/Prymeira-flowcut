import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("nginx upload proxy config", () => {
  it("streams large API uploads to the backend instead of buffering them in nginx", async () => {
    const config = await readFile(path.resolve("nginx.conf"), "utf8");

    expect(config).toContain("client_max_body_size 5g;");
    expect(config).toContain("client_body_timeout 3600s;");
    expect(config).toContain("proxy_request_buffering off;");
  });
});

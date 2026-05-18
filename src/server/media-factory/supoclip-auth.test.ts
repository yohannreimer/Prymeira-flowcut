import { describe, expect, it } from "vitest";
import { createSupoClipAuthHeaders } from "./supoclip-auth";

describe("createSupoClipAuthHeaders", () => {
  it("creates signed SupoClip auth headers with a deterministic timestamp", () => {
    const headers = createSupoClipAuthHeaders({
      userId: "media-factory",
      secret: "secret",
      timestamp: 1715421600
    });

    expect(headers).toEqual({
      "x-supoclip-user-id": "media-factory",
      "x-supoclip-ts": "1715421600",
      "x-supoclip-signature": "2977f4d3a653c41b641355e2ef3706f20c548cd2e420bea4c22f3fa0eb82783a"
    });
  });

  it("omits timestamp and signature headers when no secret is configured", () => {
    expect(createSupoClipAuthHeaders({ userId: "media-factory" })).toEqual({
      "x-supoclip-user-id": "media-factory"
    });
  });
});

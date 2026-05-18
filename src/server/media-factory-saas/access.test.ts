import { describe, expect, it, vi } from "vitest";
import {
  getBearerToken,
  requireMediaFactoryAccess,
  type MediaFactoryAccessDecision
} from "./access";

describe("getBearerToken", () => {
  it("reads bearer token from an authorization header", () => {
    expect(getBearerToken("Bearer clerk-token-123")).toBe("clerk-token-123");
  });

  it("returns null for missing or non-bearer headers", () => {
    expect(getBearerToken(undefined)).toBeNull();
    expect(getBearerToken("Basic abc")).toBeNull();
    expect(getBearerToken("Bearer ")).toBeNull();
  });
});

describe("requireMediaFactoryAccess", () => {
  it("returns workspace context when Account API allows the mediafactory product", async () => {
    const decision: MediaFactoryAccessDecision = {
      allowed: true,
      product_key: "mediafactory",
      workspace_id: "workspace_123",
      workspace_role: "owner",
      product_role: "admin",
      status: "active",
      plan: "pro",
      source: "manual",
      seats_limit: 3,
      limits: { max_upload_bytes: 1000 },
      reason: "active_entitlement"
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(decision), { status: 200 }));

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).resolves.toMatchObject({
      token: "clerk-token-123",
      workspaceId: "workspace_123",
      productRole: "admin",
      limits: { max_upload_bytes: 1000 }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://account-api.test/access-check?product_key=mediafactory",
      { headers: { Authorization: "Bearer clerk-token-123" } }
    );
  });

  it("throws 401 when the bearer token is missing", async () => {
    await expect(
      requireMediaFactoryAccess({
        authorization: undefined,
        accountApiUrl: "https://account-api.test"
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "missing_auth_token"
    });
  });

  it("throws 403 when Account API denies access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        allowed: false,
        product_key: "mediafactory",
        status: "locked",
        reason: "no_entitlement"
      }), { status: 200 })
    );

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "product_access_denied"
    });
  });

  it("throws 403 when access is allowed but workspace_id is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        allowed: true,
        product_key: "mediafactory",
        status: "active",
        reason: "active_entitlement"
      }), { status: 200 })
    );

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "missing_workspace"
    });
  });

  it("throws 502 when Account API returns malformed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });

  it("throws 502 when Account API returns an invalid response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        allowed: true,
        product_key: "mediafactory",
        workspace_id: 123,
        status: "active",
        reason: "active_entitlement"
      }), { status: 200 })
    );

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });

  it("throws 502 when Account API request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });

  it("throws 502 when Account API allows a different product", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        allowed: true,
        product_key: "other-product",
        workspace_id: "workspace_123",
        status: "active",
        reason: "active_entitlement"
      }), { status: 200 })
    );

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });

  it("throws 502 when Account API denies a different product", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        allowed: false,
        product_key: "other-product",
        status: "locked",
        reason: "no_entitlement"
      }), { status: 200 })
    );

    await expect(
      requireMediaFactoryAccess({
        authorization: "Bearer clerk-token-123",
        accountApiUrl: "https://account-api.test",
        fetch: fetchMock
      })
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });
});

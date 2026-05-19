import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createPrymeiraTenantAccess,
  getBearerToken,
  getTenantProjectRoot,
  PrymeiraTenantError
} from "./tenant";

describe("getBearerToken", () => {
  it("extracts bearer tokens case-insensitively", () => {
    expect(getBearerToken("Bearer clerk-token")).toBe("clerk-token");
    expect(getBearerToken("bearer clerk-token")).toBe("clerk-token");
  });

  it("returns null for missing or non-bearer authorization", () => {
    expect(getBearerToken(undefined)).toBeNull();
    expect(getBearerToken("Basic clerk-token")).toBeNull();
  });
});

describe("getTenantProjectRoot", () => {
  it("returns the workspace projects root", () => {
    expect(getTenantProjectRoot("/tmp/root", "workspace_123")).toBe(
      path.join("/tmp/root", "workspaces", "workspace_123", "projects")
    );
  });
});

describe("createPrymeiraTenantAccess", () => {
  it("requires media product access and resolves tenant context", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          allowed: true,
          workspace_id: "workspace_123",
          workspace_role: "owner",
          product_key: "media",
          product_role: "admin",
          status: "active",
          plan: "pro",
          limits: { projects: 25 },
          reason: "active_entitlement"
        })
      )
    );
    const requireTenantAccess = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: fetchMock
    });

    await expect(requireTenantAccess("Bearer clerk-token")).resolves.toEqual({
      token: "clerk-token",
      workspaceId: "workspace_123",
      workspaceRole: "owner",
      productKey: "media",
      productRole: "admin",
      plan: "pro",
      limits: { projects: 25 }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://account-api.test/access-check?product_key=media", {
      headers: { Authorization: "Bearer clerk-token" }
    });
  });

  it("maps missing token to tenant error", async () => {
    const fetchMock = vi.fn();
    const requireTenantAccess = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: fetchMock
    });

    await expect(requireTenantAccess(undefined)).rejects.toMatchObject({
      statusCode: 401,
      code: "missing_auth_token"
    });
    await expect(requireTenantAccess(undefined)).rejects.toBeInstanceOf(PrymeiraTenantError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps denied access to tenant error", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          allowed: false,
          product_key: "media",
          status: "locked",
          reason: "no_entitlement"
        })
      )
    );
    const requireTenantAccess = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: fetchMock
    });

    await expect(requireTenantAccess("Bearer clerk-token")).rejects.toMatchObject({
      statusCode: 403,
      code: "product_access_denied"
    });
  });

  it("maps account API failures to tenant error", async () => {
    const fetchMock = vi.fn(async () => new Response("Unavailable", { status: 503 }));
    const requireTenantAccess = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: fetchMock
    });

    await expect(requireTenantAccess("Bearer clerk-token")).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });
});

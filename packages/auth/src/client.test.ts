import { describe, expect, it, vi } from "vitest";
import { createPrymeiraAuthClient } from "./client.js";
import { MissingAuthTokenError, ProductAccessDeniedError } from "./errors.js";
import { checkPlanLimit, requireAuth, requireProductAccess } from "./server.js";
import type { AccessDecision } from "./types.js";

describe("createPrymeiraAuthClient", () => {
  it("calls access-check with bearer token", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          allowed: true,
          workspace_id: "workspace_123",
          workspace_role: "owner",
          product_key: "operis",
          product_role: "owner",
          status: "active",
          seats_limit: 3,
          reason: "active_entitlement"
        })
      )
    );

    const client = createPrymeiraAuthClient({
      accountApiUrl: "https://account-api.test",
      fetch: fetchMock
    });

    const result = await client.checkProductAccess("operis", "token_123");

    expect(result.allowed).toBe(true);
    expect(result).toMatchObject({
      workspace_id: "workspace_123",
      workspace_role: "owner",
      product_role: "owner",
      seats_limit: 3
    });
    expect(fetchMock).toHaveBeenCalledWith("https://account-api.test/access-check?product_key=operis", {
      headers: { Authorization: "Bearer token_123" }
    });
  });

  it("reads current customer products with workspace context", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          customer: {
            id: "customer_123",
            email: "user@example.com",
            name: "User"
          },
          workspace: {
            id: "workspace_123",
            name: "User",
            type: "individual",
            role: "owner"
          },
          products: [
            {
              product_key: "operis",
              name: "Operis",
              description: null,
              app_url: "https://operis.example",
              marketing_url: null,
              status: "active",
              plan: "pro",
              source: "admin",
              seats_limit: 3,
              workspace_id: "workspace_123",
              workspace_role: "owner",
              product_role: "owner",
              allowed: true,
              reason: "active_entitlement"
            }
          ]
        })
      )
    );

    const client = createPrymeiraAuthClient({
      accountApiUrl: "https://account-api.test",
      fetch: fetchMock
    });

    const result = await client.getCurrentCustomer("token_123");

    expect(result.workspace).toMatchObject({
      id: "workspace_123",
      role: "owner"
    });
    expect(result.products[0]).toMatchObject({
      product_key: "operis",
      workspace_id: "workspace_123",
      product_role: "owner",
      seats_limit: 3
    });
    expect(fetchMock).toHaveBeenCalledWith("https://account-api.test/me/products", {
      headers: { Authorization: "Bearer token_123" }
    });
  });

  it("throws ProductAccessDeniedError from requireProductAccess when denied", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ allowed: false, product_key: "operis", status: "locked", reason: "no_entitlement" }))
    );

    const client = createPrymeiraAuthClient({
      accountApiUrl: "https://account-api.test",
      fetch: fetchMock
    });

    await expect(client.requireProductAccess("operis", "token_123")).rejects.toBeInstanceOf(ProductAccessDeniedError);
  });

  it("allows destructured requireProductAccess to work", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ allowed: true, product_key: "operis", status: "active", reason: "active_entitlement" }))
    );

    const { requireProductAccess } = createPrymeiraAuthClient({
      accountApiUrl: "https://account-api.test",
      fetch: fetchMock
    });

    const result = await requireProductAccess("operis", "token_123");

    expect(result.allowed).toBe(true);
  });
});

describe("server helpers", () => {
  const deniedDecision: AccessDecision = {
    allowed: false,
    product_key: "operis",
    reason: "no_product_seat",
    status: "locked",
    upgrade_url: "https://account.test/upgrade"
  };

  it("checkPlanLimit returns false when access is denied", () => {
    expect(checkPlanLimit({ ...deniedDecision, limits: { projects: 10 } }, "projects", 1)).toBe(false);
  });

  it("throws MissingAuthTokenError when auth token is missing", async () => {
    await expect(requireAuth({ getToken: () => null })).rejects.toBeInstanceOf(MissingAuthTokenError);
  });

  it("invokes void redirects but still rejects with ProductAccessDeniedError", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(deniedDecision)));
    const redirect = vi.fn(() => undefined);

    await expect(
      requireProductAccess(
        "operis",
        {
          getToken: () => "token_123",
          redirect
        },
        {
          accountApiUrl: "https://account-api.test",
          fetch: fetchMock
        }
      )
    ).rejects.toBeInstanceOf(ProductAccessDeniedError);

    expect(redirect).toHaveBeenCalledWith("https://account.test/upgrade");
  });
});

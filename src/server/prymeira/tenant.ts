import path from "node:path";
import { createPrymeiraAuthClient, ProductAccessDeniedError, type AccessDecision } from "@prymeira/auth";
import { sanitizeObjectKeyPart } from "../media-factory-saas/storage-keys";

export type PrymeiraTenantContext = {
  token: string;
  workspaceId: string;
  workspaceRole: string | null;
  productKey: string;
  productRole: string | null;
  plan: string | null;
  limits: Record<string, unknown>;
};

export class PrymeiraTenantError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PrymeiraTenantError";
  }
}

export function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export function getTenantProjectRoot(workspaceRoot: string, workspaceId: string): string {
  return path.join(workspaceRoot, "workspaces", sanitizeObjectKeyPart(workspaceId, "workspace"), "projects");
}

function accountApiError(message: string, cause?: unknown): PrymeiraTenantError {
  return new PrymeiraTenantError(502, "account_api_error", message, { cause });
}

function requireWorkspaceId(decision: AccessDecision): string {
  if (!decision.workspace_id) {
    throw accountApiError("Prymeira Account API returned access without workspace.");
  }

  return decision.workspace_id;
}

function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

function createDemoTenantContext(token: string, productKey: string): PrymeiraTenantContext {
  return {
    token,
    workspaceId: process.env.DEMO_WORKSPACE_ID ?? "demo_workspace",
    workspaceRole: "owner",
    productKey,
    productRole: "owner",
    plan: "suite",
    limits: {}
  };
}

export function createPrymeiraTenantAccess({
  accountApiUrl,
  productKey,
  fetch: fetchImpl
}: {
  accountApiUrl: string;
  productKey: string;
  fetch?: typeof fetch;
}) {
  const client = createPrymeiraAuthClient({
    accountApiUrl,
    fetch: fetchImpl
  });

  return async function requireTenantAccess(authorization: string | undefined): Promise<PrymeiraTenantContext> {
    const token = getBearerToken(authorization);
    if (!token) {
      throw new PrymeiraTenantError(401, "missing_auth_token", "Missing Clerk bearer token.");
    }

    if (isDemoMode()) {
      if (token !== "demo-token") {
        throw new PrymeiraTenantError(401, "missing_auth_token", "Missing demo bearer token.");
      }

      return createDemoTenantContext(token, productKey);
    }

    let decision: AccessDecision;
    try {
      decision = await client.requireProductAccess(productKey, token);
    } catch (error) {
      if (error instanceof ProductAccessDeniedError) {
        throw new PrymeiraTenantError(
          403,
          "product_access_denied",
          `Access denied for ${productKey}: ${error.decision.reason}.`,
          { cause: error }
        );
      }

      throw accountApiError("Prymeira Account API request failed.", error);
    }

    if (decision.product_key !== productKey) {
      throw accountApiError(`Prymeira Account API returned access for ${decision.product_key}.`);
    }

    return {
      token,
      workspaceId: requireWorkspaceId(decision),
      workspaceRole: decision.workspace_role ?? null,
      productKey: decision.product_key,
      productRole: decision.product_role ?? null,
      plan: decision.plan ?? null,
      limits: decision.limits ?? {}
    };
  };
}

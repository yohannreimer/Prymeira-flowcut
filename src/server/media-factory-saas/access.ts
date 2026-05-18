import { z } from "zod";

export const MEDIA_FACTORY_PRODUCT_KEY = "mediafactory";

const mediaFactoryAccessDecisionSchema = z.object({
  allowed: z.boolean(),
  product_key: z.string(),
  workspace_id: z.string().optional(),
  workspace_role: z.string().optional(),
  product_role: z.string().optional(),
  status: z.string(),
  plan: z.string().optional(),
  source: z.string().optional(),
  seats_limit: z.number().optional(),
  limits: z.record(z.unknown()).optional(),
  reason: z.string(),
  upgrade_url: z.string().optional()
}).passthrough();

export type MediaFactoryAccessDecision = z.infer<typeof mediaFactoryAccessDecisionSchema>;

export type MediaFactoryAccessContext = {
  token: string;
  workspaceId: string;
  workspaceRole: string | null;
  productRole: string | null;
  plan: string | null;
  limits: Record<string, unknown>;
  decision: MediaFactoryAccessDecision;
};

export class MediaFactoryAccessError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "MediaFactoryAccessError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function accountApiError(message: string): MediaFactoryAccessError {
  return new MediaFactoryAccessError(502, "account_api_error", message);
}

export async function requireMediaFactoryAccess({
  authorization,
  accountApiUrl,
  fetch: fetchImpl = fetch
}: {
  authorization: string | undefined;
  accountApiUrl: string;
  fetch?: typeof fetch;
}): Promise<MediaFactoryAccessContext> {
  const token = getBearerToken(authorization);
  if (!token) {
    throw new MediaFactoryAccessError(401, "missing_auth_token", "Missing Clerk bearer token.");
  }

  const baseUrl = accountApiUrl.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetchImpl(
      `${baseUrl}/access-check?product_key=${encodeURIComponent(MEDIA_FACTORY_PRODUCT_KEY)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    throw accountApiError("Prymeira Account API request failed.");
  }

  if (!response.ok) {
    throw accountApiError(`Prymeira Account API returned ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw accountApiError("Prymeira Account API returned invalid JSON.");
  }

  const parsedDecision = mediaFactoryAccessDecisionSchema.safeParse(payload);
  if (!parsedDecision.success) {
    throw accountApiError("Prymeira Account API returned an invalid access decision.");
  }

  const decision = parsedDecision.data;
  if (decision.product_key !== MEDIA_FACTORY_PRODUCT_KEY) {
    throw accountApiError(`Prymeira Account API returned access for ${decision.product_key}.`);
  }

  if (!decision.allowed) {
    throw new MediaFactoryAccessError(
      403,
      "product_access_denied",
      `Access denied for ${MEDIA_FACTORY_PRODUCT_KEY}: ${decision.reason}.`
    );
  }

  if (!decision.workspace_id) {
    throw new MediaFactoryAccessError(
      403,
      "missing_workspace",
      "MediaFactory access requires an active Prymeira workspace."
    );
  }

  return {
    token,
    workspaceId: decision.workspace_id,
    workspaceRole: decision.workspace_role ?? null,
    productRole: decision.product_role ?? null,
    plan: decision.plan ?? null,
    limits: decision.limits ?? {},
    decision
  };
}

import { createPrymeiraAuthClient } from "./client.js";
import { MissingAuthTokenError, ProductAccessDeniedError } from "./errors.js";
import type { AccessDecision, PrymeiraAuthClientOptions, PrymeiraAuthContext } from "./types.js";

export async function requireAuth(context: PrymeiraAuthContext): Promise<string> {
  const token = await context.getToken();

  if (!token) {
    throw new MissingAuthTokenError();
  }

  return token;
}

export async function requireProductAccess(
  productKey: string,
  context: PrymeiraAuthContext,
  options: PrymeiraAuthClientOptions
) {
  const token = await requireAuth(context);
  const client = createPrymeiraAuthClient(options);

  try {
    return await client.requireProductAccess(productKey, token);
  } catch (error) {
    if (error instanceof ProductAccessDeniedError && context.redirect) {
      const target = error.decision.upgrade_url ?? options.upgradeUrl;
      if (target) {
        const redirectResult = context.redirect(target);
        if (redirectResult !== undefined) {
          return redirectResult;
        }
      }
    }

    throw error;
  }
}

export async function getCurrentCustomer(context: PrymeiraAuthContext, options: PrymeiraAuthClientOptions) {
  const token = await requireAuth(context);
  return createPrymeiraAuthClient(options).getCurrentCustomer(token);
}

export function checkPlanLimit(decision: AccessDecision, limitKey: string, requestedAmount: number): boolean {
  if (!decision.allowed) {
    return false;
  }

  const value = decision.limits?.[limitKey];

  if (typeof value !== "number") {
    return true;
  }

  return requestedAmount <= value;
}

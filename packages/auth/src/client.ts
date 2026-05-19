import { ProductAccessDeniedError } from "./errors.js";
import type { AccessDecision, CurrentCustomerResponse, PrymeiraAuthClientOptions } from "./types.js";

export function createPrymeiraAuthClient(options: PrymeiraAuthClientOptions) {
  const fetcher = options.fetch ?? fetch;
  const baseUrl = options.accountApiUrl.replace(/\/$/, "");

  async function getJson<T>(path: string, token: string): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Prymeira Account API request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  function checkProductAccess(productKey: string, token: string) {
    return getJson<AccessDecision>(`/access-check?product_key=${encodeURIComponent(productKey)}`, token);
  }

  async function requireProductAccess(productKey: string, token: string) {
    const decision = await checkProductAccess(productKey, token);

    if (!decision.allowed) {
      throw new ProductAccessDeniedError(decision);
    }

    return decision;
  }

  function getCurrentCustomer(token: string) {
    return getJson<CurrentCustomerResponse>("/me/products", token);
  }

  return {
    checkProductAccess,
    requireProductAccess,
    getCurrentCustomer
  };
}

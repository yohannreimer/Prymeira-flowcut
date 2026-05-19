export type AccessReason =
  | "no_customer"
  | "no_workspace"
  | "no_workspace_membership"
  | "workspace_suspended"
  | "no_product"
  | "inactive_product"
  | "no_entitlement"
  | "no_product_seat"
  | "seats_limit_reached"
  | "expired"
  | "blocked"
  | "cancelled"
  | "trial_expired"
  | "active_entitlement"
  | "internal_access";

export type AccountWorkspace = {
  id: string;
  name: string;
  type: string;
  role: string;
};

export type AccessDecision = {
  allowed: boolean;
  workspace_id?: string;
  workspace_role?: string;
  product_key: string;
  product_role?: string;
  status: string;
  plan?: string;
  source?: string;
  seats_limit?: number;
  limits?: Record<string, unknown>;
  reason: AccessReason;
  upgrade_url?: string;
};

export type CurrentCustomerResponse = {
  customer: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  workspace: AccountWorkspace | null;
  products: Array<{
    product_key: string;
    name: string;
    description: string | null;
    app_url: string;
    marketing_url: string | null;
    status: string;
    plan?: string;
    source?: string;
    limits?: Record<string, unknown>;
    seats_limit?: number;
    workspace_id?: string;
    workspace_role?: string;
    product_role?: string;
    allowed: boolean;
    reason: AccessReason;
    upgrade_url?: string;
  }>;
};

export type PrymeiraAuthClientOptions = {
  accountApiUrl: string;
  fetch?: typeof fetch;
  upgradeUrl?: string;
};

export type PrymeiraAuthContext = {
  getToken: () => Promise<string | null> | string | null;
  redirect?: (url: string) => never | Response | void;
};

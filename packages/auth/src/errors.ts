import type { AccessDecision } from "./types.js";

export class PrymeiraAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrymeiraAuthError";
  }
}

export class MissingAuthTokenError extends PrymeiraAuthError {
  constructor() {
    super("Authentication token is required.");
    this.name = "MissingAuthTokenError";
  }
}

export class ProductAccessDeniedError extends PrymeiraAuthError {
  constructor(public readonly decision: AccessDecision) {
    super(`Access denied for product ${decision.product_key}: ${decision.reason}`);
    this.name = "ProductAccessDeniedError";
  }
}

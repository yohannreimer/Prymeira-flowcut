import { describe, expect, it } from "vitest";
import { createPrymeiraTenantAccess } from "./tenant";

describe("Flowcut demo tenant access", () => {
  it("returns demo tenant context when demo mode is enabled", async () => {
    const previousDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";

    try {
      const requireTenantAccess = createPrymeiraTenantAccess({
        accountApiUrl: "http://localhost:3001",
        productKey: "media"
      });

      await expect(requireTenantAccess("Bearer demo-token")).resolves.toMatchObject({
        token: "demo-token",
        workspaceId: "demo_workspace",
        workspaceRole: "owner",
        productKey: "media",
        plan: "suite"
      });
    } finally {
      if (previousDemoMode === undefined) {
        delete process.env.DEMO_MODE;
      } else {
        process.env.DEMO_MODE = previousDemoMode;
      }
    }
  });
});

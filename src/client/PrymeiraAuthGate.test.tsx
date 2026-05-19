// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureApiAuth } from "./api";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";

vi.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ClerkLoading: () => <div>Carregando acesso...</div>,
  SignedIn: ({ children }: { children: ReactNode }) => <div data-testid="signed-in">{children}</div>,
  SignedOut: ({ children }: { children: ReactNode }) => <div data-testid="signed-out">{children}</div>,
  SignIn: () => <div>Entrar na Prymeira</div>,
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("clerk-token-123") })
}));

afterEach(() => {
  configureApiAuth(null);
});

describe("PrymeiraAuthGate", () => {
  it("renders a config error when Clerk publishable key is missing", () => {
    render(<PrymeiraAuthGate publishableKey={undefined}><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Configuração Clerk ausente.")).toBeInTheDocument();
  });

  it("renders Clerk sign-in and the signed-in app shell when configured", () => {
    render(<PrymeiraAuthGate publishableKey="pk_test_123"><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Entrar na Prymeira")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });
});

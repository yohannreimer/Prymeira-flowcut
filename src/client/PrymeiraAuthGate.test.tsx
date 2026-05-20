// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApiAuth } from "./api";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";

const clerkMock = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  isLoaded: true
}));

vi.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ClerkLoading: () => <div>Carregando acesso...</div>,
  SignedIn: ({ children }: { children: ReactNode }) => <div data-testid="signed-in">{children}</div>,
  SignedOut: ({ children }: { children: ReactNode }) => <div data-testid="signed-out">{children}</div>,
  SignIn: () => <div>Entrar na Prymeira</div>,
  useAuth: () => ({ getToken: clerkMock.getToken, isLoaded: clerkMock.isLoaded })
}));

afterEach(() => {
  cleanup();
  configureApiAuth(null);
  clerkMock.getToken.mockReset();
  clerkMock.getToken.mockResolvedValue("clerk-token-123");
  clerkMock.isLoaded = true;
});

describe("PrymeiraAuthGate", () => {
  beforeEach(() => {
    clerkMock.getToken.mockResolvedValue("clerk-token-123");
    clerkMock.isLoaded = true;
  });

  it("renders a config error when Clerk publishable key is missing", () => {
    render(<PrymeiraAuthGate publishableKey={undefined}><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Configuração Clerk ausente.")).toBeInTheDocument();
  });

  it("renders Clerk sign-in and the signed-in app shell when configured", async () => {
    render(<PrymeiraAuthGate publishableKey="pk_test_123"><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Entrar na Prymeira")).toBeInTheDocument();
    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });

  it("does not mount the app shell before the Clerk API token is ready", async () => {
    let resolveToken: (token: string) => void = () => undefined;
    clerkMock.getToken.mockReturnValue(new Promise((resolve) => {
      resolveToken = resolve;
    }));

    render(<PrymeiraAuthGate publishableKey="pk_test_123"><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Validando acesso...")).toBeInTheDocument();
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();

    resolveToken("clerk-token-123");

    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });
});

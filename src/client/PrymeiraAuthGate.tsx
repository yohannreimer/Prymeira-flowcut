import { useEffect, type ReactNode } from "react";
import {
  ClerkLoading,
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  useAuth
} from "@clerk/clerk-react";
import { configureApiAuth } from "./api";

function ApiAuthBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    configureApiAuth(() => getToken());
    return () => configureApiAuth(null);
  }, [getToken]);

  return <>{children}</>;
}

export function PrymeiraAuthGate({
  publishableKey,
  children
}: {
  publishableKey: string | undefined;
  children: ReactNode;
}) {
  if (!publishableKey) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__panel" aria-labelledby="auth-gate-title">
          <span className="auth-gate__eyebrow">Prymeira Media</span>
          <h1 id="auth-gate-title">Configuração Clerk ausente.</h1>
          <p>Defina VITE_CLERK_PUBLISHABLE_KEY para entrar no produto Media.</p>
        </section>
      </main>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkLoading>
        <main className="auth-gate">Carregando acesso...</main>
      </ClerkLoading>
      <SignedOut>
        <main className="auth-gate">
          <SignIn routing="hash" />
        </main>
      </SignedOut>
      <SignedIn>
        <ApiAuthBridge>{children}</ApiAuthBridge>
      </SignedIn>
    </ClerkProvider>
  );
}

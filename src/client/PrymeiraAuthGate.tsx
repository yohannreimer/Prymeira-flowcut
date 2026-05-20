import { useEffect, useState, type ReactNode } from "react";
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
  const { getToken, isLoaded } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isStale = false;
    setIsReady(false);

    if (!isLoaded) {
      configureApiAuth(null);
      return () => configureApiAuth(null);
    }

    void getToken()
      .then((token) => {
        if (isStale) return;
        if (!token) {
          configureApiAuth(null);
          return;
        }
        configureApiAuth(() => getToken());
        setIsReady(true);
      })
      .catch(() => {
        if (!isStale) configureApiAuth(null);
      });

    return () => {
      isStale = true;
      configureApiAuth(null);
    };
  }, [getToken, isLoaded]);

  if (!isLoaded || !isReady) {
    return <main className="auth-gate">Validando acesso...</main>;
  }

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
          <span className="auth-gate__eyebrow">Prymeira Flowcut</span>
          <h1 id="auth-gate-title">Configuração Clerk ausente.</h1>
          <p>Defina VITE_CLERK_PUBLISHABLE_KEY para entrar no Flowcut.</p>
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

import { useEffect, useState, type ReactNode } from "react";
import {
  ClerkLoading,
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  useAuth
} from "@clerk/clerk-react";
import { ptBR } from "@clerk/localizations";
import { configureApiAuth } from "./api";

function isDemoModeEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_DEMO_MODE === "true";
}

// ── Timeline clip decoration — film/edit motif ───────────────────────────────
const TIMELINE_ROWS: Array<Array<{ w: number; gap: number; gold?: boolean }>> = [
  [
    { w: 18, gap: 4 },
    { w: 36, gap: 4, gold: true },
    { w: 14, gap: 4 },
    { w: 50, gap: 4 },
    { w: 22, gap: 4 },
    { w: 28, gap: 0 },
  ],
  [
    { w: 30, gap: 4 },
    { w: 20, gap: 4, gold: true },
    { w: 44, gap: 4 },
    { w: 16, gap: 4 },
    { w: 36, gap: 0 },
  ],
  [
    { w: 48, gap: 4 },
    { w: 16, gap: 4 },
    { w: 28, gap: 4, gold: true },
    { w: 20, gap: 4 },
    { w: 34, gap: 0 },
  ],
];

function TimelineDecoration() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        left: 0,
        right: 0,
        padding: "0 48px",
        display: "grid",
        gap: 5,
        pointerEvents: "none",
      }}
    >
      {TIMELINE_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", alignItems: "center", height: 7 }}>
          <div
            style={{
              width: 3,
              height: "100%",
              borderRadius: 2,
              background: "rgba(252,192,9,0.2)",
              marginRight: 6,
              flexShrink: 0,
            }}
          />
          {row.map((clip, ci) => (
            <div
              key={ci}
              style={{
                width: clip.w,
                height: "100%",
                borderRadius: 2,
                background: clip.gold
                  ? "rgba(252,192,9,0.8)"
                  : "rgba(246,242,232,0.14)",
                marginRight: clip.gap,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ))}
      {/* Playhead */}
      <div
        style={{
          position: "absolute",
          top: -4,
          left: "calc(48px + 9px + 34px)",
          width: 1,
          height: "calc(100% + 8px)",
          background: "#fcc009",
        }}
      />
    </div>
  );
}

// ── Auth bridge (post sign-in) ────────────────────────────────────────────────

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

function LocalAuthBypass({ children }: { children: ReactNode }) {
  useEffect(() => {
    configureApiAuth(() => Promise.resolve("demo-token"));
    return () => configureApiAuth(null);
  }, []);

  return <>{children}</>;
}

// ── Login layout ─────────────────────────────────────────────────────────────

function FlowcutLoginLayout() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "#0a0a09",
        fontFamily:
          '"Area Normal", "Aptos", "SF Pro Display", "Segoe UI Variable", system-ui, sans-serif',
      }}
    >
      {/* ── Left: brand panel ── */}
      <div
        style={{
          width: "min(52%, 580px)",
          flexShrink: 0,
          background:
            "linear-gradient(155deg, #0d0c0a 0%, #131109 40%, #1b1710 100%)",
          padding: "48px 52px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Warm ambient glow */}
        <div
          style={{
            position: "absolute",
            top: -100,
            left: -80,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(252,192,9,0.06) 0%, transparent 68%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 80,
            right: -60,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(252,192,9,0.04) 0%, transparent 68%)",
            pointerEvents: "none",
          }}
        />

        {/* Prymeira wordmark */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.6s ease",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase" as const,
              color: "rgba(252,192,9,0.45)",
            }}
          >
            by Prymeira
          </span>
        </div>

        {/* App identity — animated in */}
        <div
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s",
          }}
        >
          {/* Logo mark + name */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                background: "#fcc009",
                borderRadius: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow:
                  "0 8px 28px rgba(252,192,9,0.32), 0 2px 8px rgba(252,192,9,0.18)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                <circle cx="5" cy="5.5" r="2.5" stroke="#171716" strokeWidth="1.7" />
                <circle cx="5" cy="14.5" r="2.5" stroke="#171716" strokeWidth="1.7" />
                <line
                  x1="7.1" y1="6.6" x2="16" y2="10"
                  stroke="#171716" strokeWidth="1.7" strokeLinecap="round"
                />
                <line
                  x1="7.1" y1="13.4" x2="16" y2="10"
                  stroke="#171716" strokeWidth="1.7" strokeLinecap="round"
                />
              </svg>
            </div>
            <span
              style={{
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "#f6f2e8",
                lineHeight: 1,
              }}
            >
              Flowcut
            </span>
          </div>

          {/* Headline */}
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "clamp(26px, 3vw, 40px)",
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#f6f2e8",
              maxWidth: "11em",
            }}
          >
            Da gravação ao{" "}
            <span style={{ color: "#fcc009" }}>clipe publicado.</span>
          </p>

          <p
            style={{
              margin: "0 0 36px",
              fontSize: 15,
              fontWeight: 450,
              lineHeight: 1.65,
              color: "#6a6460",
              maxWidth: "30ch",
            }}
          >
            Transcrição, corte inteligente, legendas e publicação — tudo numa
            plataforma só.
          </p>

          {/* Feature chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap" as const,
              gap: 7,
            }}
          >
            {[
              "Transcrição automática",
              "Corte com IA",
              "Legendas",
              "YouTube",
            ].map((f) => (
              <span
                key={f}
                style={{
                  border: "1px solid rgba(246,242,232,0.09)",
                  borderRadius: 999,
                  padding: "6px 13px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(246,242,232,0.38)",
                  letterSpacing: "0.01em",
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div />

        {/* Timeline decoration */}
        <TimelineDecoration />

        {/* Bottom gradient over timeline */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 48,
            background: "linear-gradient(to top, #0d0c0a, transparent)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* ── Right: Clerk auth panel ── */}
      <style>{`
        .fc-clerk-root .cl-card,
        .fc-clerk-root .cl-card * {
          background: transparent !important;
          box-shadow: none !important;
          border: none !important;
        }
        .fc-clerk-root .cl-formFieldInput {
          background: #1a1a18 !important;
          border: 1px solid #2a2a28 !important;
          color: #f6f2e8 !important;
          border-radius: 10px !important;
        }
        .fc-clerk-root .cl-formFieldInput:focus {
          border-color: #fcc009 !important;
          box-shadow: 0 0 0 2px rgba(252,192,9,0.15) !important;
        }
        .fc-clerk-root .cl-formButtonPrimary {
          background: #fcc009 !important;
          color: #171716 !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 16px rgba(252,192,9,0.22) !important;
        }
        .fc-clerk-root .cl-formButtonPrimary:hover {
          background: #e8b008 !important;
        }
        .fc-clerk-root .cl-socialButtonsBlockButton {
          background: #1a1a18 !important;
          border: 1px solid #2a2a28 !important;
          color: #f6f2e8 !important;
          border-radius: 10px !important;
        }
        .fc-clerk-root .cl-socialButtonsBlockButton:hover {
          background: #252523 !important;
          border-color: #3a3a38 !important;
        }
        .fc-clerk-root .cl-dividerLine { background: #252523 !important; }
        .fc-clerk-root .cl-dividerText { color: #5a5652 !important; }
        .fc-clerk-root .cl-footerActionLink { color: #fcc009 !important; }
        .fc-clerk-root .cl-footer,
        .fc-clerk-root .cl-footerAction,
        .fc-clerk-root .cl-internal-b3fm6y { background: transparent !important; }
      `}</style>
      <div
        style={{
          flex: 1,
          background: "#0f0f0d",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 52px",
          borderLeft: "1px solid rgba(246,242,232,0.05)",
        }}
      >
        <div
          className="fc-clerk-root"
          style={{
            width: "100%",
            maxWidth: 420,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.6s ease 0.18s, transform 0.6s ease 0.18s",
          }}
        >
          <ClerkLoading>
            <div style={{ display: "grid", gap: 14, padding: "24px 0" }}>
              {[100, 78, 100, 100, 52].map((w, i) => (
                <div
                  key={i}
                  style={{
                    height: i === 4 ? 46 : 14,
                    width: `${w}%`,
                    borderRadius: 8,
                    background: "#1a1a18",
                    opacity: 0.55,
                  }}
                />
              ))}
            </div>
          </ClerkLoading>
          <SignedOut>
            {/* Custom heading — replaces Clerk's default "Bem-vindo de volta" */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                color: "#f6f2e8",
              }}>Acesse sua conta</h2>
              <p style={{
                margin: "6px 0 0",
                fontSize: 14,
                color: "#6a6460",
                lineHeight: 1.5,
              }}>Bem-vindo de volta ao Flowcut</p>
            </div>
            <SignIn
              routing="hash"
              appearance={{
                variables: {
                  colorPrimary: "#fcc009",
                  colorBackground: "#0f0f0d",
                  colorInputBackground: "#1a1a18",
                  colorInputText: "#f6f2e8",
                  colorText: "#f6f2e8",
                  colorTextSecondary: "#9e9589",
                  colorNeutral: "#6a6460",
                  borderRadius: "10px",
                  fontFamily:
                    '"Area Normal", "Aptos", "SF Pro Display", system-ui, sans-serif',
                  fontSize: "14px",
                },
                elements: {
                  rootBox: { width: "100%" },
                  card: {
                    background: "transparent",
                    boxShadow: "none",
                    border: "none",
                    padding: 0,
                  },
                  header: { display: "none" },
                  formButtonPrimary: { padding: "13px 20px", height: "46px", fontSize: "14px" },
                  socialButtonsBlockButton: { padding: "12px 20px", height: "44px", gap: "10px" },
                  socialButtonsBlockButtonText: { fontSize: "14px", fontWeight: "500" },
                  formFieldInput: { height: "42px", padding: "0 14px" },
                  footer: { background: "transparent" },
                  footerAction: { background: "transparent" },
                },
              }}
            />
          </SignedOut>
        </div>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export function PrymeiraAuthGate({
  publishableKey,
  children,
  allowLocalAuthBypass = false,
}: {
  publishableKey: string | undefined;
  children: ReactNode;
  allowLocalAuthBypass?: boolean;
}) {
  if (isDemoModeEnabled()) {
    return <LocalAuthBypass>{children}</LocalAuthBypass>;
  }

  if (!publishableKey && allowLocalAuthBypass) {
    return <LocalAuthBypass>{children}</LocalAuthBypass>;
  }

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
    <ClerkProvider publishableKey={publishableKey} localization={ptBR}>
      {/* Login page — shown only when signed out */}
      <SignedOut>
        <FlowcutLoginLayout />
      </SignedOut>

      {/* App shell — shown when signed in */}
      <SignedIn>
        <ApiAuthBridge>{children}</ApiAuthBridge>
      </SignedIn>
    </ClerkProvider>
  );
}

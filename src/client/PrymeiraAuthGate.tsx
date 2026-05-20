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
      <div
        style={{
          flex: 1,
          background: "#0f0f0d",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 40px",
          borderLeft: "1px solid rgba(246,242,232,0.05)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.6s ease 0.18s, transform 0.6s ease 0.18s",
          }}
        >
          <ClerkLoading>
            <div style={{ display: "grid", gap: 11, padding: "24px 0" }}>
              {[100, 78, 100, 100, 52].map((w, i) => (
                <div
                  key={i}
                  style={{
                    height: i === 4 ? 44 : 14,
                    width: `${w}%`,
                    borderRadius: 7,
                    background: "#1a1a18",
                    opacity: 0.55,
                  }}
                />
              ))}
            </div>
          </ClerkLoading>
          <SignedOut>
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

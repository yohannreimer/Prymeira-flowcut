import { useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
export type FlowcutAccessDecision = {
  allowed: false;
  reason: 'no_entitlement' | 'inactive' | 'expired';
  product_key: string;
  status: string;
};

function getHubUrl(decision?: FlowcutAccessDecision): string {
  const base = 'https://account.prymeira.com';
  if (!decision) return base;
  const params = new URLSearchParams({
    from_product: decision.product_key,
    reason: decision.reason,
    status: decision.status,
  });
  return `${base}/acesso?${params.toString()}`;
}

// ── Flowcut logo mark (SVG) ───────────────────────────────────────────────────
function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <circle cx="5" cy="5.5" r="2.5" stroke="#171716" strokeWidth="1.7" />
      <circle cx="5" cy="14.5" r="2.5" stroke="#171716" strokeWidth="1.7" />
      <line x1="7.1" y1="6.6" x2="16" y2="10" stroke="#171716" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="7.1" y1="13.4" x2="16" y2="10" stroke="#171716" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// ── Lock icon ─────────────────────────────────────────────────────────────────
function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L18.66 17H1.34L10 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="10" y1="8" x2="10" y2="12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="10" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FlowcutAccessDenied(props: {
  decision?: FlowcutAccessDecision;
  error?: Error;
}) {
  const href = getHubUrl(props.decision);
  const isError = !!props.error;

  // Redirect to Hub immediately (skip in preview mode)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('preview') === '1') return;
    window.location.assign(href);
  }, [href]);

  const ACCENT = '#fcc009';
  const FONT = '"Area Normal","Aptos","SF Pro Display","Segoe UI Variable",system-ui,sans-serif';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fbfaf4',
      fontFamily: FONT,
      color: '#171716',
    }}>
      {/* Topbar */}
      <header style={{
        height: 56,
        borderBottom: '1px solid #d8d2c3',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 10,
      }}>
        <div style={{
          width: 30,
          height: 30,
          background: ACCENT,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <LogoMark size={16} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: '#171716' }}>
          Flowcut
        </span>
      </header>

      {/* Body */}
      <main style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: `clamp(56px, 12vh, 120px) 24px 0`,
      }}>
        {/* Icon */}
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: '#eee7d8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6a6460',
          marginBottom: 16,
        }}>
          {isError ? <AlertIcon /> : <LockIcon />}
        </div>

        {/* Eyebrow */}
        <p style={{
          margin: '0 0 4px',
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#9e9589',
        }}>
          {isError ? 'Erro de acesso' : 'Produto bloqueado'}
        </p>

        {/* Heading */}
        <h1 style={{
          margin: '0 0 8px',
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: '-0.03em',
          color: '#171716',
          lineHeight: 1.15,
        }}>
          Flowcut
        </h1>

        {/* Description */}
        <p style={{
          margin: '0 0 28px',
          fontSize: 15,
          lineHeight: 1.65,
          color: '#6a6460',
        }}>
          {isError
            ? (props.error?.message ?? 'Ocorreu um erro ao verificar o acesso.')
            : 'Sua conta está autenticada, mas o Flowcut ainda não foi liberado pela Prymeira Account. Levando você ao Hub para revisar o acesso.'}
        </p>

        {/* CTA */}
        {isError ? (
          <button
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              color: '#171716',
              fontFamily: FONT,
              padding: 0,
            }}
            onClick={() => window.location.reload()}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M13 7.5A5.5 5.5 0 1 1 7.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <polyline points="7.5,2 10.5,2 10.5,5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Tentar novamente
          </button>
        ) : (
          <a
            href={href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 14,
              fontWeight: 700,
              color: '#171716',
              textDecoration: 'none',
              fontFamily: FONT,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M9 2L2 7.5 9 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="2" y1="7.5" x2="13" y2="7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Voltar ao Hub
          </a>
        )}
      </main>
    </div>
  );
}

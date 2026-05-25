import { useState, useEffect } from 'react';

// ── Design tokens ─────────────────────────────────────────────────────────────
const ACCENT = '#fcc009';
const ACCENT_DIM = 'rgba(252,192,9,0.10)';
const BG = '#0a0a09';
const SURFACE = '#111110';
const SURFACE2 = '#161614';
const BORDER = '#252523';
const BORDER2 = '#1e1e1c';
const TEXT = '#f6f2e8';
const TEXT_SOFT = '#9e9589';
const TEXT_MUTED = '#5a5652';
const FONT = '"Area Normal","Aptos","SF Pro Display","Segoe UI Variable",system-ui,sans-serif';

// ── Flowcut logo SVG ──────────────────────────────────────────────────────────
function FlowcutLogoMark({ size = 22, dark = false }: { size?: number; dark?: boolean }) {
  const stroke = dark ? '#171716' : '#f6f2e8';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <circle cx="5" cy="5.5" r="2.5" stroke={stroke} strokeWidth="1.7" />
      <circle cx="5" cy="14.5" r="2.5" stroke={stroke} strokeWidth="1.7" />
      <line x1="7.1" y1="6.6" x2="16" y2="10" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
      <line x1="7.1" y1="13.4" x2="16" y2="10" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// ── Coded visual: hero editor mockup ─────────────────────────────────────────
const HERO_CLIPS = [
  { w: 55, faded: false }, { w: 18, faded: true }, { w: 70, faded: false },
  { w: 12, faded: true }, { w: 90, faded: false }, { w: 20, faded: true },
  { w: 48, faded: false }, { w: 14, faded: true }, { w: 62, faded: false },
];

function EditorMockup() {
  const TABS = ['Revisão', 'Corte', 'Legendas', 'Áudio', 'Exportar'];
  return (
    <div style={{
      background: SURFACE,
      borderRadius: 14,
      border: `1px solid ${BORDER}`,
      overflow: 'hidden',
      boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(252,192,9,0.06)',
    }}>
      {/* Browser chrome */}
      <div style={{
        height: 36,
        background: '#0d0d0c',
        borderBottom: `1px solid ${BORDER2}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 6,
      }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.65 }} />
        ))}
        <div style={{
          flex: 1,
          height: 20,
          borderRadius: 5,
          background: '#1a1a18',
          margin: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ fontSize: 9, color: TEXT_MUTED, letterSpacing: '0.03em' }}>flowcut.prymeira.com</span>
        </div>
      </div>

      {/* Workspace tabs */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${BORDER2}`,
        background: '#0f0f0d',
        paddingLeft: 8,
      }}>
        {TABS.map((tab, i) => (
          <div key={tab} style={{
            padding: '8px 14px',
            fontSize: 11,
            fontWeight: i === 0 ? 700 : 500,
            color: i === 0 ? ACCENT : 'rgba(246,242,232,0.28)',
            borderBottom: i === 0 ? `2px solid ${ACCENT}` : '2px solid transparent',
          }}>{tab}</div>
        ))}
      </div>

      {/* Video player */}
      <div style={{ padding: '10px 10px 0', background: '#090908' }}>
        <div style={{
          aspectRatio: '16/9',
          background: 'linear-gradient(145deg, #141412 0%, #0d0d0b 100%)',
          borderRadius: 8,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Ambient glow suggesting a speaker */}
          <div style={{
            position: 'absolute',
            top: '10%', left: '25%',
            width: '50%', height: '80%',
            background: 'radial-gradient(ellipse, rgba(252,192,9,0.07) 0%, transparent 70%)',
          }} />
          {/* Fake "face" silhouette suggestion */}
          <div style={{
            width: 48, height: 48,
            borderRadius: '50%',
            background: '#1a1a18',
            border: '1px solid #252523',
            position: 'absolute',
            top: '18%', left: '50%',
            transform: 'translateX(-50%)',
            opacity: 0.6,
          }} />
          <div style={{
            width: 90, height: 20,
            borderRadius: 4,
            background: '#1a1a18',
            border: '1px solid #252523',
            position: 'absolute',
            top: 'calc(18% + 58px)', left: '50%',
            transform: 'translateX(-50%)',
            opacity: 0.4,
          }} />
          {/* Caption overlay */}
          <div style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: TEXT,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: ACCENT }}>Então,</span> o que faz um vídeo funcionar
          </div>
          {/* Play button overlay */}
          <div style={{
            position: 'absolute',
            bottom: 10, right: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{ fontSize: 9, color: TEXT_MUTED, fontFamily: 'monospace' }}>04:12 / 18:35</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ padding: '6px 10px 10px', background: '#090908' }}>
        <div style={{ position: 'relative', height: 22 }}>
          {/* Track label */}
          <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 14, background: 'rgba(252,192,9,0.25)', borderRadius: 2,
          }} />
          <div style={{ paddingLeft: 8, display: 'flex', alignItems: 'center', height: '100%', gap: 2 }}>
            {HERO_CLIPS.map((clip, i) => (
              <div key={i} style={{
                width: clip.w / 4.5,
                height: 12,
                borderRadius: 2,
                background: clip.faded ? 'rgba(246,242,232,0.05)' : 'rgba(252,192,9,0.72)',
                flexShrink: 0,
              }} />
            ))}
          </div>
          {/* Playhead */}
          <div style={{
            position: 'absolute',
            left: 'calc(8px + 55px/4.5 + 2px + 18px/4.5 + 2px + 70px/4.5 + 2px)',
            top: -2, width: 1.5, height: 26,
            background: ACCENT,
          }} />
        </div>
      </div>
    </div>
  );
}

// ── Feature visual 1: Waveform with AI cuts ───────────────────────────────────
const WAVE_BARS = [4, 8, 14, 20, 18, 12, 22, 28, 24, 16, 10, 26, 30, 28, 20, 14, 8, 18, 24, 22, 16, 28, 32, 30, 22, 16, 10, 20, 26, 28, 24, 18, 12, 22, 28, 26, 20, 14, 8, 18];
// Indices that represent "cuts" (silences to be removed)
const CUT_RANGES = [[6, 9], [18, 21], [32, 35]];

function isInCut(i: number) {
  return CUT_RANGES.some(([start, end]) => i >= start && i <= end);
}

function CutVisual() {
  return (
    <div style={{ height: 380, display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 32px', background: SURFACE2, borderRadius: 16, border: `1px solid ${BORDER}` }}>
      {/* Before */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Original</span>
          <span style={{ fontSize: 11, color: TEXT_MUTED, fontFamily: 'monospace' }}>24:38</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
          {WAVE_BARS.map((h, i) => (
            <div key={i} style={{
              flex: 1,
              height: `${h}px`,
              borderRadius: 2,
              background: isInCut(i)
                ? 'rgba(159,77,72,0.55)'
                : 'rgba(252,192,9,0.7)',
            }} />
          ))}
        </div>
        {/* Cut region labels */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(159,77,72,0.55)' }} />
          <span style={{ fontSize: 10, color: TEXT_MUTED }}>23 silêncios e pausas detectados — 8 min 14s a remover</span>
        </div>
      </div>

      {/* Arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px',
          borderRadius: 20,
          background: ACCENT_DIM,
          border: `1px solid rgba(252,192,9,0.2)`,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M2 7l4 4 4-4" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>Corte com IA</span>
        </div>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {/* After */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Rascunho editado</span>
          <span style={{ fontSize: 11, color: ACCENT, fontFamily: 'monospace', fontWeight: 700 }}>16:24</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
          {WAVE_BARS.filter((_, i) => !isInCut(i)).map((h, i) => (
            <div key={i} style={{
              flex: 1,
              height: `${h}px`,
              borderRadius: 2,
              background: 'rgba(252,192,9,0.82)',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(252,192,9,0.82)' }} />
          <span style={{ fontSize: 10, color: TEXT_MUTED }}>Pronto para revisão — 34% mais curto</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginTop: 'auto' }}>
        {[
          { label: 'Cortes detectados', value: '23' },
          { label: 'Tempo economizado', value: '8 min' },
          { label: 'Redução', value: '34%' },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, background: SURFACE, borderRadius: 8, padding: '10px 12px', border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: ACCENT, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Feature visual 2: Captions overlay ───────────────────────────────────────
const CAPTION_WORDS = [
  { text: 'Então,', active: false },
  { text: 'o', active: false },
  { text: 'que', active: false },
  { text: 'diferencia', active: true },
  { text: 'um', active: false },
  { text: 'criador', active: false },
  { text: 'de', active: false },
  { text: 'sucesso', active: false },
  { text: 'é', active: false },
  { text: 'a', active: false },
  { text: 'consistência.', active: false },
];

function CaptionVisual() {
  return (
    <div style={{ height: 380, display: 'flex', flexDirection: 'column', gap: 14, padding: '24px 32px', background: SURFACE2, borderRadius: 16, border: `1px solid ${BORDER}` }}>
      {/* Video frame */}
      <div style={{
        flex: '0 0 180px',
        background: '#090908',
        borderRadius: 10,
        border: `1px solid ${BORDER}`,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 35%, rgba(252,192,9,0.07) 0%, transparent 65%)',
        }} />
        {/* Caption overlay */}
        <div style={{
          position: 'absolute',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '88%',
        }}>
          {CAPTION_WORDS.slice(0, 6).map((w, i) => (
            <span key={i} style={{
              fontSize: 12,
              fontWeight: w.active ? 800 : 600,
              color: w.active ? ACCENT : TEXT,
              background: w.active ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)',
              padding: '2px 5px',
              borderRadius: 3,
            }}>{w.text}</span>
          ))}
        </div>
        {/* Time indicator */}
        <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 9, color: TEXT_MUTED, fontFamily: 'monospace' }}>02:18</span>
      </div>

      {/* Transcript editor */}
      <div style={{ flex: 1, background: SURFACE, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px 14px', overflow: 'hidden' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Transcrição</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 6px' }}>
          {CAPTION_WORDS.map((w, i) => (
            <span key={i} style={{
              fontSize: 12,
              fontWeight: w.active ? 700 : 400,
              color: w.active ? ACCENT : TEXT_SOFT,
              background: w.active ? ACCENT_DIM : 'transparent',
              padding: '1px 4px',
              borderRadius: 3,
              cursor: 'pointer',
            }}>{w.text}</span>
          ))}
        </div>

        {/* Style chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {['Bold', 'Outline', 'Karaoke'].map((style, i) => (
            <div key={style} style={{
              padding: '3px 8px',
              borderRadius: 20,
              fontSize: 10,
              fontWeight: i === 0 ? 700 : 500,
              background: i === 0 ? ACCENT_DIM : 'transparent',
              border: i === 0 ? `1px solid rgba(252,192,9,0.3)` : `1px solid ${BORDER}`,
              color: i === 0 ? ACCENT : TEXT_MUTED,
            }}>{style}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feature visual 3: YouTube package ─────────────────────────────────────────
const CHAPTERS = [
  { time: '00:00', label: 'Introdução' },
  { time: '01:42', label: 'O Problema Real' },
  { time: '04:15', label: 'A Estratégia' },
  { time: '09:30', label: 'Demonstração Prática' },
  { time: '14:20', label: 'Resultados e Próximos Passos' },
];

function PackageVisual() {
  return (
    <div style={{ height: 380, display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 32px', background: SURFACE2, borderRadius: 16, border: `1px solid ${BORDER}` }}>
      {/* Thumbnail + title card */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          width: 120,
          height: 68,
          background: 'linear-gradient(135deg, #1a1a18 0%, #252523 100%)',
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 40% 40%, rgba(252,192,9,0.12) 0%, transparent 65%)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: 5, right: 6,
            background: '#000',
            borderRadius: 3,
            padding: '1px 4px',
            fontSize: 9,
            color: TEXT,
            fontFamily: 'monospace',
            fontWeight: 700,
          }}>16:24</div>
          <div style={{
            width: 24, height: 24,
            borderRadius: '50%',
            background: 'rgba(255,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <polygon points="2,1 8,4.5 2,8" fill="white" />
            </svg>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.35,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            Como criadores top produzem 5× mais rápido com IA
          </div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4, lineHeight: 1.4 }}>
            Estratégia completa de produção de conteúdo...
          </div>
        </div>
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', gap: 6 }}>
        {['Thumbnail', 'Copy', 'SEO', 'Capítulos'].map((chip, i) => (
          <div key={chip} style={{
            padding: '3px 9px',
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 700,
            background: i === 0 ? ACCENT_DIM : 'transparent',
            border: i === 0 ? `1px solid rgba(252,192,9,0.3)` : `1px solid ${BORDER}`,
            color: i === 0 ? ACCENT : TEXT_MUTED,
          }}>{chip}</div>
        ))}
      </div>

      {/* Chapter list */}
      <div style={{ flex: 1, background: SURFACE, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', overflow: 'hidden' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Capítulos gerados pela IA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CHAPTERS.map((ch, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: ACCENT, flexShrink: 0 }}>{ch.time}</span>
              <span style={{ fontSize: 11, color: TEXT_SOFT, lineHeight: 1 }}>{ch.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feature visual 4: Export panel ────────────────────────────────────────────
function ExportVisual() {
  const steps = [
    { label: 'Aplicando cortes com IA', done: true },
    { label: 'Renderizando legendas', done: true },
    { label: 'Processando trilha sonora', done: true },
    { label: 'Exportando frames finais', done: false },
  ];

  return (
    <div style={{ height: 380, display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 32px', background: SURFACE2, borderRadius: 16, border: `1px solid ${BORDER}` }}>
      {/* Settings */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'Formato', value: '16:9' },
          { label: 'Resolução', value: '1080p' },
          { label: 'Qualidade', value: 'Máxima' },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex: 1, background: SURFACE, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: TEXT_MUTED, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>Exportando...</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>74%</span>
        </div>
        <div style={{ height: 6, background: SURFACE, borderRadius: 3, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{ width: '74%', height: '100%', background: ACCENT, borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 5, fontFamily: 'monospace' }}>≈ 2 min restantes · 1080p H.264</div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              background: step.done ? ACCENT_DIM : 'rgba(252,192,9,0.05)',
              border: step.done ? `1px solid rgba(252,192,9,0.4)` : `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {step.done ? (
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <polyline points="1.5,4.5 3.5,7 7.5,2" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT, opacity: 0.6 }} />
              )}
            </div>
            <span style={{ fontSize: 12, color: step.done ? TEXT_SOFT : TEXT }}>{step.label}</span>
          </div>
        ))}
      </div>

      {/* YouTube connect indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: 'rgba(255,0,0,0.06)',
        border: '1px solid rgba(255,0,0,0.15)',
        borderRadius: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#ff4444">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-2.72A16 16 0 0 0 12 3.27a16 16 0 0 0-3.82.7 4.83 4.83 0 0 1-3.77 2.72 4.78 4.78 0 0 0-1 3 4.78 4.78 0 0 0 .73 2.57A3.88 3.88 0 0 1 4 15a3.72 3.72 0 0 0 3.72 3.72 3.56 3.56 0 0 0 2.54-1A7.31 7.31 0 0 0 12 18a7.31 7.31 0 0 0 1.74.72 3.56 3.56 0 0 0 2.54 1A3.72 3.72 0 0 0 20 15a3.88 3.88 0 0 1-.14-3.02A4.78 4.78 0 0 0 20.59 9.5a4.78 4.78 0 0 0-1-2.81z" opacity="0.5" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,80,80,0.8)' }}>YouTube conectado — publicar em 1 clique</span>
      </div>
    </div>
  );
}

// ── Features config ───────────────────────────────────────────────────────────
const FEATURES = [
  {
    id: 'cut',
    label: 'Corte com IA',
    headline: 'Silêncios, hesitações e erros — eliminados em minutos.',
    body: 'A IA do Flowcut detecta os trechos fracos do seu vídeo e monta um rascunho limpo antes mesmo de você abrir o editor. Você revisa, não retrabalha.',
    Visual: CutVisual,
  },
  {
    id: 'captions',
    label: 'Legendas automáticas',
    headline: 'Transcrição em segundos, legendas no estilo certo.',
    body: 'Whisper transcreve o áudio com alta precisão. Você escolhe fonte, cor e estilo. As legendas entram no vídeo com um clique — editáveis palavra por palavra.',
    Visual: CaptionVisual,
  },
  {
    id: 'package',
    label: 'Pacote YouTube',
    headline: 'Título, descrição, capítulos e thumbnail — tudo gerado.',
    body: 'A IA lê a transcrição, entende o conteúdo e monta o pacote completo para publicar no YouTube. Sem escrever uma linha de copy.',
    Visual: PackageVisual,
  },
  {
    id: 'export',
    label: 'Exportar e publicar',
    headline: 'Do rascunho ao YouTube, sem sair da plataforma.',
    body: 'Export em 1080p ou 4K com correção de cor, trilha sonora e limpeza de áudio. Publique direto no YouTube com o canal conectado.',
    Visual: ExportVisual,
  },
];

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ mounted }: { mounted: boolean }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 48px',
      height: 56,
      background: 'rgba(10,10,9,0.88)',
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${BORDER2}`,
      opacity: mounted ? 1 : 0,
      transition: 'opacity 0.5s ease',
      fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 30, height: 30,
          background: ACCENT,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(252,192,9,0.28)',
        }}>
          <FlowcutLogoMark size={16} dark />
        </div>
        <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.03em', color: TEXT }}>Flowcut</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(252,192,9,0.4)', marginLeft: 4 }}>by Prymeira</span>
      </div>
      <a href="/" style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '7px 16px',
        background: ACCENT,
        color: '#171716',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: 'none',
        boxShadow: '0 4px 14px rgba(252,192,9,0.28)',
      }}>
        Entrar
      </a>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ mounted }: { mounted: boolean }) {
  return (
    <section style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '80px 48px 64px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 64,
      alignItems: 'center',
      fontFamily: FONT,
    }}>
      {/* Left: copy */}
      <div style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'none' : 'translateY(20px)',
        transition: 'opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px',
          borderRadius: 20,
          background: ACCENT_DIM,
          border: `1px solid rgba(252,192,9,0.2)`,
          marginBottom: 28,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '0.04em' }}>Editor de vídeo com IA</span>
        </div>

        <h1 style={{
          margin: '0 0 20px',
          fontSize: 'clamp(32px, 4vw, 54px)',
          fontWeight: 900,
          lineHeight: 1.08,
          letterSpacing: '-0.04em',
          color: TEXT,
        }}>
          Da gravação ao{' '}
          <span style={{ color: ACCENT }}>clipe publicado.</span>
        </h1>

        <p style={{
          margin: '0 0 36px',
          fontSize: 17,
          lineHeight: 1.65,
          color: TEXT_MUTED,
          maxWidth: '38ch',
        }}>
          Flowcut analisa seu vídeo, remove o que atrapalha, gera legendas e empacota tudo para o YouTube — em minutos.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36 }}>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '13px 24px',
            background: ACCENT,
            color: '#171716',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(252,192,9,0.32)',
          }}>
            Começar a editar
          </a>
          <a href="#features" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '13px 24px',
            background: 'transparent',
            color: TEXT_SOFT,
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
            border: `1px solid ${BORDER}`,
          }}>
            Ver como funciona
          </a>
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {['Corte automático', 'Transcrição', 'Legendas', 'YouTube'].map(chip => (
            <span key={chip} style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(246,242,232,0.3)',
              border: `1px solid rgba(246,242,232,0.08)`,
            }}>{chip}</span>
          ))}
        </div>
      </div>

      {/* Right: editor mockup */}
      <div style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'none' : 'translateY(24px)',
        transition: 'opacity 0.7s ease 0.25s, transform 0.7s ease 0.25s',
      }}>
        <EditorMockup />
      </div>
    </section>
  );
}

// ── Features gallery ──────────────────────────────────────────────────────────
function Features({ activeIdx, setActiveIdx }: { activeIdx: number; setActiveIdx: (i: number) => void }) {
  const feature = FEATURES[activeIdx];
  const Visual = feature.Visual;

  return (
    <section id="features" style={{
      background: SURFACE,
      borderTop: `1px solid ${BORDER2}`,
      borderBottom: `1px solid ${BORDER2}`,
      padding: '72px 0',
      fontFamily: FONT,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 48px' }}>
        {/* Tab pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 48, flexWrap: 'wrap' }}>
          {FEATURES.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              style={{
                padding: '8px 18px',
                borderRadius: 20,
                border: i === activeIdx ? `1px solid rgba(252,192,9,0.4)` : `1px solid ${BORDER}`,
                background: i === activeIdx ? ACCENT_DIM : 'transparent',
                color: i === activeIdx ? ACCENT : TEXT_MUTED,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT,
                transition: 'all 0.2s ease',
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* Content grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          gap: 56,
          alignItems: 'start',
        }}>
          {/* Text column */}
          <div>
            <h2 style={{
              margin: '0 0 16px',
              fontSize: 26,
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: '-0.03em',
              color: TEXT,
            }}>{feature.headline}</h2>
            <p style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.7,
              color: TEXT_MUTED,
            }}>{feature.body}</p>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 6, marginTop: 32 }}>
              {FEATURES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  style={{
                    width: i === activeIdx ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i === activeIdx ? ACCENT : BORDER,
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Visual column */}
          <div>
            <Visual />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────
const HOW_STEPS = [
  { n: '01', title: 'Envie o vídeo', body: 'Upload do arquivo MP4 ou MOV direto para o Flowcut. Nenhuma instalação necessária.' },
  { n: '02', title: 'IA edita o rascunho', body: 'Silêncios e pausas são detectados e removidos automaticamente em minutos.' },
  { n: '03', title: 'Refine e gere as legendas', body: 'Ajuste os cortes, gere transcrição com Whisper e personalize as legendas.' },
  { n: '04', title: 'Exporte e publique', body: 'Exporte em alta qualidade e publique direto no YouTube — tudo numa plataforma.' },
];

function HowItWorks() {
  return (
    <section style={{ padding: '80px 48px', maxWidth: 1200, margin: '0 auto', fontFamily: FONT }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(252,192,9,0.45)' }}>
          Como funciona
        </p>
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', color: TEXT }}>
          Do upload ao YouTube em{' '}
          <span style={{ color: ACCENT }}>4 passos.</span>
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
        {HOW_STEPS.map((step, i) => (
          <div key={i} style={{
            padding: '24px 20px',
            background: SURFACE,
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
            position: 'relative',
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 900,
              color: ACCENT,
              letterSpacing: '0.08em',
              marginBottom: 14,
              opacity: 0.7,
            }}>{step.n}</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>
              {step.title}
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: TEXT_MUTED }}>
              {step.body}
            </p>
            {i < HOW_STEPS.length - 1 && (
              <div style={{
                position: 'absolute',
                right: -13,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16,
                color: BORDER,
              }}>›</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section style={{
      margin: '0 48px 80px',
      background: 'linear-gradient(135deg, #131108 0%, #1a1710 100%)',
      border: `1px solid rgba(252,192,9,0.15)`,
      borderRadius: 20,
      padding: '64px 52px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: FONT,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(252,192,9,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(252,192,9,0.45)' }}>
        Prymeira Flowcut
      </p>
      <h2 style={{
        margin: '0 0 16px',
        fontSize: 'clamp(28px, 4vw, 44px)',
        fontWeight: 900,
        letterSpacing: '-0.04em',
        lineHeight: 1.1,
        color: TEXT,
        maxWidth: '16em',
      }}>
        Comece a editar{' '}
        <span style={{ color: ACCENT }}>agora.</span>
      </h2>
      <p style={{ margin: '0 0 36px', fontSize: 16, color: TEXT_MUTED, lineHeight: 1.6, maxWidth: '40ch' }}>
        Envie seu primeiro vídeo e veja o rascunho pronto em minutos.
      </p>
      <a href="/" style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '15px 32px',
        background: ACCENT,
        color: '#171716',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 800,
        textDecoration: 'none',
        boxShadow: '0 8px 28px rgba(252,192,9,0.34)',
      }}>
        Criar conta gratuitamente
      </a>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{
      padding: '24px 48px',
      borderTop: `1px solid ${BORDER2}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22,
          background: ACCENT,
          borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FlowcutLogoMark size={12} dark />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_SOFT }}>Flowcut</span>
      </div>
      <span style={{ fontSize: 12, color: TEXT_MUTED }}>© 2025 Prymeira. Todos os direitos reservados.</span>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(252,192,9,0.35)' }}>
        by Prymeira
      </span>
    </footer>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function FlowcutLandingPage() {
  const [mounted, setMounted] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Auto-advance features tab
  useEffect(() => {
    const t = setInterval(() => {
      setActiveIdx((i) => (i + 1) % FEATURES.length);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      background: BG,
      minHeight: '100vh',
      color: TEXT,
      fontFamily: FONT,
    }}>
      <Nav mounted={mounted} />
      <Hero mounted={mounted} />
      <Features activeIdx={activeIdx} setActiveIdx={setActiveIdx} />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}

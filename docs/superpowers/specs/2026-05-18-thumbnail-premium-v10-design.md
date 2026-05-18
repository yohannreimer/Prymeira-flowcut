# Thumbnail Premium V10 — Design Spec

**Data:** 2026-05-18  
**Escopo:** Substituir o pipeline SVG/Sharp de thumbnails automáticas por um pipeline Remotion React de alta qualidade, com seleção inteligente de frames, preprocessing cinemático, novo layout e textura premium.

---

## Contexto

O pipeline atual gera thumbnails via SVG strings hardcoded renderizadas com Sharp. Problemas identificados:

- Fontes (`Avenir Next`, `Arial Black`) não existem no servidor headless — fallback para Arial genérico
- Frames extraídos em posições fixas (8%, 32%, 58%, 84%) sem análise de conteúdo — captura olho fechado, desfoque, transição
- Composição com coordenadas absolutas no SVG — rosto colado em posição fixa, sem smart crop
- Frames de referência entram crus sem qualquer processamento de imagem
- 5 layouts V9 — sem espaço para um 6º conceito

`@remotion/renderer` e `@remotion/bundler` já estão instalados e funcionando para renderização de vídeo (`render-remotion-motion.ts`). `renderStill()` desbloqueia thumbnails com qualidade de browser Chromium.

---

## Design

### Visão geral

```
Vídeo fonte
  └─ FFmpeg thumbnail filter (por segmento) → 6 candidatos de frame
       └─ GPT-4o Vision → seleciona o frame mais expressivo
            └─ Sharp preprocessing (normalize + grading + sharpen) → 4 refs processadas
                 └─ Remotion renderStill() × 6 composições → PNGs 1280×720
                      └─ Sharp grain overlay → output final
```

O copy (GPT-4.1-mini) e o schema `renderText` não mudam.

---

## Fase 1 — Fundação: Remotion React + Fontes

### Componentes React (6 layouts)

Cada layout V9 vira um componente React com CSS real. Sem coordenadas absolutas hardcoded.

```
src/remotion/thumbnails/
  types.ts                       — ThumbnailRenderProps (renderText + imagePaths)
  fonts.ts                       — carregamento de Bebas Neue + Inter
  useFitText.ts                  — hook de font size dinâmico
  FaceImage.tsx                  — componente de imagem com objectFit + objectPosition
  layouts/
    PremiumExecution.tsx         — V9-1: fiz mesmo assim
    SplitResult.tsx              — V9-2: conflito vs resultado
    Editorial.tsx                — V9-3: manchete editorial
    StatusWindow.tsx             — V9-4: sistema/status
    SocialCards.tsx              — V9-5: rede social como ativo
    BreakingNews.tsx             — V9-6: breaking news / noticiário
```

**Fontes:** `@remotion/google-fonts` para Bebas Neue (headlines) e Inter (subheads/corpo). Instalado como dependência nova. Carregadas em `fonts.ts` com `loadFont()` antes do render.

**Registro em `src/remotion/index.tsx`:** 6 novas `<Composition>` com `durationInFrames={1}`, uma por layout. IDs: `thumbnail-premium-execution`, `thumbnail-split-result`, `thumbnail-editorial`, `thumbnail-status-window`, `thumbnail-social-cards`, `thumbnail-breaking-news`.

### Hook `useFitText`

Binary search sobre `fontSize` até o texto preencher o container sem overflow. Roda client-side no Remotion antes de `renderStill()` capturar o frame.

```ts
// Interface simplificada
function useFitText(ref: RefObject<HTMLElement>, deps: unknown[]): number
```

### Renderer reescrito

`src/server/youtube/v9-thumbnail-renderer.ts` substituído integralmente:

1. `bundle({ entryPoint: 'src/remotion/index.tsx' })` — uma vez por job
2. `renderStill()` × 6 em `Promise.all` — paralelo
3. Output: `thumbnail-generated-01.png` a `thumbnail-generated-06.png`

**Props passadas:** `renderText` (vindo do copy GPT) + `imagePaths` (caminhos dos frames preprocessados).

---

## Fase 2 — Seleção inteligente de frames

### FFmpeg thumbnail filter

Substitui a extração de frames em percentuais fixos. Para cada um dos 6 segmentos do vídeo:

```bash
ffmpeg -ss {start} -t {duration} -i input.mp4 \
  -vf "thumbnail=60" -frames:v 1 \
  -q:v 2 thumbnail-candidate-{N}.jpg
```

O filtro `thumbnail=N` analisa N frames e escolhe o mais representativo (sem desfoque, sem transição, iluminação estável). Fallback para o timestamp percentual se o filtro falhar.

**Segmentos:** 6 candidatos extraídos de [0.05, 0.20, 0.38, 0.55, 0.72, 0.88] × duração.

Arquivo: `src/server/jobs/run-youtube-package-job.ts` — função `extractReferenceFrames` atualizada.

### GPT-4o Vision — seleção por expressão facial

Dos 6 candidatos, GPT-4o Vision analisa expressão facial e retorna o índice do frame mais expressivo para usar como foto principal (rosto em destaque em todos os layouts).

```ts
// src/server/youtube/select-best-frame.ts
async function selectBestFrame(candidatePaths: string[]): Promise<number>
```

Prompt enviado com as 6 imagens em base64: pede o índice (0–5) do frame com olhos abertos, olhar direto, expressão mais energética/natural. Resposta via `response_format: { type: "json_object" }`.

**Custo:** ~$0,002 por job. Falha silenciosa — usa candidato 0 como fallback.

Os 4 frames de referência são: [bestFrame, candidatos[1], candidatos[3], candidatos[5]] — o melhor rosto garantido na posição principal.

---

## Fase 3 — Sharp preprocessing pipeline

Executado em paralelo nos 4 frames de referência antes de passar para o Remotion.

### Base preprocessing

```ts
// src/server/youtube/preprocess-frames.ts
async function preprocessFrame(inputPath: string, outputPath: string): Promise<void>
```

Pipeline Sharp por frame:

1. `.normalize()` — white/black point automático (maior ganho em frames escuros)
2. `.modulate({ saturation: 1.15, brightness: 1.03 })` — leve pop de cor sem artificialidade
3. `.sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })` — nitidez sutil, rosto mais definido

### Color grading cinemático — Golden Hour

Após preprocessing base, aplicar grade cinematográfico:

```ts
.linear(
  [1.08, 1.03, 0.96],  // R leve boost (quente), G neutro, B leve corte (frio nas sombras)
  [8, 2, -4]           // lift: highlights âmbar, sombras levemente azuladas
)
```

Resultado: foto parece tirada na golden hour. Sutil — não deve parecer filtro, deve parecer boa iluminação.

Processado nos 4 frames. Intensidade: `opacity: 0.65` (blend entre original e graded) para preservar naturalidade.

---

## Fase 4 — 6º layout: Breaking News

**Conceito:** estética de noticiário ao vivo — lower third com nome, faixa amarela separadora, headline na parte superior, badge "AO VIVO" em vermelho, rosto grande à direita.

**Funciona para:** conteúdo de processo, bastidor, "o dia que tudo deu errado", qualquer narrativa de tensão/resolução.

### Geração do renderText para o 6º layout

O GPT já gera 5 objetos `thumbnailPrompts`. O Breaking News usa o mesmo `renderText` do conceito 1 (`fiz_mesmo_assim`) com campo `badge` redefinido para `"AO VIVO"` e `stamp` como o nome do canal. Sem custo de API extra.

Lógica em `run-youtube-package-job.ts`: após receber os 5 prompts, deriva o 6º sinteticamente.

### Arquivos

- `src/remotion/thumbnails/layouts/BreakingNews.tsx`
- `src/server/jobs/run-youtube-package-job.ts` — render do 6º adicionado

---

## Fase 5 — Grain texture overlay

Após `renderStill()` gerar o PNG de cada thumbnail, Sharp aplica uma camada de ruído fotográfico:

```ts
// src/server/youtube/apply-grain.ts
async function applyGrain(inputPath: string, outputPath: string, intensity?: number): Promise<void>
```

Implementação: gerar PNG de ruído via Sharp com `{ create: { width, height, channels: 4, noise: { type: 'gaussian', mean: 0, sigma: 8 } } }` e fazer `composite` com `blend: 'overlay'` e `opacity: 0.10`.

Intensidade calibrada por layout:
- Editorial: `0.12` (mais intenso — reforça estética impressa)
- Premium Execution, Breaking News: `0.10`
- Split Result, Status, Social Cards: `0.08`

---

## Arquivos criados e modificados

### Novos

```
src/remotion/thumbnails/types.ts
src/remotion/thumbnails/fonts.ts
src/remotion/thumbnails/useFitText.ts
src/remotion/thumbnails/FaceImage.tsx
src/remotion/thumbnails/layouts/PremiumExecution.tsx
src/remotion/thumbnails/layouts/SplitResult.tsx
src/remotion/thumbnails/layouts/Editorial.tsx
src/remotion/thumbnails/layouts/StatusWindow.tsx
src/remotion/thumbnails/layouts/SocialCards.tsx
src/remotion/thumbnails/layouts/BreakingNews.tsx
src/server/youtube/select-best-frame.ts
src/server/youtube/preprocess-frames.ts
src/server/youtube/apply-grain.ts
```

### Modificados

```
src/remotion/index.tsx                          — + 6 composições de thumbnail
src/server/youtube/v9-thumbnail-renderer.ts     — reescrito com renderStill()
src/server/jobs/run-youtube-package-job.ts      — thumbnail filter + 6º layout
```

### Dependência nova

```
@remotion/google-fonts
```

---

## Output do pacote após as melhorias

| Arquivo | Descrição |
|---|---|
| `thumbnail-generated-01.png` | Premium Execution (fiz mesmo assim) |
| `thumbnail-generated-02.png` | Split Result (conflito vs resultado) |
| `thumbnail-generated-03.png` | Editorial (manchete) |
| `thumbnail-generated-04.png` | Status Window (sistema/OS) |
| `thumbnail-generated-05.png` | Social Cards (rede social como ativo) |
| `thumbnail-generated-06.png` | Breaking News (noticiário ao vivo) |
| `thumbnail-ref-01..04.jpg` | Frames preprocessados + graded |
| `titulo.txt`, `descricao.txt`, `chapters.txt` | Sem mudança |

---

## Error handling

- Se `renderStill()` falhar para uma composição → logar e continuar (sem interromper o job)
- Se GPT-4o Vision falhar na seleção de expressão → usar candidato índice 0 como fallback
- Se FFmpeg thumbnail filter não suportado → fallback para extração por percentual
- Se preprocessing falhar em um frame → usar frame original sem processamento
- Grain overlay: falha silenciosa, thumbnail sem grain é aceitável

---

## Testes

- Unit: `selectFrameTimes` atualizado para 6 segmentos
- Unit: `selectBestFrame` com mock de OpenAI — retorna índice válido e fallback em erro
- Unit: `preprocessFrame` — verifica que output existe e tem tamanho > input (em geral)
- Unit: `applyGrain` — verifica que output existe
- Integration: `renderV9ThumbnailImages` renderiza 6 arquivos PNG no diretório de saída
- Os testes existentes de `run-youtube-package-job` continuam passando via mocks de `renderV9ThumbnailImages`

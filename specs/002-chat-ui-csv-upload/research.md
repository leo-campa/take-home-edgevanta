# Research: Chat UI with CSV Upload

**Date**: 2026-06-13 | **Feature**: 002-chat-ui-csv-upload

## File Upload Handling

**Decision**: `busboy` for multipart streaming; Next.js bodyParser disabled per-route.

**Rationale**: `busboy` is a low-level streaming multipart parser — it never buffers the whole file in memory, which is essential for 100 MB CSVs. Stream is piped to `fs.createWriteStream` → saved to `./uploads/<ISO-timestamp>-<filename>` before parsing begins (satisfies FR-010).

**Route config**:
```ts
export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 300,
}
```

**Size enforcement**: `busboy({ limits: { fileSize: 104_857_600 } })`. On the `'limit'` event return HTTP 413. Client-side guard also rejects before upload.

**Alternatives considered**: `formidable` — heavier, breaking API changes across versions. Next.js built-in bodyParser — cannot handle 100 MB.

---

## CSV Parsing

**Decision**: `papaparse` reading the saved file, `header: true` mode.

**Rationale**: papaparse handles BOM, inconsistent line endings, quoted fields, and encoding issues common in DOT export CSVs. `header: true` returns rows as `Record<string, string>` keyed by raw column name, which feeds directly into the normaliser.

**Normalisation pipeline** (fully detailed in plan.md):
1. Headers: trim → whitespace-to-underscore → lowercase
2. Cells: null-if-empty → try numeric (strip `$`/`,`, parseFloat) → fallback trim string
3. Canonical field detection via heuristic header-name map

---

## MUI Integration

**Decision**: `@mui/material` + `@emotion/react` + `@emotion/styled` (MUI v5/v6 peer deps).

**Rationale**: MUI v5/v6 uses Emotion as its CSS-in-JS engine. Since the project uses SCSS for component styles, MUI is used only for structural components (TextField, Button, CircularProgress, Box, Stack) — not for global theming or sx-prop styling. Custom SCSS classes are applied via `className` props to override or extend MUI components where needed.

**Setup**: Add `ThemeProvider` and `CssBaseline` to `_app.tsx`. No custom theme required initially.

**Install**:
```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
```

---

## Embeddings

**Decision**: OpenAI `text-embedding-3-small`, one embedding per bid item.

**Rationale**: Each CSV row is an atomic unit. One embedding per row keeps cosine similarity meaningful and retrieval precise. Embedding text is the human-readable chunk format defined in plan.md. Batched at 100 rows per API call.

**Install**: `npm install openai`

---

## In-Memory Vector Store

**Decision**: Plain TypeScript cosine similarity, `globalThis` singleton.

**Rationale**: At ≤ 500 rows × 1536 dims, brute-force dot-product search completes in < 5 ms. Pre-normalise vectors at ingest (divide by L2 norm) → query is a simple dot-product loop. No external service or binary dependency needed.

**Singleton pattern**:
```ts
export const getStore = (): VectorStore =>
  ((globalThis as any).__vectorStore ??= new VectorStore())
```
`globalThis` survives Next.js Fast Refresh hot reloads within the same Node process.

---

## SSE Streaming

**Decision**: Server-Sent Events via a standard Next.js Pages Router API route (`POST /api/chat`); Claude Streaming API for token-by-token delivery.

**Rationale**: The communication pattern is one-directional — the server streams tokens to the browser, not the other way. SSE is the right primitive for this. A standard Next.js API route can handle SSE by setting `Content-Type: text/event-stream` and writing `data: {...}\n\n` lines via `res.write()`. No custom server, no extra dependencies, `npm run dev` stays as `next dev`.

**Streaming flow**:
1. User types a question and presses Send
2. `useChat` hook issues `POST /api/chat` with `{ question }` in the body
3. Server sets SSE headers and calls Claude with streaming enabled
4. Each text delta from Claude is written as `data: {"type":"token","content":"..."}\n\n`
5. On stream end, server writes `data: {"type":"done"}\n\n` and calls `res.end()`
6. Client reads the response body via `ReadableStream` reader, parses each SSE line

**Why not WebSocket?**: WebSocket requires bidirectional state and a custom HTTP server to intercept `upgrade` events — overengineering for a pattern that is fundamentally one-directional (question in, token stream out). SSE via a plain API route is simpler, has zero extra dependencies, and doesn't change the dev script.

---

## Testing

**Decision**: Jest + React Testing Library + ts-jest.

**Rationale**: Jest is the standard for React/Next.js projects and integrates natively with TypeScript via `ts-jest`. React Testing Library enforces testing from the user's perspective (rendered output + interactions) rather than implementation details. RTL pairs with `@testing-library/jest-dom` for readable DOM assertions.

**Test environment**:
- Components and hooks: `jest-environment-jsdom` (browser-like DOM)
- `lib/` and `ws/` modules: `jest-environment-node`
- SCSS imports mocked via `identity-obj-proxy` in `moduleNameMapper`
- WebSocket mocked in `useChat` tests using a manual mock or `jest-websocket-mock`

**Install**:
```bash
npm install --save-dev jest @types/jest jest-environment-jsdom ts-jest \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  identity-obj-proxy
```

---

## Agent Reasoning

**Decision**: Anthropic Claude claude-sonnet-4-6 with 5 structured tools.

**Tool routing**: Claude inspects the user's question and selects the appropriate tool. Analytical questions (top items, outliers, averages) route to `lib/analytics.ts` which computes results deterministically from `BidItem[]`. Semantic questions route to `lib/vector-store.ts` cosine search. The LLM only produces the final natural-language response — it never performs arithmetic.

**Install**: `npm install @anthropic-ai/sdk`

---

## Dependencies Summary

```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled \
            busboy papaparse openai @anthropic-ai/sdk

npm install --save-dev @types/busboy @types/papaparse \
            jest @types/jest jest-environment-jsdom ts-jest \
            @testing-library/react @testing-library/jest-dom \
            @testing-library/user-event identity-obj-proxy
```

# Implementation Plan: Chat UI with CSV Upload

**Branch**: `feature/csv-flow` (parent) | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

## Summary

Build a Next.js (Pages Router) chat interface where a construction estimator uploads a CSV bid tabulation file and asks natural language questions. The backend streams the upload to disk via `busboy`, normalises all column names to snake_case, normalises numeric cell values to the US number format (stripping `$` / `,`), trims all strings, and preserves mixed alphanumeric values as-is. Each bid item is serialised into a human-readable text chunk and sent to OpenAI `text-embedding-3-small` for embedding. Embeddings are stored in a `globalThis` in-memory vector store with cosine-similarity retrieval. A Claude claude-sonnet-4-6 agent orchestrates two retrieval paths: deterministic structured-data tools (top items, outlier detection, quantity summaries — computed directly on the data, not through the LLM) for analytical questions, and cosine-similarity vector search for semantic questions. **Agent answers are streamed token-by-token to the browser over a WebSocket connection**, so the user sees the response building in real time. Styles use SCSS per component with a `{component-name}-component` wrapper class. MUI supplies base UI components.

## Technical Context

**Language/Version**: TypeScript 5 — shapes defined as `type` aliases (not `interface`)

**Primary Dependencies**:
- `next@16.2.9` (Pages Router, existing)
- `react@19`, `react-dom@19` (existing)
- `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled` — MUI component library + required peer deps
- `busboy` + `@types/busboy` — streaming multipart parser for 500 MB uploads
- `papaparse` + `@types/papaparse` — robust CSV parsing
- `openai` — `text-embedding-3-small` embeddings via OpenAI SDK
- `@anthropic-ai/sdk` — Claude claude-sonnet-4-6 with streaming for agent reasoning
- `sass` (already installed) — SCSS pre-processor

**Storage**: In-memory vector store (`globalThis.__vectorStore` singleton); uploaded CSVs saved to `./uploads/<timestamp>-<filename>`

**Testing**: Jest + React Testing Library — every module folder includes a `.test.ts` / `.test.tsx` file; `npm test` runs the full suite

**Target Platform**: Local Node.js server (`npm run dev` → `next dev`)

**Project Type**: Web application (single Next.js project, Pages Router)

**Performance Goals**:
- Ingest a 500-row CSV (including embedding API calls) in < 60 s
- First streaming token visible in the UI within 2 s of sending a question
- Full agent response complete within 10 s per query

**Constraints**:
- 500 MB upload limit enforced by busboy `limits.fileSize`; client-side rejection before that
- Single-user, local-only — no auth, no multi-session handling
- In-memory store is wiped on server restart (acceptable per spec)

**Scale/Scope**: Single user, local machine, CSVs up to 500 MB

## Branch Strategy

All work for the CSV flow is isolated in a parent feature branch. Individual concern branches are cut from it — never directly from `main`. Each branch is merged back into `feature/csv-flow` via PR, and `feature/csv-flow` is merged into `main` when the full flow is complete.

```
main
├── feature/csv-flow/specs               ← spec documents only: specs/002-chat-ui-csv-upload/
│                                           merges to main before implementation begins
│
└── feature/csv-flow                         ← parent: all CSV flow work merges here
    │                                           (cut from main after specs branch merges)
    ├── feature/csv-flow/setup               ← project setup: deps install, jest config,
    │                                           globals.scss, _app.tsx MUI wiring
    │
    ├── feature/csv-flow/csv-parser          ← lib/csv-normaliser/ + lib/bid-item-formatter/
    │                                           (normalisation logic + unit tests)
    │
    ├── feature/csv-flow/ingest-api          ← pages/api/ingest.ts + busboy upload handler
    │                                           (depends on: csv-parser)
    │
    ├── feature/csv-flow/openai-embeddings   ← lib/embeddings/ + lib/vector-store/
    │                                           (OpenAI SDK integration + cosine similarity)
    │                                           (depends on: csv-parser)
    │
    ├── feature/csv-flow/agent               ← lib/analytics/ + lib/agent/ + pages/api/chat.ts
    │                                           (Claude orchestrator + tool routing + SSE handler)
    │                                           (depends on: openai-embeddings, ingest-api)
    │
    ├── feature/csv-flow/file-upload         ← components/FileUpload/ (UI only, no backend dep)
    │
    ├── feature/csv-flow/chat-input          ← components/ChatInput/ + hooks/useChat/
    │                                           (SSE client hook + input component)
    │
    └── feature/csv-flow/chat-interface      ← components/ChatInterface/ + MessageList/
                                                + MessageBubble/ + pages/chat/index.tsx
                                                + pages/index.tsx (redirect → /chat)
                                                (depends on: chat-input, file-upload)
```

**Merge order** (respects dependencies):
1. `specs` → merge to `main` ← **first: spec review gate**
2. `setup` → merge to `feature/csv-flow`
3. `csv-parser` → merge to `feature/csv-flow`
4. `file-upload` → merge to `feature/csv-flow` (parallel with csv-parser)
5. `ingest-api` + `openai-embeddings` → merge to `feature/csv-flow` (after csv-parser)
6. `chat-input` → merge to `feature/csv-flow`
7. `agent` → merge to `feature/csv-flow` (after ingest-api + openai-embeddings)
8. `chat-interface` → merge to `feature/csv-flow` (after chat-input + file-upload)
9. `feature/csv-flow` → merge to `main`

## Constitution Check

Project constitution is an unpopulated template — no project-specific gates apply. Applying standard engineering judgment:
- No over-engineering: in-memory store, no external services, no auth layer
- Tests required for all lib modules (pure logic) and all components (RTL render + interaction); API routes tested via integration scenario in quickstart

## Project Structure

### Documentation (this feature)

```text
specs/002-chat-ui-csv-upload/
├── plan.md              # This file
├── research.md          # Phase 0 findings
├── data-model.md        # Phase 1 entity definitions
├── quickstart.md        # Phase 1 validation guide
├── contracts/
│   ├── api-ingest.md    # POST /api/ingest contract
│   └── api-chat.md      # POST /api/chat contract
└── tasks.md             # /speckit-tasks output (not yet created)
```

### Source Code

```text
src/
├── pages/
│   ├── index.tsx                             # Redirects to /chat (getServerSideProps)
│   ├── chat/
│   │   └── index.tsx                         # Chat page — mounts <ChatInterface />
│   ├── _app.tsx                              # (existing) — add MUI ThemeProvider + CssBaseline
│   ├── _document.tsx                         # (existing)
│   └── api/
│       ├── ingest.ts                         # POST /api/ingest (multipart)
│       └── chat.ts                           # POST /api/chat (SSE streaming)
├── components/
│   ├── ChatInterface/
│   │   ├── index.tsx                         # Component implementation
│   │   ├── model.ts                          # Props and local state types
│   │   ├── chat-interface.component.scss
│   │   └── ChatInterface.test.tsx            # Jest + React Testing Library
│   ├── MessageList/
│   │   ├── index.tsx
│   │   ├── model.ts
│   │   ├── message-list.component.scss
│   │   └── MessageList.test.tsx
│   ├── MessageBubble/
│   │   ├── index.tsx
│   │   ├── model.ts
│   │   ├── message-bubble.component.scss
│   │   └── MessageBubble.test.tsx
│   ├── ChatInput/
│   │   ├── index.tsx
│   │   ├── model.ts
│   │   ├── chat-input.component.scss
│   │   └── ChatInput.test.tsx
│   └── FileUpload/
│       ├── index.tsx
│       ├── model.ts
│       ├── file-upload.component.scss
│       └── FileUpload.test.tsx
├── hooks/
│   └── useChat/
│       ├── index.ts                          # WS lifecycle + message state hook
│       ├── model.ts                          # WsMessage, ChatState types
│       └── useChat.test.ts                   # Jest (mock WebSocket)
├── lib/
│   ├── csv-normaliser/
│   │   ├── index.ts                          # Column snake_case + cell normalisation
│   │   ├── model.ts                          # NormalisedRow, ColumnMapping types
│   │   └── csv-normaliser.test.ts
│   ├── bid-item-formatter/
│   │   ├── index.ts                          # BidItem → human-readable text chunk
│   │   ├── model.ts                          # FormatterOptions type
│   │   └── bid-item-formatter.test.ts
│   ├── embeddings/
│   │   ├── index.ts                          # OpenAI text-embedding-3-small batch calls
│   │   ├── model.ts                          # EmbeddingBatch, EmbeddingResult types
│   │   └── embeddings.test.ts
│   ├── vector-store/
│   │   ├── index.ts                          # In-memory cosine similarity (globalThis singleton)
│   │   ├── model.ts                          # VectorEntry, VectorStoreState types
│   │   └── vector-store.test.ts
│   ├── analytics/
│   │   ├── index.ts                          # Deterministic: top items, outliers, summaries
│   │   ├── model.ts                          # OutlierResult, QuantitySummary types
│   │   └── analytics.test.ts
│   └── agent/
│       ├── index.ts                          # Claude orchestrator with streaming
│       ├── model.ts                          # AgentTool, ToolResult types
│       └── agent.test.ts
└── styles/
    └── globals.scss                          # Global resets / CSS variables

uploads/                                      # Saved CSV files (git-ignored)
```

**Structure Decision**: Every module lives in its own folder containing `index.ts[x]` (implementation), `model.ts` (TypeScript `type` aliases for that module only), an optional `.component.scss` (components only), and a `.test.ts[x]` (Jest). There is no shared `src/types/` folder — types are co-located with the code that owns them. Cross-module types are imported directly from the owning module's `model.ts`.

## Testing Setup (Jest + React Testing Library)

**Test dependencies**:
```bash
npm install --save-dev jest @types/jest jest-environment-jsdom \
  @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event ts-jest
```

**Jest config** (`jest.config.ts` at project root):
- `preset: 'ts-jest'`
- `testEnvironment: 'jsdom'` for component tests; `'node'` for lib/ws tests
- `moduleNameMapper` to handle SCSS imports (map to `identity-obj-proxy`)
- `setupFilesAfterFramework: ['@testing-library/jest-dom']`

**Test file naming**: `{TargetName}.test.tsx` for components, `{target-name}.test.ts` for lib/hooks/ws modules — always co-located in the same folder as the implementation.

**Scope per layer**:

| Layer | Test focus |
|-------|-----------|
| `lib/csv-normaliser` | Header normalisation, cell numeric parsing, mixed-value preservation, null handling |
| `lib/analytics` | Outlier detection accuracy, top-N sort, quantity aggregation |
| `lib/vector-store` | Cosine similarity correctness, top-K ranking, empty-store behaviour |
| `lib/bid-item-formatter` | Text chunk output for complete/partial/empty BidItem |
| `hooks/useChat` | Mock fetch/stream: token accumulation, `done` clears `isStreaming`, `error` shows message |
| `api/chat` | Mock agent: SSE token sequence, `no_data` when store empty, 400 on empty question |
| `components/*` | RTL: renders without crash, key interactions (send button, file picker, loading state) |
| `lib/embeddings` | Mock OpenAI client: batch size respected, result shape |
| `lib/agent` | Mock Anthropic client: tool routing (analytics vs vector), no-data path |

## SCSS Convention

Every component stylesheet follows this pattern (BEM-style, parent-scoped):

```scss
// chat-input.component.scss
.chat-input-component {
  // root layout

  &__text-field { … }
  &__send-button { … }
  &__loading-indicator { … }
}
```

- Root class: `{component-name}-component` (kebab-case)
- Child elements: `&__element-name` nested under root
- No global class leakage — all rules scoped under the wrapper

## Column Normalisation Rules (`lib/csv-normaliser.ts`)

**Header normalisation** (applied to every CSV column name):
1. `.trim()`
2. Split camelCase boundaries: insert `_` between a lowercase letter followed by an uppercase letter → `/([a-z])([A-Z])/g` → `"$1_$2"`
3. Replace one or more whitespace chars with `_` → `/\s+/g` → `"_"`
4. `.toLowerCase()`

Examples:
- `"ITEM NO"` → `"item_no"`
- `"unitPrice"` → `"unit_price"`
- `"TotalCost"` → `"total_cost"`
- `"Unit Price ($)"` → `"unit_price_($)"`
- `"ItemNumber"` → `"item_number"`

**Cell value normalisation** (applied to every cell):
1. If empty / whitespace-only → `null`
2. Strip `$` and `,`, then attempt `parseFloat`:
   - Result is finite number → store as `number` (US numeric format)
   - Result is `NaN` (mixed alphanumeric, e.g. `"100 LF"`, `"202-0100"`) → keep original string `.trim()`
3. Pure string with no numeric content → `.trim()`

**Canonical field detection** (best-effort, post-normalisation):

| Normalised header matches | Canonical field |
|--------------------------|-----------------|
| `item_no`, `item_number`, `item` | `item_number` |
| `description`, `desc`, `item_desc` | `description` |
| `qty`, `quantity` | `quantity` |
| `unit_price`, `unit_prc`, `uprice` | `unit_price` |
| `total`, `ext_amt`, `amount`, `total_cost` | `total_cost` |
| `unit`, `uom` | `unit` |
| anything else | preserved in `extra_fields` |

## Text Chunk Format (for embeddings)

Each `BidItem` is serialised to a human-readable string before embedding:

```
Item Number: 101
Description: Concrete Pipe
Quantity: 100 LF
Unit Price: $50.00
Total Price: $5,000.00
```

Fields missing from the data are omitted from the chunk. Unknown/extra fields are appended as `{normalised_key}: {value}`.

## SSE Architecture

Agent answers are streamed token-by-token using **Server-Sent Events** via a standard Next.js API route. No custom server required — `npm run dev` stays as `next dev`.

### How it works

```
POST /api/chat  { question }
     │
     └── res.setHeader('Content-Type', 'text/event-stream')
         res.write('data: {"type":"token","content":"..."}\n\n')
         res.write('data: {"type":"done"}\n\n')
         res.end()
```

The client sends `POST /api/chat` with `{ question }` in the body and reads the streaming response body with `response.body.getReader()`. Each `data: {...}\n\n` line is a JSON-encoded `SseEvent`.

### `SseEvent` Type

```ts
// Owned by: src/hooks/useChat/model.ts
type SseEvent =
  | { type: 'token';   content: string }
  | { type: 'done' }
  | { type: 'error';   message: string }
  | { type: 'no_data'; message: string }
```

### `useChat` Hook (`src/hooks/useChat/index.ts`)

Manages per-question fetch + stream lifecycle and exposes the message list to `ChatInterface`:

- `sendQuestion(q: string)` issues `POST /api/chat` and reads the response body stream
- Parses SSE lines (`data: {...}`) from the `ReadableStream` reader
- On `token`: appends content to the in-progress agent `Message`
- On `done`: marks the message complete, sets `isStreaming: false`
- On `error` / `no_data`: appends a system message, sets `isStreaming: false`
- Exposes: `messages: Message[]`, `sendQuestion`, `isStreaming: boolean`

No persistent connection. Each question is a fresh HTTP request — no reconnect logic needed.

## Agent Routing Logic

```
User question
     │
     ▼
Claude claude-sonnet-4-6 (orchestrator) selects tool
     │
     ├── Analytical intent  →  lib/analytics.ts (deterministic, no LLM in calculation)
     │       • get_top_expensive_items(n: number)
     │       • detect_price_outliers(threshold_stddev?: number)
     │       • summarize_quantities()
     │       • get_average_unit_price(filter?: string)
     │
     └── Semantic intent  →  lib/vector-store.ts (cosine similarity)
             • query_bid_data(question: string, topK?: number)
```

Analytical tools compute results directly on `BidItem[]`. The LLM only formats the final natural-language response from tool output — it never performs calculations.

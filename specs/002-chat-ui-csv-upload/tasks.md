# Tasks: Chat UI with CSV Upload

**Input**: Design documents from `specs/002-chat-ui-csv-upload/`

**Branch strategy**: `feature/csv-flow` (parent) → sub-branches per concern → merge back to `feature/csv-flow` → merge to `main`

**Tests**: Included — Jest + React Testing Library explicitly requested in spec.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

---

## Phase 1: Setup — `feature/csv-flow/setup`

**Purpose**: Install dependencies, configure tooling, scaffold entry points. Must complete before any other branch starts.

- [ ] T000 Create `feature/csv-flow/specs` branch from `main`; commit all `specs/002-chat-ui-csv-upload/` artifacts; merge to `main` before cutting any implementation branch
- [ ] T001 Create `feature/csv-flow` parent branch from `main` (after specs branch is merged) and `feature/csv-flow/setup` sub-branch from it
- [ ] T002 Install production dependencies: `npm install @mui/material @mui/icons-material @emotion/react @emotion/styled busboy papaparse openai @anthropic-ai/sdk`
- [ ] T003 [P] Install dev dependencies: `npm install --save-dev @types/busboy @types/papaparse jest @types/jest jest-environment-jsdom ts-jest @testing-library/react @testing-library/jest-dom @testing-library/user-event identity-obj-proxy`
- [ ] T004 Create `jest.config.ts` at project root — `preset: ts-jest`, `testEnvironment: jsdom`, `moduleNameMapper` for SCSS → `identity-obj-proxy`, `setupFilesAfterFramework: ['@testing-library/jest-dom']`
- [ ] T005 [P] Add `"test": "jest"` and `"test:watch": "jest --watch"` scripts to `package.json`
- [ ] T008 [P] Update `src/pages/_app.tsx` — wrap with MUI `ThemeProvider` (default theme) and `CssBaseline`
- [ ] T009 [P] Replace `src/styles/globals.css` with `src/styles/globals.scss` — global resets and CSS variables; update `_app.tsx` import
- [ ] T010 [P] Add `uploads/` to `.gitignore`; create `uploads/.gitkeep` so directory exists in repo
- [ ] T011 [P] Create `.env.example` with `OPENAI_API_KEY=` and `ANTHROPIC_API_KEY=` and optional `UPLOAD_DIR=./uploads`

**Checkpoint**: `npm run dev` starts the server; `npm test` runs with zero tests passing; MUI renders in browser.

---

## Phase 2: Foundational — Type Models (all `model.ts` files)

**Purpose**: All `model.ts` files that own TypeScript `type` aliases. These are prerequisites for implementation tasks across all branches. All tasks in this phase are parallelisable.

**⚠️ CRITICAL**: These model files must exist before any implementation imports from them.

- [ ] T012 [P] Create `src/lib/csv-normaliser/model.ts` — declare `BidItem`, `NormalisedRow`, `ColumnMapping` types
- [ ] T013 [P] Create `src/lib/bid-item-formatter/model.ts` — declare `FormatterOptions` type
- [ ] T014 [P] Create `src/lib/embeddings/model.ts` — declare `EmbeddingInput`, `EmbeddingResult` types
- [ ] T015 [P] Create `src/lib/vector-store/model.ts` — declare `VectorEntry`, `DatasetMetadata`, `VectorStoreState` types
- [ ] T016 [P] Create `src/lib/analytics/model.ts` — declare `OutlierResult`, `QuantitySummary` types
- [ ] T017 [P] Create `src/lib/agent/model.ts` — declare `AgentTool`, `ToolResult`, `AgentChatResponse` types
- [ ] T018 [P] Create `src/hooks/useChat/model.ts` — declare `Message`, `SseEvent`, `ChatState` types
- [ ] T020 [P] Create `src/components/FileUpload/model.ts` — declare `FileUploadProps` type
- [ ] T021 [P] Create `src/components/ChatInput/model.ts` — declare `ChatInputProps` type
- [ ] T022 [P] Create `src/components/MessageBubble/model.ts` — declare `MessageBubbleProps` type
- [ ] T023 [P] Create `src/components/MessageList/model.ts` — declare `MessageListProps` type
- [ ] T024 [P] Create `src/components/ChatInterface/model.ts` — declare `ChatInterfaceProps` type

**Checkpoint**: All model files exist; TypeScript compiler resolves imports without errors (`npx tsc --noEmit`).

---

## Phase 3: User Story 1 — Upload CSV and Trigger Ingestion (Priority: P1) 🎯 MVP

**Goal**: Estimator can upload a CSV, see a loading state, and receive a confirmation message showing filename and record count. The file is saved to disk and the vector store is populated.

**Independent Test**: Upload the provided DOT bid CSV → confirm message appears with correct record count → verify `./uploads/` contains a timestamped copy → `npm test` passes for T025–T035.

**Branch mapping**:
- `feature/csv-flow/csv-parser` → T025–T030
- `feature/csv-flow/openai-embeddings` → T031–T036
- `feature/csv-flow/ingest-api` → T037–T043 *(depends on csv-parser and openai-embeddings merging first)*

### CSV Normaliser — `feature/csv-flow/csv-parser`

- [ ] T025 [P] [US1] Implement `src/lib/csv-normaliser/index.ts` — `normaliseHeader(raw: string): string` (trim → camelCase split via `/([a-z])([A-Z])/g`→`$1_$2` → whitespace→`_` → toLowerCase), `normaliseCell(raw: string): string | number | null` (null-if-empty, strip `$`/`,` then parseFloat, keep mixed as trimmed string), `detectCanonicalField(snakeKey: string): string | null`, `normaliseRow(rawRow: Record<string, string>): BidItem`
- [ ] T026 [P] [US1] Write `src/lib/csv-normaliser/csv-normaliser.test.ts` — assert `"ITEM NO"` → `"item_no"`, `"unitPrice"` → `"unit_price"`, `"TotalCost"` → `"total_cost"`, `"ItemNumber"` → `"item_number"`, `"$1,234.56"` → `1234.56`, `"100 LF"` stays `"100 LF"`, `"  hello  "` → `"hello"`, empty string → `null`, canonical field detection for known headers
- [ ] T027 [P] [US1] Implement `src/lib/bid-item-formatter/index.ts` — `formatBidItem(item: BidItem): string` produces the human-readable text chunk (Item Number, Description, Quantity + unit, Unit Price with `$`, Total Price with `$`; omit null fields; append extra_fields as `key: value`)
- [ ] T028 [P] [US1] Write `src/lib/bid-item-formatter/bid-item-formatter.test.ts` — full item produces correct chunk, missing fields are omitted, extra_fields are appended

### Embeddings & Vector Store — `feature/csv-flow/openai-embeddings`

- [ ] T029 [P] [US1] Implement `src/lib/embeddings/index.ts` — `generateEmbeddings(texts: string[]): Promise<number[][]>` using `openai.embeddings.create({ model: 'text-embedding-3-small', input: batch })` in batches of 100; returns L2-normalised vectors
- [ ] T030 [P] [US1] Write `src/lib/embeddings/embeddings.test.ts` — mock OpenAI client: batches of >100 rows make multiple calls; result length matches input length; vectors are L2-normalised
- [ ] T031 [P] [US1] Implement `src/lib/vector-store/index.ts` — `VectorStore` class with `load(entries, metadata)` (replaces store), `search(queryVector, topK): VectorEntry[]` (dot-product cosine on pre-normalised vectors), `getTopByTotalCost(n): BidItem[]`, `detectOutliers(thresholdStddev): OutlierResult[]` (group by description cluster ≥3 items), `summarize(): QuantitySummary`, `isEmpty(): boolean`; export `getStore(): VectorStore` as `globalThis` singleton
- [ ] T032 [P] [US1] Write `src/lib/vector-store/vector-store.test.ts` — cosine similarity returns correct top-K; empty store returns `[]`; `detectOutliers` flags item at >2σ and ignores cluster of <3; `summarize` totals match fixture data

### Ingest API & FileUpload UI — `feature/csv-flow/ingest-api`

- [ ] T033 [US1] Implement `src/pages/api/ingest.ts` — disable bodyParser (`export const config`), parse multipart with `busboy` (limit 500 MB, return 413 on overflow), save file to `./uploads/<ISO>-<filename>` via `fs.createWriteStream`, parse saved file with `papaparse`, call `normaliseRow` per row, call `generateEmbeddings`, call `getStore().load()`; on embedding error roll back store and return 500; return `IngestionResult` JSON on success
- [ ] T034 [P] [US1] Implement `src/components/FileUpload/index.tsx` — hidden `<input type="file" accept=".csv">` triggered by MUI `Button`; client-side validation: reject non-CSV (file name extension check) and files >500 MB before fetch; `POST` to `/api/ingest` with `FormData`; call `onUpload(result)` on success or `onError(message)` on failure; expose `isLoading` state
- [ ] T035 [P] [US1] Create `src/components/FileUpload/file-upload.component.scss` — `.file-upload-component { &__button {} &__error {} &__loading {} }`
- [ ] T036 [P] [US1] Write `src/components/FileUpload/FileUpload.test.tsx` — RTL: non-CSV file shows error and does not call `onUpload`; file >500 MB shows error; valid CSV calls `onUpload` with result; loading state disables button during fetch

**Checkpoint**: Upload the DOT bid CSV → confirmation message in chat with record count → `./uploads/` has the file → `npm test` passes for T026, T028, T030, T032, T036.

---

## Phase 4: User Story 2 — Ask Questions and See Agent Responses (Priority: P1)

**Goal**: After ingestion, estimator types a question, sees it appear in the chat, and receives a streamed agent response that builds token-by-token. Send button is disabled while streaming. Agent uses the correct tool (analytics vs vector search) based on question intent.

**Independent Test**: Ingest CSV → type "What are the top 5 most expensive bid items?" → first token appears within 2 s → full response within 15 s → response is accurate → `npm test` passes for T038–T049.

**Branch mapping**:
- `feature/csv-flow/agent` → T038–T043
- `feature/csv-flow/chat-input` → T044–T051

### Agent & SSE Handler — `feature/csv-flow/agent`

- [ ] T038 [P] [US2] Implement `src/lib/analytics/index.ts` — `getTopExpensiveItems(n: number, items: BidItem[]): BidItem[]` (sort by total_cost desc), `detectPriceOutliers(items: BidItem[], threshold?: number): OutlierResult[]` (mean/stddev per description cluster, exclude clusters <3), `summarizeQuantities(items: BidItem[]): QuantitySummary`, `getAverageUnitPrice(items: BidItem[], filter?: string): number`
- [ ] T039 [P] [US2] Write `src/lib/analytics/analytics.test.ts` — top-5 sort matches manual rank; outlier at >2σ is flagged; item within range not flagged; cluster <3 items excluded; quantity totals match fixture
- [ ] T040 [US2] Implement `src/lib/agent/index.ts` — `runAgent(question: string, onToken: (t: string) => void): Promise<void>` using `@anthropic-ai/sdk` with streaming; define 5 tools (`get_top_expensive_items`, `detect_price_outliers`, `summarize_quantities`, `get_average_unit_price`, `query_bid_data`); execute tool calls against `analytics` or `getStore().search()`; stream final text delta via `onToken`; if store is empty return no-data message via `onToken` without calling Claude
- [ ] T041 [US2] Write `src/lib/agent/agent.test.ts` — mock Anthropic SDK: analytical question routes to analytics tool; semantic question routes to `query_bid_data`; empty store path returns no-data message without API call; `onToken` is called with streamed content
- [ ] T042 [US2] Implement `src/pages/api/chat.ts` — set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`); validate `{ question }` body (return 400 if missing/empty); call `runAgent(question, token => res.write(\`data: ${JSON.stringify({ type: 'token', content: token })}\n\n\`))`; on completion write `data: {"type":"done"}\n\n` and call `res.end()`; on error write `data: {"type":"error",...}\n\n`; if store empty write `data: {"type":"no_data",...}\n\n`
- [ ] T043 [US2] Write `src/pages/api/chat.test.ts` — mock agent: SSE token events delivered in order; `done` event sent after last token; `no_data` event when store empty; `error` event on agent throw; 400 returned on missing question

### Chat Input & Message Rendering — `feature/csv-flow/chat-input`

- [ ] T044 [P] [US2] Implement `src/hooks/useChat/index.ts` — `useChat()` hook: `sendQuestion(q: string)` calls `fetch('/api/chat', { method: 'POST', body: JSON.stringify({ question: q }) })`; reads `response.body` with `ReadableStream` reader + `TextDecoder`; parses `data: {...}` SSE lines; on `token` appends content to in-progress `Message`; on `done` marks message complete and sets `isStreaming: false`; on `error`/`no_data` appends system message; expose `{ messages, sendQuestion, isStreaming }`
- [ ] T045 [P] [US2] Write `src/hooks/useChat/useChat.test.ts` — mock fetch with streaming response body: tokens accumulate into single message; `done` sets `isStreaming` to false; `error` appends error message; `no_data` appends prompt-to-upload system message; concurrent `sendQuestion` calls blocked while `isStreaming`
- [ ] T046 [P] [US2] Implement `src/components/ChatInput/index.tsx` — MUI `TextField` + `IconButton` (Send); disabled when `value.trim() === ''` OR `isStreaming`; Enter key fires `onSend` when not disabled; MUI `CircularProgress` shown when `isStreaming`
- [ ] T047 [P] [US2] Create `src/components/ChatInput/chat-input.component.scss` — `.chat-input-component { &__text-field {} &__send-button {} &__spinner {} }`
- [ ] T048 [P] [US2] Write `src/components/ChatInput/ChatInput.test.tsx` — RTL: send button disabled when input empty; send button disabled when `isStreaming`; Enter fires `onSend`; spinner visible when `isStreaming`
- [ ] T049 [P] [US2] Implement `src/components/MessageBubble/index.tsx` — renders `user`, `agent`, `system` roles with distinct visual treatment; `agent` role renders markdown via `dangerouslySetInnerHTML` with simple md-to-html conversion or `white-space: pre-wrap`; `system` role styled as neutral info banner
- [ ] T050 [P] [US2] Create `src/components/MessageBubble/message-bubble.component.scss` — `.message-bubble-component { &--user {} &--agent {} &--system {} &__content {} }`
- [ ] T051 [P] [US2] Write `src/components/MessageBubble/MessageBubble.test.tsx` — RTL: user message renders with role class; agent message renders content; system message renders with distinct style

**Checkpoint**: Ingest CSV → type question → first token appears → response streams in → `npm test` passes for T039, T041, T043, T045, T048, T051.

> Note: T043 (`api/chat.test.ts`) should use `jest-environment-node` — add `@jest-environment node` docblock at the top of the test file.

---

## Phase 5: User Story 3 — Conversation History & Full UI Assembly (Priority: P2)

**Goal**: All messages remain visible via scroll; newest auto-scrolls into view; input is pinned at bottom. Full chat interface is assembled and mounted on the home page.

**Independent Test**: Send 10+ messages → scroll up → all messages visible → newest auto-scrolled into view → `npm test` passes for T052–T058.

**Branch**: `feature/csv-flow/chat-interface`

- [ ] T052 [P] [US3] Implement `src/components/MessageList/index.tsx` — renders list of `<MessageBubble>` components; `useEffect` + `useRef` auto-scrolls container to bottom when `messages` length changes; scrollable container with `overflow-y: auto`
- [ ] T053 [P] [US3] Create `src/components/MessageList/message-list.component.scss` — `.message-list-component { &__scroll-container {} &__messages {} }`
- [ ] T054 [P] [US3] Write `src/components/MessageList/MessageList.test.tsx` — RTL: renders all messages; `scrollIntoView` is called when new message appended; older messages remain in DOM when list grows
- [ ] T055 [US3] Implement `src/components/ChatInterface/index.tsx` — composes `<MessageList>`, `<FileUpload>`, `<ChatInput>`; uses `useChat()` hook for messages + `sendQuestion` + `isStreaming`; tracks `dataLoaded: boolean` state (false on mount, true after first successful upload); on `onUpload` success → if `!dataLoaded` append "Uploaded '{filename}' — {N} items ingested", else append "Dataset replaced: '{filename}' — {N} items ingested"; set `dataLoaded = true`; on `onError` → append system error message; full-height flex layout with input pinned at bottom
- [ ] T056 [US3] Create `src/components/ChatInterface/chat-interface.component.scss` — `.chat-interface-component { &__message-area {} &__input-row {} &__upload-section {} }`
- [ ] T057 [US3] Write `src/components/ChatInterface/ChatInterface.test.tsx` — RTL: full render without crash; file upload triggers confirmation message; question input fires sendQuestion; loading state visible during streaming
- [ ] T058 [US3] Replace `src/pages/index.tsx` content — mount `<ChatInterface />` as the sole page content; remove default Next.js boilerplate

**Checkpoint**: Open browser → upload CSV → ask multiple questions → scroll up → all messages visible → `npm test` passes for T054, T057.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalise documentation, validate end-to-end, ensure clean lint and test suite.

- [ ] T059 [P] Create `README.md` at project root — setup instructions (clone → npm install → .env.local → npm run dev), environment variable table, `npm test` command, branch strategy summary, architecture decisions summary
- [ ] T060 [P] Add `uploads/` entry to `.gitignore` (ensure it persists after T010)
- [ ] T061 [P] Verify `jest.config.ts` handles both `jsdom` (components/hooks) and `node` (lib/ws) environments — add `testEnvironmentOptions` or per-file `@jest-environment` docblock annotations where needed
- [ ] T062 Run all quickstart.md validation scenarios manually end-to-end (upload, Q&A, outlier detection, semantic search, no-data, invalid file, oversized file, scroll history)
- [ ] T063 [P] Run `npm test -- --coverage` and confirm all lib modules and components have test coverage
- [ ] T064 [P] Run `npm run lint` (Biome) and fix any reported issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately on `feature/csv-flow/setup`
- **Phase 2 (Model files)**: Depends on Phase 1 merge — all T012–T024 parallelisable on same branch or separate branches
- **Phase 3 (US1)**: Depends on Phase 2 merge — csv-parser and openai-embeddings branches can run in parallel; ingest-api branch waits for both to merge
- **Phase 4 (US2)**: Depends on Phase 3 merge — agent and chat-input branches can run in parallel
- **Phase 5 (US3)**: Depends on Phase 4 merge — single chat-interface branch
- **Phase 6 (Polish)**: Depends on Phase 5 merge

### Branch Merge Order

```
feature/csv-flow/setup          → merge to feature/csv-flow
feature/csv-flow/csv-parser     → merge to feature/csv-flow  ┐ parallel
feature/csv-flow/openai-emb.    → merge to feature/csv-flow  ┘
feature/csv-flow/ingest-api     → merge to feature/csv-flow  (after csv-parser + openai-emb.)
feature/csv-flow/agent          → merge to feature/csv-flow  ┐ parallel
feature/csv-flow/chat-input     → merge to feature/csv-flow  ┘
feature/csv-flow/chat-interface → merge to feature/csv-flow  (after agent + chat-input)
feature/csv-flow                → merge to main
```

### Parallel Opportunities Within Phases

**Phase 3**: T025–T028 (csv-parser branch) run fully in parallel with T029–T032 (openai-embeddings branch)

**Phase 4**: T038–T043 (agent branch) run fully in parallel with T044–T051 (chat-input branch)

**Phase 2**: All 13 model file tasks (T012–T024) are parallel — no task depends on another

---

## Parallel Execution Examples

### Phase 3 — CSV Normaliser (all parallel within csv-parser branch)
```
Task T025: Implement src/lib/csv-normaliser/index.ts
Task T027: Implement src/lib/bid-item-formatter/index.ts
Task T026: Write src/lib/csv-normaliser/csv-normaliser.test.ts  ← after T025
Task T028: Write src/lib/bid-item-formatter/bid-item-formatter.test.ts  ← after T027
```

### Phase 4 — Agent + Chat Input (two branches in parallel)
```
Branch A (agent):      T038 → T039 → T040 → T041 → T042 → T043   (api/chat.ts SSE)
Branch B (chat-input): T044 → T045 → T046 → T047 → T048 → T049 → T050 → T051
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Model files
3. Complete Phase 3: US1 (csv-parser + openai-embeddings + ingest-api)
4. **STOP and VALIDATE**: Upload CSV → confirm file saved → confirm vector store populated
5. US1 is independently demonstrable without any chat UI

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 (US1) → CSV ingestion works end-to-end → **MVP demo**
3. Phase 4 (US2) → Agent Q&A with streaming → **Core feature complete**
4. Phase 5 (US3) → Full UI assembled with history scroll → **Feature complete**
5. Phase 6 → Polish → **Submission ready**

---

## Notes

- `[P]` = different files, no blocking dependency — safe to implement simultaneously
- `[US1]`, `[US2]`, `[US3]` = traceability to spec user story
- Every `model.ts` task (Phase 2) must be committed before any `index.ts` that imports from it
- Test tasks should be written before or alongside their implementation (`test` → `implement` → verify test passes)
- Each phase checkpoint must pass before the next branch is cut
- `npm test` must pass at every checkpoint before merging a branch

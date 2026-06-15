# Tasks: PDF Upload and Chat Integration

**Input**: Design documents from `specs/003-pdf-upload/`

**Branch strategy**: `feature/pdf-upload` (parent) → sub-branches per concern → merge back → merge to `main`

**Tests**: Written first (TDD) — all test files already committed to `feature/pdf-upload` and `feature/pdf-upload-specs`. Tasks marked `[x]` below are complete. Implementation tasks must make those tests pass.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

---

## Phase 1: Setup — `feature/pdf-upload/setup`

**Purpose**: Install new dependencies and scaffold upload directory. Must complete before any other branch starts.

- [X] T001 Install new production dependencies: `npm install pdfjs-dist pdf-lib`
- [X] T002 [P] Add `uploads-pdf/` to `.gitignore`; create `uploads-pdf/.gitkeep` so directory exists in repo
- [X] T003 [P] Add `PDF_UPLOAD_DIR=./uploads-pdf` to `.env.example`

**Checkpoint**: `npm install` completes without errors; `npm test` still passes all existing CSV tests; `uploads-pdf/.gitkeep` present in repo.

---

## Phase 2: Foundational — Type Model Files

**Purpose**: All `model.ts` files that own TypeScript `type` aliases. These are prerequisites for every implementation task that follows. All tasks in this phase are parallelisable.

**⚠️ CRITICAL**: These model files must exist before any implementation imports from them.

- [X] T004 [P] Update `src/lib/vector-store/model.ts` — add `PdfVectorEntry` and `PdfDatasetMetadata` types; rename `VectorStoreState.entries` → `csvEntries`, `metadata` → `csvMetadata`; add `pdfEntries: PdfVectorEntry[]` and `pdfMetadata: PdfDatasetMetadata | null`
- [X] T005 [P] Create `src/lib/pdf-extractor/model.ts` — declare `ExtractedPage` type: `{ page, sheet, text, extractionMethod: 'native'|'vision', skipped, warning }` (data-model.md)
- [X] T006 [P] Create `src/lib/pdf-chunker/model.ts` — declare `ContentChunk` type: `{ id, page, sheet, section, text, extractionMethod: 'native'|'vision' }` (data-model.md)
- [X] T007 [P] Create `src/components/PdfUpload/model.ts` — declare `PdfUploadProps` type (`onUpload`, `onError`, `disabled`) and `PdfIngestionResult` type (`filename`, `page_count`, `chunk_count`, `native_pages`, `vision_pages`, `skipped_pages`, `warnings`) (plan.md §PdfUpload)

**Checkpoint**: All four model files exist; `npx tsc --noEmit` resolves all imports without errors.

---

## Phase 3: User Story 1 — Upload PDF and Trigger Ingestion (Priority: P1) 🎯 MVP

**Goal**: Estimator uploads a PDF, sees a loading state, and receives a confirmation message with filename and chunk count. The file is saved to `uploads-pdf/` and the PDF partition of the vector store is populated. CSV data (if any) is unaffected.

**Independent Test**: Upload the provided plan-set PDF → confirmation message appears in chat with chunk count → `./uploads-pdf/` contains a timestamped copy → `npm test` passes for T008–T021.

**Branch mapping**:
- `feature/pdf-upload/vector-store` → T008–T010 *(blocks everything else)*
- `feature/pdf-upload/pdf-extractor` → T011–T012 *(parallel with pdf-chunker; depends on vector-store merge)*
- `feature/pdf-upload/pdf-chunker` → T013–T014 *(parallel with pdf-extractor; depends on vector-store merge)*
- `feature/pdf-upload/pdf-upload-component` → T015–T017 *(parallel with extractor + chunker)*
- `feature/pdf-upload/ingest-pdf-api` → T018–T021 *(depends on vector-store + pdf-extractor + pdf-chunker merging first)*

### Vector Store — `feature/pdf-upload/vector-store`

- [X] T008 [US1] Update `src/lib/vector-store/index.ts` — rename `load()` → `loadCsv()`, `search()` → `searchCsv()`, `getMetadata()` → `getCsvMetadata()`; add `loadPdf(entries, metadata)` (replaces PDF partition only), `searchPdf(queryVector, topK?)` (dot-product over `pdfEntries`), `getPdfMetadata()`, `isCsvLoaded()` (`csvEntries.length > 0`), `isPdfLoaded()` (`pdfEntries.length > 0`); update `isEmpty()` to return `!isCsvLoaded() && !isPdfLoaded()` (plan.md §vector-store modifications)
- [X] T009 [US1] Update `src/pages/api/ingest.ts` — one-line change: `store.load(entries, metadata)` → `store.loadCsv(entries, metadata)`
- [x] T010 [P] [US1] Tests exist: `src/lib/vector-store/vector-store.test.ts` — covers renamed methods, dual-partition coexistence, `loadPdf`/`loadCsv` independence, `searchPdf`, and state flags; verify all pass after T008–T009

### PDF Extractor — `feature/pdf-upload/pdf-extractor`

- [x] T011 [P] [US1] Tests exist: `src/lib/pdf-extractor/pdf-extractor.test.ts` — covers native path, vision fallback, mixed pages, skipped pages, `MIN_NATIVE_CHARS`, sheet/section parsing, GPT-4.1 error → skipped warning
- [X] T012 [P] [US1] Implement `src/lib/pdf-extractor/index.ts` — export `extractPdfPages(filePath: string): Promise<ExtractedPage[]>` and `MIN_NATIVE_CHARS = 200` constant; internal flow: read file with `fs.readFileSync`, load via `pdfjs-dist.getDocument({ data: uint8Array }).promise`; for each page call `page.getTextContent()` and count meaningful chars (`text.replace(/[\s\W]/g, '').length`); if ≥ 200 chars parse `Sheet:` and `Section:` blocks (native path); if < 200 and vision call count < `MAX_VISION_PAGES = 50` use `pdf-lib PDFDocument.load/create/copyPages/save` to isolate the page as base64 PDF then call `openai.chat.completions.create({ model: 'gpt-4.1', ... })`; if vision call count ≥ 50 mark page as skipped with warning "Vision cap of 50 reached"; if both methods yield empty content mark as skipped with per-page warning; pages beyond vision cap or that yield no content are returned with `skipped: true, warning: string` (plan.md §pdf-extractor; FR-018)

### PDF Chunker — `feature/pdf-upload/pdf-chunker`

- [x] T013 [P] [US1] Tests exist: `src/lib/pdf-chunker/pdf-chunker.test.ts` — covers section splits, page-level fallback, long-chunk split (part N/M suffix at 2 000 chars), empty section skipping, `extractionMethod` propagation, UUID v4 assignment, multiple pages
- [X] T014 [P] [US1] Implement `src/lib/pdf-chunker/index.ts` — export `chunkExtractedPages(pages: ExtractedPage[]): ContentChunk[]`; skip pages with `skipped: true`; split each page's `text` on `Section: ` markers; each `Section: <title>\n<content>` block → one `ContentChunk` (drop if content empty after trim); if no `Section:` markers → whole page text as one chunk with `section: null`; chunks > 2 000 chars split at `\n\n` boundaries with section suffix ` (part N/M)`; each chunk inherits `page`, `sheet`, `extractionMethod` from its `ExtractedPage`; assign UUID v4 to each chunk (plan.md §pdf-chunker)

### PdfUpload Component — `feature/pdf-upload/pdf-upload-component`

- [x] T015 [P] [US1] Tests exist: `src/components/PdfUpload/PdfUpload.test.tsx` — covers renders, non-PDF rejection, size rejection (500 MB), loading state, `onUpload` with `PdfIngestionResult`, `onError` on server error, `disabled` prop
- [X] T016 [P] [US1] Implement `src/components/PdfUpload/index.tsx` — hidden `<input type="file" accept=".pdf" data-testid="pdf-file-input">` triggered by MUI `Button`; client-side validation: reject non-PDF (extension + MIME check) and files > 500 MB before fetch; `POST /api/ingest-pdf` with `FormData`; call `onUpload(result: PdfIngestionResult)` on success or `onError(message)` on failure; expose `isLoading` state; button label "Upload PDF" (idle) / "Uploading…" (loading); `CircularProgress size={16}` while loading; SCSS root class `.pdf-upload-component` (plan.md §PdfUpload)
- [X] T017 [P] [US1] Create `src/components/PdfUpload/pdf-upload.component.module.scss` — `.pdf-upload-component { &__button {} &__loading {} &__error {} }` (mirrors `file-upload.component.module.scss` BEM structure)

### Ingest PDF API — `feature/pdf-upload/ingest-pdf-api`

- [x] T018 [US1] Tests exist: `src/pages/api/ingest-pdf.test.ts` — covers 405/400/413/422/500 error cases, happy path 200 with correct `native_pages`/`vision_pages`/`chunk_count`, `store.loadPdf` called with correct entries, rollback on embedding failure
- [X] T019 [US1] Create `src/pages/api/ingest-pdf.ts` — export `config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 600 }`; parse multipart with `busboy` (limit 500 MB, 413 on overflow); save to `./uploads-pdf/<ISO>-<filename>` via `fs.createWriteStream`; validate `.pdf` extension + `application/pdf` MIME (400 on fail); call `extractPdfPages(savedPath)` → 500 if throws; if all pages skipped → 422 with `page_count` + `skipped_pages`; call `chunkExtractedPages(pages)` → `ContentChunk[]`; call `generateEmbeddings(chunks.map(c => c.text))` → on error `store.loadPdf([], emptyMeta)` + 500; build `PdfVectorEntry[]`; call `store.loadPdf(entries, pdfMetadata)`; compute `native_pages`, `vision_pages`, `skipped_pages` from `ExtractedPage[]`; return 200 `PdfIngestionResult` (contracts/api-ingest-pdf.md; plan.md §ingest-pdf.ts)
- [X] T020 [P] [US1] Create `uploads-pdf/` directory on server startup — ensure `fs.mkdirSync(uploadDir, { recursive: true })` at the top of the handler (matches pattern in `api/ingest.ts`)
- [X] T021 [US1] Smoke-test end-to-end: upload a real PDF via `curl -X POST http://localhost:3000/api/ingest-pdf -F "file=@/path/to/test.pdf"` — verify 200 response with `chunk_count > 0` and file exists in `uploads-pdf/`; run `npm test` for all Phase 3 tests

**Checkpoint**: Upload a digitally-generated PDF → confirmation message in chat with chunk count → `./uploads-pdf/` has the file → `npm test` passes for T010, T011–T014 tests, T015–T017 tests, T018–T021.

---

## Phase 4: User Story 2 — Ask Questions About PDF Content (Priority: P1)

**Goal**: After ingesting a PDF, the estimator asks a question; the agent searches the PDF partition and, when CSV bid data is also loaded, combines results from both sources. The response streams into the chat exactly as CSV answers do.

**Independent Test**: Ingest a PDF → type "What does the plan say about drainage?" → first token appears within 2 s → response references plan content → `npm test` passes for T022.

**Branch**: `feature/pdf-upload/agent-update` *(depends on vector-store merge; can start once T008–T009 are merged)*

- [x] T022 [P] [US2] Tests exist: `src/lib/agent/agent.test.ts` — covers `search_plan_documents` routing to `store.searchPdf()`, `query_bid_data` now embeds query and calls `store.searchCsv()`, updated no-data message mentioning both CSV and PDF, `search_plan_documents` present in TOOLS array, system prompt contains both source descriptions
- [X] T023 [US2] Update `src/lib/agent/index.ts` — add `search_plan_documents` tool definition (name, description, input schema with `query` + optional `top_k`); add `executeTool` branch for `search_plan_documents`: embed `query` with `generateEmbeddings([query])`, call `store.searchPdf(queryVector, topK ?? 5)`, format results as `[Page N — Sheet: D-101 — Section: Drainage Notes]\n<chunk.text>`, return JSON; update `executeTool` branch for `query_bid_data`: replace current fallback with `generateEmbeddings([question])` → `store.searchCsv(queryVector, topK ?? 5)`; replace system prompt with the combined CSV + PDF prompt from plan.md §agent; update empty-store `onToken` message to "No data has been loaded. Please upload a CSV file (bid data) or a PDF (plan documents), or both." (plan.md §agent modifications)

**Checkpoint**: Ingest PDF → type plan question → streamed response references sheet and section → combined question (CSV + PDF both loaded) yields references to both sources → `npm test` passes for T022.

---

## Phase 5: User Story 3 — UI Layout: PDF Button Above CSV Button (Priority: P1)

**Goal**: The PDF upload button appears immediately above the CSV upload button in the chat interface. Both buttons are independently enabled. A first PDF upload inserts "Uploaded '…'" and a second "PDF dataset replaced: '…'".

**Independent Test**: Open browser → inspect upload area → PDF button immediately above CSV button, no intervening elements → `npm test` passes for T024.

**Branch**: `feature/pdf-upload/chat-interface-update` *(depends on pdf-upload-component + ingest-pdf-api merging first)*

- [x] T024 [P] [US3] Tests exist: `src/components/ChatInterface/ChatInterface.test.tsx` — covers PdfUpload button before CSV button in DOM order, first PDF upload "Uploaded '…'" message with chunk count, second PDF upload "PDF dataset replaced: '…'" message, both controls independently enabled on initial load
- [X] T025 [US3] Update `src/components/ChatInterface/index.tsx` — import `PdfUpload` from `@/components/PdfUpload`; add `pdfLoaded` boolean state (false on mount); add `handlePdfUpload(result: PdfIngestionResult)`: if `!pdfLoaded` insert "Uploaded '{result.filename}' — {result.chunk_count} chunks ingested." else insert "PDF dataset replaced: '{result.filename}' — {result.chunk_count} chunks ingested."; set `pdfLoaded(true)` after either; add `handlePdfUploadError(message)` identical pattern to CSV error handler; render `<PdfUpload onUpload={handlePdfUpload} onError={handlePdfUploadError} disabled={isStreaming} />` immediately above `<FileUpload>` within the upload section (plan.md §ChatInterface modifications)

**Checkpoint**: Open browser → Upload PDF button appears directly above Upload CSV button → upload PDF → "Uploaded '…'" system message in chat → upload a second PDF → "PDF dataset replaced: …" message → both buttons still independently enabled → `npm test` passes for T024.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, coverage confirmation, and lint clean-up.

- [X] T026 [P] Run `npm test -- --coverage` — confirm all new lib modules (`pdf-extractor`, `pdf-chunker`) and components (`PdfUpload`) have coverage; confirm updated modules (`vector-store`, `agent`, `ChatInterface`) still pass
- [X] T027 Run all `quickstart.md` validation scenarios manually end-to-end (Scenarios 1–10: UI layout, non-PDF rejection, native path, vision path, mixed path, PDF Q&A, combined Q&A, CSV preserved after PDF upload, second PDF replaces first, independent controls)
- [X] T028 [P] Run `npm run lint` (Biome) and fix any reported issues across new and modified files
- [X] T029 [P] Verify `jest.config.ts` per-file `@jest-environment` annotations are correct — `node` for `pdf-extractor`, `pdf-chunker`, `ingest-pdf` tests; `jsdom` (default) for component tests

---

## Phase 7: Submission Hardening

**Purpose**: Post-spec improvements made during submission review — programmatic API exposure, CSS architecture migration, and test coverage gaps closed.

- [X] T030 Expose agent tools as a programmatic HTTP API — `GET /api/tools` returns the tool catalog with input schemas; `POST /api/tools/invoke` accepts `{ name, input }` and returns structured JSON; export `TOOLS` and `executeTool` from `src/lib/agent/index.ts` (`feat/expose-api`)
- [X] T031 Migrate from CSS Modules to plain SCSS — sync all `.module.scss` content into plain `.scss` files, import all stylesheets globally from `_app.tsx`, replace `styles["class-name"]` with direct string class names, install and apply `classnames` (`cx`) for dynamic class composition, delete all `.module.scss` files (`feat/update-css-use`)
- [X] T032 Add unit tests for tools API endpoints — `src/__tests__/api/tools.test.ts` and `src/__tests__/api/tools-invoke.test.ts` covering happy path, missing name, unknown tool, and method validation; update README to remove resolved gap and add S3 storage as future improvement (`feat/add-missing-unit-tests`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately on `feature/pdf-upload/setup`
- **Phase 2 (Model files)**: Depends on Phase 1 merge — all T004–T007 parallelisable
- **Phase 3 (US1)**: Depends on Phase 2 merge
  - `vector-store` branch first (T008–T009); blocks pdf-extractor, pdf-chunker, ingest-pdf-api
  - `pdf-extractor` + `pdf-chunker` + `pdf-upload-component` run in parallel after vector-store merges
  - `ingest-pdf-api` waits for all three above to merge
- **Phase 4 (US2)**: Depends on vector-store merge (T008) — can run in parallel with Phase 3 sub-branches
- **Phase 5 (US3)**: Depends on `pdf-upload-component` (T016–T017) + `ingest-pdf-api` (T019) merging
- **Phase 6 (Polish)**: Depends on all user story phases complete

### Branch Merge Order

```
feature/pdf-upload/setup           → merge to feature/pdf-upload
feature/pdf-upload/vector-store    → merge to feature/pdf-upload  (blocks others)
feature/pdf-upload/pdf-extractor   → merge to feature/pdf-upload  ┐ parallel
feature/pdf-upload/pdf-chunker     → merge to feature/pdf-upload  ┤ parallel
feature/pdf-upload/pdf-upload-component → merge to feature/pdf-upload ┘ parallel
feature/pdf-upload/agent-update    → merge to feature/pdf-upload  (after vector-store)
feature/pdf-upload/ingest-pdf-api  → merge to feature/pdf-upload  (after extractor + chunker)
feature/pdf-upload/chat-interface-update → merge to feature/pdf-upload (after component + ingest-api)
feature/pdf-upload                 → merge to main
```

### Parallel Opportunities Within Phases

**Phase 2**: T004–T007 all parallelisable — no task depends on another

**Phase 3 (after vector-store merges)**:
- `pdf-extractor` branch (T011–T012) runs in parallel with `pdf-chunker` branch (T013–T014) and `pdf-upload-component` branch (T015–T017)

**Phase 4**: Agent branch (T022–T023) can start as soon as vector-store branch merges — parallel with pdf-extractor / pdf-chunker

---

## Parallel Execution Examples

### Phase 3 — After vector-store merges

```
Branch A (pdf-extractor):       T012  ← implements index.ts to pass T011 tests
Branch B (pdf-chunker):         T014  ← implements index.ts to pass T013 tests
Branch C (pdf-upload-component): T016 → T017  ← component + SCSS to pass T015 tests
Branch D (agent-update):        T023  ← implements agent update to pass T022 tests
```

### Phase 3 — ingest-pdf-api (after A+B merge)

```
Branch E (ingest-pdf-api): T019 → T020 → T021  ← implements handler to pass T018 tests
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Model files
3. Complete Phase 3: US1 (all four branches)
4. **STOP and VALIDATE**: Upload PDF via curl → confirm chunks stored → confirm file in `uploads-pdf/`
5. US1 is independently demonstrable without agent integration

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 (US1) → PDF ingestion works end-to-end → **MVP demo**
3. Phase 4 (US2) → Agent answers PDF questions, combines with CSV → **Core feature complete**
4. Phase 5 (US3) → Full UI assembled with correct button layout → **Feature complete**
5. Phase 6 → Polish → **Submission ready**

---

## Notes

- `[P]` = different files, no blocking dependency — safe to implement simultaneously
- `[x]` = already complete (test files written and committed in TDD session)
- `[US1]`, `[US2]`, `[US3]` = traceability to spec user story
- All `model.ts` tasks (Phase 2) must be committed before any `index.ts` that imports from them
- Implementation tasks should make existing failing tests pass — do not modify the test files
- `npm test` must pass at every checkpoint before merging a branch
- Each phase checkpoint must pass before dependent branches are cut

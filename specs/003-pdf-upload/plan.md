# Implementation Plan: PDF Upload and Chat Integration

**Branch**: `feature/pdf-upload` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

## Summary

Add a PDF upload flow to the existing construction bid chat interface. Users upload construction plan-set PDFs (digitally-generated or scanned). Each page is processed by a hybrid pipeline: native text extraction via `pdfjs-dist` `getTextContent()` is attempted first; pages with fewer than 200 meaningful characters are routed through GPT-4.1 for document understanding (using `openai` SDK, already installed for embeddings). All pages are normalized to a common structured format, chunked by section, embedded with OpenAI `text-embedding-3-small`, and stored in a new PDF partition of the existing in-memory vector store — independent of the CSV partition. The agent gains a `search_plan_documents` tool and combines results from both partitions when answering estimator questions. A new `PdfUpload` UI component sits immediately above the existing `FileUpload` (CSV) component. The PDF pipeline has its own API endpoint, lib modules, and upload directory; the CSV pipeline is unchanged except for renamed vector store methods.

## Technical Context

**Language/Version**: TypeScript 5 — shapes defined as `type` aliases (not `interface`)

**Primary Dependencies**:
- `next@16.2.9` (Pages Router, existing)
- `react@19`, `react-dom@19` (existing)
- `@anthropic-ai/sdk` — Claude claude-sonnet-4-6 chat agent (existing; not used by the PDF extractor)
- `openai` — `text-embedding-3-small` embeddings + **GPT-4.1** for PDF vision fallback (existing SDK, new usage)
- `busboy` + `@types/busboy` — streaming multipart parser (existing)
- `pdfjs-dist` — **NEW**: native text extraction via `getTextContent()` (no canvas required)
- `pdf-lib` — **NEW**: pure-JS PDF manipulation; extracts individual pages as standalone PDFs for GPT-4.1 vision input (no native deps, no build tools)
- `@mui/material`, `@emotion/react`, `@emotion/styled` (existing)
- `sass` (existing)

**Storage**: Existing in-memory vector store extended with PDF partition (`globalThis.__vectorStore`); uploaded PDFs saved to `./uploads-pdf/<timestamp>-<filename>`

**Testing**: Jest + React Testing Library — every new module folder includes a `.test.ts` / `.test.tsx`

**Target Platform**: Local Node.js server (`npm run dev` → `next dev`)

**Project Type**: Web application (single Next.js project, Pages Router) — extending existing

**Performance Goals**:
- Native-extraction path: ingest a 50-page digitally-generated PDF in < 30 s (no GPT-4.1 calls)
- Hybrid path: ingest a 10-page scanned PDF in < 120 s (≤ 10 GPT-4.1 calls × ~5–10 s each)
- First streaming token in chat within 2 s of submitting a question
- Full agent response within 15 s per query

**Constraints**:
- 500 MB upload limit; client-side rejection before upload
- Vision path: one GPT-4.1 API call per page (pages processed independently)
- No native addon compilation required — `pdf-lib` is pure JS
- In-memory only — data lost on server restart

**Scale/Scope**: Single user, local machine; plan sets of hundreds of pages are supported (each page is processed independently)

## Constitution Check

Project constitution is an unpopulated template — no project-specific gates apply. Applying standard engineering judgment:
- Hybrid extraction keeps AI costs proportional to actual need; native path runs in-process at near-zero cost
- Each page is processed independently — no context window limits apply
- Tests required for all new lib modules and components

## Branch Strategy

```
main
└── feature/pdf-upload                           ← parent: all PDF work merges here
    ├── feature/pdf-upload/vector-store          ← extend VectorStore: dual-partition types + methods
    │                                              (modifies: lib/vector-store/model.ts + index.ts)
    │
    ├── feature/pdf-upload/pdf-extractor         ← new lib/pdf-extractor: hybrid extraction orchestrator
    │                                              (native getTextContent → quality check → GPT-4.1 fallback)
    │                                              (depends on: nothing new; uses pdfjs-dist + pdf-lib + OpenAI)
    │
    ├── feature/pdf-upload/pdf-chunker           ← new lib/pdf-chunker: ExtractedPage[] → ContentChunk[]
    │                                              (depends on: nothing)
    │
    ├── feature/pdf-upload/ingest-pdf-api        ← new pages/api/ingest-pdf.ts
    │                                              (depends on: vector-store, pdf-extractor, pdf-chunker)
    │
    ├── feature/pdf-upload/agent-update          ← update lib/agent: search_plan_documents tool,
    │                                              updated system prompt, combined search, no-data logic
    │                                              (depends on: vector-store)
    │
    ├── feature/pdf-upload/pdf-upload-component  ← new components/PdfUpload/ (UI only)
    │                                              (depends on: nothing)
    │
    └── feature/pdf-upload/chat-interface-update ← update ChatInterface: add PdfUpload above FileUpload
                                                   (depends on: pdf-upload-component, ingest-pdf-api)
```

**Merge order**:
1. `vector-store` → `feature/pdf-upload`
2. `pdf-extractor` + `pdf-chunker` → `feature/pdf-upload` (parallel)
3. `pdf-upload-component` → `feature/pdf-upload` (parallel with step 2)
4. `ingest-pdf-api` → `feature/pdf-upload` (after vector-store + pdf-extractor + pdf-chunker)
5. `agent-update` → `feature/pdf-upload` (after vector-store)
6. `chat-interface-update` → `feature/pdf-upload` (after pdf-upload-component + ingest-pdf-api)
7. `feature/pdf-upload` → `main`

## Project Structure

### Documentation (this feature)

```text
specs/003-pdf-upload/
├── plan.md              # This file
├── research.md          # Phase 0 findings
├── data-model.md        # Phase 1 entity definitions
├── quickstart.md        # Phase 1 validation guide
├── contracts/
│   └── api-ingest-pdf.md  # POST /api/ingest-pdf contract
└── tasks.md             # /speckit-tasks output (not yet created)
```

### Source Code Changes

**New files**:
```text
src/
├── pages/api/
│   └── ingest-pdf.ts                          # POST /api/ingest-pdf
├── components/
│   └── PdfUpload/
│       ├── index.tsx
│       ├── model.ts
│       ├── pdf-upload.component.scss
│       └── PdfUpload.test.tsx
└── lib/
    ├── pdf-extractor/
    │   ├── index.ts                           # Hybrid extraction orchestrator
    │   ├── model.ts                           # ExtractedPage, PageImage types
    │   └── pdf-extractor.test.ts
    └── pdf-chunker/
        ├── index.ts                           # ExtractedPage[] → ContentChunk[]
        ├── model.ts                           # ContentChunk type
        └── pdf-chunker.test.ts

uploads-pdf/                                   # Saved PDF files (git-ignored)
```

**Modified files**:
```text
src/
├── lib/
│   ├── vector-store/
│   │   ├── model.ts                           # Add PdfVectorEntry, PdfDatasetMetadata;
│   │   │                                        rename VectorStoreState fields
│   │   └── index.ts                           # Rename load()→loadCsv(); add loadPdf(),
│   │                                            searchPdf(), isCsvLoaded(), isPdfLoaded(),
│   │                                            getCsvMetadata(), getPdfMetadata()
│   └── agent/
│       └── index.ts                           # Add search_plan_documents tool + handler;
│                                                update query_bid_data to embed query;
│                                                update system prompt; update empty check
├── components/
│   └── ChatInterface/
│       └── index.tsx                          # Add PdfUpload above FileUpload;
│                                                add pdfLoaded state + handlers
└── pages/api/
    └── ingest.ts                              # One-line change: load() → loadCsv()
```

**Structure Decision**: New modules follow the same co-located folder pattern as existing modules (`index.ts`, `model.ts`, `.test.ts`). The `pdf-extractor` module owns the full hybrid extraction concern — both native and vision paths — so callers never need to know which path was taken. The `pdf-chunker` is a pure transformation module with no I/O.

## Module Specifications

### `src/lib/pdf-extractor`

**Purpose**: Given a local PDF file path, returns `ExtractedPage[]` using the hybrid strategy. This is the only module that imports `pdfjs-dist` and `pdf-lib`. No canvas or native addons required.

**Exported function**:
```ts
extractPdfPages(filePath: string): Promise<ExtractedPage[]>
```

**Internal flow per page** (1 to `numPages`):
1. Load document via `pdfjs-dist` (`getDocument({ data: uint8Array })`)
2. Call `page.getTextContent()` → join items into a string
3. Count meaningful characters: `text.replace(/[\s\W]/g, '').length`
4. If count ≥ 200 → **native path**:
   - Parse `Sheet:` from first matching line; parse `Section:` blocks
   - If no `Section:` markers found, wrap full text as `Section: General Content`
   - Return `ExtractedPage` with `extractionMethod: 'native'`
5. If count < 200 → **vision path**:
   - Use `pdf-lib` to extract page N as a standalone single-page PDF (`PDFDocument.copyPages`)
   - Encode the single-page PDF as a base64 data URI (`application/pdf`)
   - Send to GPT-4.1 via `openai.chat.completions.create()` with a file content block and structured document understanding prompt (see contract)
   - Parse GPT-4.1 response for `Sheet:` and `Section:` blocks
   - Return `ExtractedPage` with `extractionMethod: 'vision'`
6. If both paths yield empty content → `{ skipped: true, warning: 'Page N: no content extracted' }`

**Quality threshold constant**: `MIN_NATIVE_CHARS = 200` — exported for test overriding.

**Test scope**: Mock pdfjs, pdf-lib, and OpenAI client. Verify: native path taken when text ≥ 200 chars; vision path taken when < 200 chars; skipped page when vision also returns empty; `extractionMethod` set correctly; `Sheet:` parsing; `Section:` block parsing; GPT-4.1 API error produces skipped-page warning rather than throw.

---

### `src/lib/pdf-chunker`

**Purpose**: Pure transformation — converts `ExtractedPage[]` into `ContentChunk[]`. No I/O.

**Exported function**:
```ts
chunkExtractedPages(pages: ExtractedPage[]): ContentChunk[]
```

**Logic**:
- Skip pages with `skipped: true`
- For each page, split `text` on `Section: ` markers
- Each `Section: <title>\n<content>` block → one `ContentChunk` (if content is non-empty after trim)
- If no `Section:` markers → entire page text becomes one chunk with `section: null`
- Chunks exceeding 2,000 characters → split at `\n\n` boundaries; suffix section title with ` (part N/M)`
- Each chunk inherits `page`, `sheet`, `extractionMethod` from its parent `ExtractedPage`
- Assign UUID v4 to each chunk

**Test scope**: Section splitting; page-level fallback; long-chunk splitting; empty content skipping; `extractionMethod` propagation; UUID assignment; multiple pages produce correct page numbers.

---

### `src/pages/api/ingest-pdf.ts`

**Purpose**: Dedicated REST endpoint for PDF ingestion. Full contract: [contracts/api-ingest-pdf.md](./contracts/api-ingest-pdf.md).

**Processing flow**:
1. Receive multipart upload via busboy → stream to `./uploads-pdf/<timestamp>-<originalFilename>`
2. Validate: `.pdf` extension and `application/pdf` MIME type; reject 400 if not PDF
3. Call `extractPdfPages(savedPath)` → `ExtractedPage[]`
4. If all pages skipped → return 422
5. Call `chunkExtractedPages(pages)` → `ContentChunk[]`
6. Call `generateEmbeddings(chunks.map(c => c.text))` → `number[][]`
7. On success: build `PdfVectorEntry[]`, call `store.loadPdf(entries, metadata)`
8. On embedding failure: `store.loadPdf([], emptyMetadata)` + return 500
9. Compute `native_pages`, `vision_pages`, `skipped_pages` from `ExtractedPage[]`
10. Return `PdfIngestionResult`

**Config**:
```ts
export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 600,
};
```

**Test scope**: Mock busboy + lib modules. Verify: 200 happy path; 400 no-file; 400 wrong type; 413 oversized; 422 all-pages-empty; 500 embedding failure (partition rolled back); correct `native_pages`/`vision_pages` counts in response.

---

### `src/lib/vector-store` (modifications)

See [data-model.md](./data-model.md) for full type definitions.

**`model.ts` changes**:
- Add `PdfVectorEntry`, `PdfDatasetMetadata` types
- Rename `VectorStoreState.entries` → `csvEntries`, `metadata` → `csvMetadata`
- Add `pdfEntries: PdfVectorEntry[]`, `pdfMetadata: PdfDatasetMetadata | null`

**`index.ts` changes** (public API):
- `load(entries, metadata)` → renamed to `loadCsv(entries, metadata)`
- `loadPdf(entries, metadata)` — new; replaces only the PDF partition
- `search(vector, topK?)` → renamed to `searchCsv(vector, topK?)`
- `searchPdf(vector, topK?)` — new; cosine similarity over PDF partition
- `getMetadata()` → renamed to `getCsvMetadata()`
- `getPdfMetadata()` — new
- `isCsvLoaded()` — new: `csvEntries.length > 0`
- `isPdfLoaded()` — new: `pdfEntries.length > 0`
- `isEmpty()` — updated: `!isCsvLoaded() && !isPdfLoaded()`

All analytics methods (`getTopByTotalCost`, `detectOutliers`, `summarize`, `getItems`) are unchanged.

**`src/pages/api/ingest.ts`**: Single change — `store.load(entries, metadata)` → `store.loadCsv(entries, metadata)`.

**Test scope**: Update existing tests for renamed methods. Add: dual-partition coexistence (`loadCsv` + `loadPdf` → both retrievable); `loadPdf` does not affect CSV partition; `loadCsv` does not affect PDF partition; `searchPdf` returns correct top-K; `isEmpty`/`isCsvLoaded`/`isPdfLoaded` state machine.

---

### `src/lib/agent` (modifications)

**New tool — `search_plan_documents`**:
```ts
{
  name: "search_plan_documents",
  description: "Performs semantic search over uploaded construction plan documents (PDFs). Returns the most relevant sections including sheet numbers, notes, specifications, and quantities. Use this when the user asks about plan requirements, specifications, notes, quantities, or drawing details.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural language search query" },
      top_k: { type: "number", description: "Number of results to return (default: 5)" },
    },
    required: ["query"],
  },
}
```

**`executeTool` update for `search_plan_documents`**:
- Embed the query: `generateEmbeddings([query])` → `queryVector`
- Call `store.searchPdf(queryVector, topK ?? 5)`
- Format results: for each `PdfVectorEntry`, output its `chunk.text` with source citation header:
  ```
  [Page N — Sheet: D-101 — Section: Drainage Notes]
  <chunk.text>
  ```
- Return JSON with the formatted results array

**`executeTool` update for `query_bid_data`**: Replace the current fallback (`getTopByTotalCost`) with a proper semantic search:
- Embed the query: `generateEmbeddings([question])` → `queryVector`
- Call `store.searchCsv(queryVector, topK ?? 5)`
- Return top results as JSON

**Updated system prompt**:
```
You are an expert construction estimator assistant with access to two data sources:

1. CSV Bid Data (structured): Contains bid items with quantities, unit prices, and totals.
   - Use get_top_expensive_items, detect_price_outliers, summarize_quantities, get_average_unit_price for analytical questions
   - Use query_bid_data for semantic search over bid item descriptions

2. Plan Documents (unstructured): Extracted text from construction plan-set PDFs, including sheet notes, specifications, quantities, and requirements.
   - Use search_plan_documents for any question about the plan content

When both sources are available, use tools from both to give a complete, cross-referenced answer.
Always cite the source in your response (e.g., "According to Sheet D-101..." or "From the bid data...").
Format numbers with commas and currency symbols where appropriate.
```

**Updated empty-store check**:
```ts
if (store.isEmpty()) {
  onToken("No data has been loaded. Please upload a CSV file (bid data) or a PDF (plan documents), or both.");
  return;
}
```

**When only PDF is loaded**: The analytics tools will receive empty `BidItem[]` arrays and return empty/zero results. The system prompt already guides Claude to use `search_plan_documents` for plan-related questions. When CSV analytics tools are invoked against empty data, they return an empty result and Claude should respond naturally ("No bid data is currently loaded").

**Test scope**: Mock Anthropic + OpenAI clients. Verify: `search_plan_documents` tool routes to `store.searchPdf()`; `query_bid_data` now embeds query and calls `store.searchCsv()`; updated no-data message; combined system prompt present; tool present in `TOOLS` array.

---

### `src/components/PdfUpload`

**Purpose**: Upload button for PDFs, mirrors `FileUpload` in structure and behavior.

**Props (`model.ts`)**:
```ts
type PdfUploadProps = {
  onUpload: (result: PdfIngestionResult) => void;
  onError: (message: string) => void;
  disabled: boolean;
};

type PdfIngestionResult = {
  filename: string;
  page_count: number;
  chunk_count: number;
  native_pages: number;
  vision_pages: number;
  skipped_pages: number;
  warnings: string[];
};
```

**Client-side validation**: `.pdf` extension check + `application/pdf` MIME check + 500 MB size check.

**Network**: `POST /api/ingest-pdf` with `multipart/form-data`, field name `file`.

**Button label**: "Upload PDF" (idle) / "Uploading…" (loading)
**Loading indicator**: `CircularProgress size={16}` (same as FileUpload)
**SCSS root class**: `.pdf-upload-component` (BEM pattern, same as `.file-upload-component`)

**Test scope**: Renders without crash; rejects non-PDF with error; rejects oversized with error; shows loading state; calls `onUpload` with correct `PdfIngestionResult` shape on success; calls `onError` on fetch failure.

---

### `src/components/ChatInterface` (modifications)

**Changes**:
- Import `PdfUpload` from `@/components/PdfUpload`
- Add `pdfLoaded` state (`boolean`, tracks whether PDF partition has data)
- Add `handlePdfUpload(result: PdfIngestionResult)`:
  ```ts
  const text = pdfLoaded
    ? `PDF dataset replaced: '${result.filename}' — ${result.chunk_count} chunks ingested.`
    : `Uploaded '${result.filename}' — ${result.chunk_count} chunks ingested.`;
  addMessage({ id: crypto.randomUUID(), role: 'system', content: text, timestamp: Date.now() });
  setPdfLoaded(true);
  ```
- Add `handlePdfUploadError(message: string)` → same as CSV error handler
- Render `<PdfUpload>` immediately above `<FileUpload>` within `chat-interface-component__upload-section`

**Disable rules** (independent per button):
- `<PdfUpload disabled={isStreaming} />` — only agent streaming disables it
- `<FileUpload disabled={isStreaming} />` — unchanged

**Test scope**: RTL; verify `PdfUpload` renders immediately before `FileUpload` in DOM; confirm `pdfLoaded: false` produces "Uploaded …" message, `pdfLoaded: true` produces "PDF dataset replaced: …" message; confirm both handlers insert system messages; confirm both components are independently enabled.

---

## SCSS Convention (unchanged)

```scss
// pdf-upload.component.scss
.pdf-upload-component {
  &__button { … }
  &__loading { … }
  &__error { … }
}
```

---

## Testing Summary

| Module / Route | Test focus |
|---------------|-----------|
| `lib/pdf-extractor` | Native path (≥200 chars); GPT-4.1 fallback (<200 chars); mixed page; skipped page; `extractionMethod` propagation; section/sheet parsing; GPT-4.1 error → skipped warning |
| `lib/pdf-chunker` | Section splits; page fallback; long-chunk split; empty skip; `extractionMethod` on chunks; UUID assignment |
| `lib/vector-store` | Renamed methods; dual-partition coexistence; `loadPdf` / `loadCsv` independence; `searchPdf`; state flags |
| `lib/agent` | `search_plan_documents` routing; `query_bid_data` embedding fix; combined system prompt; updated no-data message |
| `api/ingest-pdf` | 200 happy path; 400 no-file; 400 wrong type; 413 oversized; 422 all-empty; 500 embedding failure; `native_pages`/`vision_pages` counts |
| `components/PdfUpload` | Renders; non-PDF rejection; size rejection; loading state; `onUpload`; `onError` |
| `components/ChatInterface` | PdfUpload above FileUpload in DOM; upload/replace messages; independent disabled state |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PDF_UPLOAD_DIR` | `./uploads-pdf` | Directory for saved PDF files |
| `UPLOAD_DIR` | `./uploads` | Directory for CSV files (existing, unchanged) |
| `ANTHROPIC_API_KEY` | — | Claude vision API key (existing) |
| `OPENAI_API_KEY` | — | Embeddings API key (existing) |

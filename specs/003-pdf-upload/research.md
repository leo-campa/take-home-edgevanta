# Research: PDF Upload and Chat Integration

**Date**: 2026-06-14 | **Plan**: [plan.md](./plan.md)

---

## Decision 1: Hybrid Extraction Strategy — Native First, Vision Fallback

**Decision**: Attempt native PDF text extraction (pdfjs-dist `getTextContent()`) per page first. If extracted text fails a quality threshold, route the page through Claude vision for document understanding.

**Rationale**: Construction plan sets span two categories: digitally-generated (AutoCAD, Bluebeam, Revit, Civil 3D) and scanned image-based. Digitally-generated PDFs contain embedded text layers that can be extracted cheaply in milliseconds. Calling a vision LLM for every page of a 200-page CAD-generated PDF would be slow and expensive when native extraction already yields high-quality text. The hybrid approach applies AI only where it is actually needed, making the pipeline cost-conscious and scalable to large plan sets.

**Quality threshold**: A page is routed to vision fallback when extracted text has fewer than 200 meaningful characters after stripping whitespace and punctuation. This heuristic catches blank/image-only pages, scanned pages where no text layer exists, and pages where the embedded text is corrupted encoding artifacts.

**Alternatives considered**:

| Option | Why Rejected |
|--------|-------------|
| Vision-only (all pages) | Expensive and slow for digitally-generated PDFs that already have text layers; a 200-page CAD set would make 200 API calls unnecessarily |
| Native-only | Cannot handle scanned plan sets at all — common in the industry; fails silently for image-based PDFs |
| OCR library (Tesseract.js) | Raw OCR returns unstructured flat text; no understanding of section headers, sheet identifiers, or table structure — degrades retrieval quality for semantic search |

---

## Decision 2: Native Text Extraction Library

**Decision**: `pdfjs-dist` (v4.x) using `getTextContent()` per page

**Rationale**: `pdfjs-dist` is the right choice for native text extraction — `getTextContent()` works in Node.js without the `canvas` package. No native addon compilation required for the native extraction path.

**Alternatives considered**:

| Option | Why Rejected |
|--------|-------------|
| `pdf-parse` | Unmaintained (last commit 2019); wraps an old pdfjs version; no per-page control |
| `unpdf` | Modern wrapper but adds another abstraction over pdfjs; no benefit when we use pdfjs directly |
| `pdf-lib` | Focused on PDF creation/manipulation; insufficient for text content extraction — used separately for page splitting (see Decision 3) |

---

## Decision 3: Vision Fallback — GPT-4.1 with PDF Page Input via pdf-lib

**Decision**: For pages that fail the native extraction quality check, use `pdf-lib` to extract the failing page as a standalone single-page PDF, encode it as base64, and send it to GPT-4.1 via the existing `openai` SDK for document understanding.

**Rationale**: The `openai` SDK is already installed for embeddings, making GPT-4.1 a zero-additional-SDK choice for the vision fallback. This keeps OpenAI as the single AI provider for the PDF pipeline (`@anthropic-ai/sdk` is retained in the project for the existing chat agent, but is not imported by any new PDF module). Critically, extracting pages as PDFs via `pdf-lib` (pure JavaScript, no native deps) avoids the need for `canvas` — which requires `node-gyp`, Python 3, and a C++ compiler. This makes local setup simpler and eliminates a common CI build failure point. GPT-4.1's document understanding capability produces the same structured output format as the previous Claude-based design.

**Alternatives considered**:

| Option | Why Rejected |
|--------|-------------|
| Claude claude-sonnet-4-6 vision | Would require `canvas` (native addon) for image rendering; adds `@anthropic-ai/sdk` as an active import in the new PDF modules; no quality advantage over GPT-4.1 for this task |
| canvas + pdfjs image rendering | `node-gyp` build dependency is a common local-setup friction point; `pdf-lib` achieves page isolation in pure JS |
| Tesseract.js | No structural understanding; returns flat unstructured text stream |
| AWS Textract | External cloud dependency — violates local-only constraint |

---

## Decision 4: Content Normalization — Common Format Regardless of Extraction Method

**Decision**: All pages, whether extracted natively or via vision, are normalized to the same structured text format before chunking:

```
Sheet: D-101

Section: Drainage Notes

- Install 24-inch concrete pipe
- Minimum slope shall be 1%

Section: Quantities

Concrete Pipe: 95 LF
```

For native extraction: the raw text from `getTextContent()` is parsed to identify `Sheet:` and `Section:` patterns, or the raw text is kept as a single `Section: General Content` block if no structure is detectable.

For vision extraction: GPT-4.1's prompt directly produces this format.

The `extractionMethod` field (`'native' | 'vision'`) is stored on each chunk for observability and debugging.

**Rationale**: A unified format means the chunker has a single input contract regardless of which extraction path was used. This simplifies testing and makes the chunking logic extraction-method-agnostic.

---

## Decision 5: Vector Store — Dual Partition (CSV + PDF Coexist)

**Decision**: The in-memory vector store maintains separate CSV and PDF partitions. Uploading a new PDF replaces only the PDF partition; CSV data is preserved (and vice versa). The agent searches both partitions when both are loaded.

**Rationale**: Confirmed by clarification session 2026-06-14. The agent must combine results from bid data (CSV) and plan documents (PDF) to answer estimator questions accurately. A single flat store or replace-all behavior would make cross-source queries impossible.

---

## Decision 6: Dedicated API Endpoint

**Decision**: `POST /api/ingest-pdf` — entirely separate from `POST /api/ingest` (CSV).

**Rationale**: The processing pipeline (hybrid extraction, chunking, PDF-specific error handling) is substantially different from the CSV pipeline. Separate endpoints keep each route simple and independently testable. They also allow different `maxDuration` settings (PDF ingestion can take longer due to potential vision API calls).

---

## Decision 7: `extractionMethod` Metadata on Chunks

**Decision**: Each `ContentChunk` stores `extractionMethod: 'native' | 'vision'` alongside page, sheet, and section metadata.

**Rationale**: Preserving the extraction method per chunk enables:
- Agent responses to cite source fidelity ("This information was extracted from the document text layer" vs. "This was interpreted from a scanned image")
- Debugging when ingestion produces unexpected results
- Future analytics on how many pages in a given PDF required AI assistance

---

## New Dependencies Required

| Package | Purpose | Already Present? |
|---------|---------|-----------------|
| `pdfjs-dist` | Native text extraction via `getTextContent()` | No — new | No |
| `pdf-lib` | Single-page PDF extraction for GPT-4.1 vision input | No — new | No |

No native addon compilation required. No new API keys needed — GPT-4.1 uses the existing `OPENAI_API_KEY`; the chat agent continues to use `ANTHROPIC_API_KEY`.

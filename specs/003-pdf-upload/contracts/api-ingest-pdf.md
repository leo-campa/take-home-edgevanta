# API Contract: POST /api/ingest-pdf

**Feature**: PDF Upload and Chat Integration | **Plan**: [plan.md](../plan.md)

---

## Overview

Accepts a multipart form-data upload of a PDF file and processes it through the hybrid extraction pipeline (native text extraction → Claude vision fallback for pages that fail quality check). Generates embeddings for all content chunks and stores them in the PDF partition of the in-memory vector store.

---

## Request

**Method**: `POST`
**Path**: `/api/ingest-pdf`
**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | The PDF to ingest. Must have `.pdf` extension and `application/pdf` MIME type. |

**Next.js config**:
```ts
export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 600,   // 10 min ceiling for large plan sets with many vision-fallback pages
};
```

**Constraints**:
- Max file size: 500 MB (enforced by busboy `limits.fileSize`)
- Files exceeding the limit are rejected server-side with `413`

---

## Response: Success

**Status**: `200 OK`
**Content-Type**: `application/json`

```json
{
  "filename": "site-plan-rev2.pdf",
  "page_count": 48,
  "chunk_count": 132,
  "native_pages": 35,
  "vision_pages": 13,
  "skipped_pages": 0,
  "warnings": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `filename` | string | Original filename |
| `page_count` | number | Total pages in the PDF |
| `chunk_count` | number | Number of content chunks stored in the vector store |
| `native_pages` | number | Pages where native text extraction succeeded |
| `vision_pages` | number | Pages that required Claude vision fallback |
| `skipped_pages` | number | Pages with no usable content after both extraction methods |
| `warnings` | string[] | Per-page warnings; empty array if none |

---

## Response: Error Cases

| Status | Body | Trigger |
|--------|------|---------|
| `400` | `{ "error": "No file uploaded. Include a 'file' field in multipart/form-data." }` | Missing file field |
| `400` | `{ "error": "Only PDF files are accepted." }` | Wrong file type (extension or MIME) |
| `413` | `{ "error": "File exceeds the 500 MB limit." }` | File too large |
| `422` | `{ "error": "No content could be extracted from this PDF.", "page_count": N, "skipped_pages": N }` | All pages yielded no usable content |
| `500` | `{ "error": "Ingestion failed: <reason>" }` | Embedding generation failed (PDF partition rolled back) |
| `500` | `{ "error": "PDF processing failed: <reason>" }` | pdfjs or Claude API error |
| `405` | `{ "error": "Method not allowed" }` | Non-POST request |

---

## Processing Flow

```
1.  Receive multipart upload via busboy → stream to ./uploads-pdf/<timestamp>-<filename>
2.  Validate: PDF extension + MIME type
3.  For each page (1 to N):
    a. Extract text via pdfjs-dist getTextContent()
    b. Count meaningful characters after stripping whitespace/punctuation
    c. If char count ≥ 200:
         → Parse for Sheet:/Section: markers → ExtractedPage (extractionMethod: 'native')
    d. If char count < 200:
         → Render page to base64 JPEG (pdfjs + canvas, scale 2.0)
         → Call Claude claude-sonnet-4-6 vision with structured prompt
         → Parse response → ExtractedPage (extractionMethod: 'vision')
    e. If GPT-4.1 also returns empty content → mark page as skipped, record warning
4.  If all pages skipped → return 422
5.  Run pdf-chunker: ExtractedPage[] → ContentChunk[] (section-based, page fallback)
6.  generateEmbeddings(chunks.map(c => c.text)) → number[][]
7.  On success: store.loadPdf(pdfEntries, pdfMetadata)
8.  On embedding failure: store.loadPdf([], emptyMetadata) → return 500
9.  Return 200 PdfIngestionResult
```

---

## GPT-4.1 Document Understanding Prompt (used only for fallback pages)

Each failing page is extracted as a standalone single-page PDF via `pdf-lib`, encoded as base64, and sent to GPT-4.1 via `openai.chat.completions.create()`.

**System**:
```
You are a construction document analyst. Extract all text and structured information from this construction plan sheet page. Identify and output:
- The sheet identifier (e.g. "Sheet: D-101") if visible, or "Sheet: UNKNOWN" if not found
- All section headers with their content (notes, specifications, quantities, measurements, requirements, table values)

Format output exactly as follows:
Sheet: <identifier>

Section: <section title>
<content lines>

Section: <next section title>
<content lines>

If no clear sections exist, use: Section: General Content
Output only the extracted content — no commentary, explanations, or preamble.
```

**User message**: `[file content block: base64-encoded single-page PDF]`

**Model**: `gpt-4.1` | **Provider**: OpenAI (existing `openai` SDK)

---

## Differences from POST /api/ingest (CSV)

| Aspect | CSV (`/api/ingest`) | PDF (`/api/ingest-pdf`) |
|--------|--------------------|-----------------------|
| File type | `.csv` | `.pdf` |
| Upload dir | `./uploads/` (`UPLOAD_DIR`) | `./uploads-pdf/` (`PDF_UPLOAD_DIR`) |
| Processing | papaparse → normalise → format | hybrid extraction → chunk |
| Store method | `store.loadCsv(entries, metadata)` | `store.loadPdf(entries, metadata)` |
| Result | items + column mapping | pages + chunks + extraction stats |
| maxDuration | 300s | 600s |
| Analytics | Available (structured bid items) | Not applicable (unstructured text) |

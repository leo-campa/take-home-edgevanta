# Quickstart Validation Guide: PDF Upload and Chat Integration

**Date**: 2026-06-14 | **Plan**: [plan.md](./plan.md) | **Contract**: [contracts/api-ingest-pdf.md](./contracts/api-ingest-pdf.md)

---

## Prerequisites

- Node.js ≥ 22.14.0 (no native addon compilation required — all new dependencies are pure JS)
- `OPENAI_API_KEY` set in `.env.local` (GPT-4.1 vision fallback + embeddings)
- `ANTHROPIC_API_KEY` set in `.env.local` (existing chat agent — unchanged)
- Two sample PDFs for testing:
  - A **text-based PDF** (e.g., any PDF generated from Word, or a CAD drawing exported as PDF with text layers — exercises native extraction path)
  - A **scanned/image-based PDF** (e.g., a photo scanned to PDF with no text layer — exercises GPT-4.1 vision fallback path)
  - A single-page PDF of either type is sufficient for initial validation

---

## Setup

```bash
# Install new dependencies (from project root)
npm install pdfjs-dist pdf-lib

# Start dev server
npm run dev
```

---

## Scenario 1: PDF Upload Button Appears Above CSV Button

1. Open `http://localhost:3000/chat`.
2. View the upload section in the bottom input row.

**Expected**: "Upload PDF" button is immediately above "Upload CSV" with no elements between them. Both are enabled on initial load.

---

## Scenario 2: Non-PDF Rejected Client-Side

1. Click "Upload PDF".
2. Select any non-PDF file (e.g., `.txt`, `.jpg`, `.csv`).

**Expected**: Inline error appears under the button: "Only PDF files are accepted." No network request is sent to `/api/ingest-pdf`.

---

## Scenario 3: Successful Ingestion of Text-Based PDF (Native Path)

1. Click "Upload PDF" and select a digitally-generated PDF.
2. Wait for processing (should complete in seconds for a text-based PDF with no vision calls).

**Expected in chat**: `Uploaded 'your-file.pdf' — N content chunks ingested.`

**Verify via curl**:
```bash
curl -X POST http://localhost:3000/api/ingest-pdf \
  -F "file=@/path/to/text-based.pdf"
```
Expected response — `vision_pages` should be 0 or very low:
```json
{
  "filename": "text-based.pdf",
  "page_count": 5,
  "chunk_count": 18,
  "native_pages": 5,
  "vision_pages": 0,
  "skipped_pages": 0,
  "warnings": []
}
```

**Verify on filesystem**: `./uploads-pdf/<timestamp>-text-based.pdf` exists.

---

## Scenario 4: Successful Ingestion of Scanned PDF (Vision Fallback Path)

1. Click "Upload PDF" and select a scanned/image-only PDF.
2. Wait for processing (will take longer — one GPT-4.1 call per page that fails native extraction).

**Expected in chat**: `Uploaded 'scanned.pdf' — N content chunks ingested.`

**Verify via curl**:
```bash
curl -X POST http://localhost:3000/api/ingest-pdf \
  -F "file=@/path/to/scanned.pdf"
```
Expected response — `native_pages` should be 0 or low, `vision_pages` should be > 0:
```json
{
  "filename": "scanned.pdf",
  "page_count": 3,
  "chunk_count": 9,
  "native_pages": 0,
  "vision_pages": 3,
  "skipped_pages": 0,
  "warnings": []
}
```

---

## Scenario 5: Mixed PDF (Some Pages Native, Some Vision)

Upload a plan set PDF that mixes text-layer pages (cover sheet, title block) with scanned drawing pages.

**Expected**: Response shows `native_pages > 0` and `vision_pages > 0`, demonstrating the hybrid pipeline.

---

## Scenario 6: Agent Answers Questions About PDF Content

1. After ingesting a PDF (Scenario 3 or 4), type a question relevant to the PDF content (e.g., "What are the drainage notes?" or "What quantities are listed?").
2. Press Enter.

**Expected**: Response streams into chat, references content from the PDF, and (if metadata was captured) cites the sheet identifier (e.g., "According to Sheet D-101…").

---

## Scenario 7: Agent Combines CSV and PDF Results

1. Upload a PDF (Scenario 3).
2. Upload a CSV bid file via "Upload CSV".
3. Ask a combined question (e.g., "Are the drainage quantities in the bid consistent with the plan notes?").

**Expected**: The agent uses both `search_plan_documents` (PDF) and `query_bid_data` or analytics tools (CSV) in its response, referencing both data sources.

---

## Scenario 8: CSV Data Preserved After PDF Upload

1. Upload a CSV — confirm it is loaded.
2. Upload a PDF.

**Expected**: Chat confirms the PDF was uploaded. Asking a CSV analytics question (e.g., "What are the top expensive items?") still returns CSV-sourced answers — the CSV partition was not affected by the PDF upload.

---

## Scenario 9: Second PDF Replaces First PDF Partition

1. Upload PDF A — confirm chunk count.
2. Upload PDF B.

**Expected**: Chat shows `PDF dataset replaced: 'B.pdf' — N chunks ingested.` Questions about content unique to PDF A no longer return results; PDF B content is retrievable.

---

## Scenario 10: Independent Upload Controls

1. Start a PDF upload (select a multi-page PDF — takes a few seconds).
2. While the PDF loading indicator is visible, click "Upload CSV" and select a CSV file.

**Expected**: CSV upload proceeds normally. PDF button is disabled during PDF ingestion; CSV button is independently enabled.

---

## Validation Checklist

| Scenario | Pass Criteria | Tested |
|----------|--------------|--------|
| 1. UI layout | PDF button immediately above CSV, no gap elements | [ ] |
| 2. Non-PDF rejection | Client-side error, no network request | [ ] |
| 3. Native path | `vision_pages: 0`, fast completion, chat confirmation | [ ] |
| 4. Vision path | `native_pages: 0`, slower completion, chat confirmation | [ ] |
| 5. Mixed path | Both `native_pages > 0` and `vision_pages > 0` | [ ] |
| 6. PDF Q&A | Streamed response referencing PDF content | [ ] |
| 7. Combined Q&A | Agent uses both CSV and PDF sources | [ ] |
| 8. CSV preserved | CSV analytics work after PDF upload | [ ] |
| 9. PDF replacement | Second PDF replaces first, CSV unaffected | [ ] |
| 10. Independent controls | CSV upload works during PDF ingestion | [ ] |

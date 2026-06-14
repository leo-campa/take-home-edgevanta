# Data Model: PDF Upload and Chat Integration

**Date**: 2026-06-14 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

---

## New Entities

### `ContentChunk`
*Owner: `src/lib/pdf-chunker/model.ts`*

A single retrievable unit of text representing one coherent section of a PDF page. The unit of storage in the PDF vector partition.

```ts
type ContentChunk = {
  id: string;                              // UUID v4, assigned at chunk creation
  page: number;                            // 1-based page number within the PDF
  sheet: string | null;                    // Sheet identifier if found (e.g. "D-101"), else null
  section: string | null;                  // Section title if found (e.g. "Drainage Notes"), else null
  text: string;                            // Extracted and normalized text content
  extractionMethod: 'native' | 'vision';  // How this page's content was obtained
};
```

**Validation rules**:
- `text` must be non-empty after trimming; empty chunks are discarded before embedding
- `page` must be ≥ 1
- `id` is a UUID v4 assigned at creation time
- `extractionMethod` is propagated from the `ExtractedPage` that produced this chunk

**State**: Immutable after creation. The entire PDF chunk set is atomically replaced when a new PDF is uploaded.

---

### `ExtractedPage`
*Owner: `src/lib/pdf-extractor/model.ts`*

The normalized output of the hybrid extraction pipeline for a single PDF page, regardless of which extraction path was used.

```ts
type ExtractedPage = {
  page: number;                            // 1-based
  sheet: string | null;                    // Sheet identifier if identified (e.g. "D-101")
  text: string;                            // Full normalized text in the common format
  extractionMethod: 'native' | 'vision';  // Which extraction path produced this content
  skipped: boolean;                        // True if the page yielded no usable content
  warning: string | null;                  // Per-page warning message if skipped or degraded
};
```

---

### `PageImage`
*Owner: `src/lib/pdf-extractor/model.ts`* (used internally for vision fallback)

A rendered PDF page as a base64 JPEG, produced only for pages that fail native extraction quality check.

```ts
type PageImage = {
  page: number;       // 1-based
  base64Jpeg: string; // Base64-encoded JPEG at scale 2.0, 85% quality
};
```

---

### `PdfVectorEntry`
*Owner: `src/lib/vector-store/model.ts`*

A content chunk stored in the PDF partition of the vector store, combining extracted text and chunk metadata with an embedding vector.

```ts
type PdfVectorEntry = {
  id: string;           // Same as ContentChunk.id
  text: string;         // Same as ContentChunk.text (the embedded text)
  vector: number[];     // L2-normalised embedding from text-embedding-3-small
  chunk: ContentChunk;  // Full chunk with page, sheet, section, extractionMethod
};
```

---

### `PdfDatasetMetadata`
*Owner: `src/lib/vector-store/model.ts`*

Metadata recorded when a PDF is successfully ingested, stored alongside the PDF partition.

```ts
type PdfDatasetMetadata = {
  filename: string;         // Original filename
  saved_path: string;       // Absolute path on the server filesystem
  ingested_at: string;      // ISO 8601 timestamp
  page_count: number;       // Total pages in the PDF
  chunk_count: number;      // Number of chunks stored in the vector partition
  native_pages: number;     // Pages extracted natively (text layer)
  vision_pages: number;     // Pages that required Claude vision fallback
  skipped_pages: number;    // Pages with no usable content after both methods
  warnings: string[];       // Per-page warnings
};
```

---

### `PdfIngestionResult`
*Owner: `src/pages/api/ingest-pdf.ts` (exported type)*

JSON response body of `POST /api/ingest-pdf` on success.

```ts
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

---

## Modified Entities

### `VectorStoreState` *(modified)*
*Owner: `src/lib/vector-store/model.ts`*

Extended from a single flat CSV list to a dual-partition structure. Both partitions coexist independently.

**Before (existing)**:
```ts
type VectorStoreState = {
  entries: VectorEntry[];
  metadata: DatasetMetadata | null;
};
```

**After**:
```ts
type VectorStoreState = {
  csvEntries: VectorEntry[];               // Renamed from entries
  csvMetadata: DatasetMetadata | null;    // Renamed from metadata
  pdfEntries: PdfVectorEntry[];           // NEW
  pdfMetadata: PdfDatasetMetadata | null; // NEW
};
```

### `VectorStore` class *(modified public API)*
*Owner: `src/lib/vector-store/index.ts`*

| Method | Change | Description |
|--------|--------|-------------|
| `loadCsv(entries, metadata)` | Renamed from `load()` | Replaces CSV partition only |
| `loadPdf(entries, metadata)` | NEW | Replaces PDF partition only |
| `isEmpty()` | Updated | Returns `true` only when both partitions are empty |
| `isCsvLoaded()` | NEW | `csvEntries.length > 0` |
| `isPdfLoaded()` | NEW | `pdfEntries.length > 0` |
| `searchCsv(vector, topK?)` | Renamed from `search()` | Cosine similarity over CSV partition |
| `searchPdf(vector, topK?)` | NEW | Cosine similarity over PDF partition |
| `getCsvMetadata()` | Renamed from `getMetadata()` | Returns `csvMetadata` |
| `getPdfMetadata()` | NEW | Returns `pdfMetadata` |
| `getItems()` | Unchanged | Returns CSV `BidItem[]` for analytics |

All existing analytics methods (`getTopByTotalCost`, `detectOutliers`, `summarize`) are unchanged — they operate solely on the CSV partition.

---

## Entity Relationships

```
PDF File (filesystem)
    │
    ▼
pdfjs-dist getTextContent() per page
    │
    ├── quality check passes (≥200 chars)
    │       extractionMethod = 'native'
    │
    └── quality check fails (<200 chars)
            │ render page → PageImage (pdfjs + canvas)
            ▼
            Claude claude-sonnet-4-6 vision
            extractionMethod = 'vision'
    │
    ▼
ExtractedPage[]         (one per non-skipped page; normalized common format)
    │ pdf-chunker
    ▼
ContentChunk[]          (section-based or page-based; carries extractionMethod)
    │ generateEmbeddings()
    ▼
PdfVectorEntry[]        (chunk + L2-normalised vector)
    │ store.loadPdf()
    ▼
VectorStore.pdfEntries  (PDF partition; independent of CSV partition)
    │ agent tool
    ▼
searchPlanDocuments()   (returns top-K PdfVectorEntry.text + chunk metadata)
```

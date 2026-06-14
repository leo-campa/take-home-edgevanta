# Data Model: Chat UI with CSV Upload

**Date**: 2026-06-13 | **Feature**: 002-chat-ui-csv-upload

All shapes are defined as TypeScript `type` aliases. Each module declares its own types in a co-located `model.ts` file — there is no shared `src/types/` folder. Cross-module types are imported from the owning module's `model.ts`.

---

## BidItem

**Owned by**: `src/lib/csv-normaliser/model.ts`

A single normalised line item from an ingested CSV row. The source of truth for all analytical operations.

```ts
type BidItem = {
  id: string                              // Zero-based row index as string ("0", "1", …)
  item_number: string | null              // Canonical: from item_no / item_number / item headers
  description: string | null             // Canonical: from description / desc / item_desc headers
  quantity: number | string | null       // number if purely numeric; original string if mixed (e.g. "100 LF")
  unit: string | null                    // Canonical: from unit / uom headers
  unit_price: number | null              // Canonical: from unit_price / unit_prc / uprice headers
  total_cost: number | null              // Canonical: from total / ext_amt / amount / total_cost headers
  extra_fields: Record<string, string | number | null>  // All non-canonical columns, snake_case keys
  raw_row: Record<string, string>        // Original CSV row verbatim (pre-normalisation)
}
```

**Normalisation rules** (applied in `lib/csv-normaliser.ts`):
- Column names: `.trim()` → camelCase split (`/([a-z])([A-Z])/g` → `$1_$2`) → whitespace → `_` → `.toLowerCase()`
- Numeric cells (after stripping `$` / `,`): stored as `number`
- Mixed cells (e.g. `"100 LF"`, `"202-0100"`): stored as trimmed `string`
- Empty / whitespace-only cells: stored as `null`

---

## NormalisedRow

**Owned by**: `src/lib/csv-normaliser/model.ts`

Intermediate shape produced by `lib/csv-normaliser.ts` before canonical field mapping.

```ts
type NormalisedRow = {
  headers: Record<string, string>                        // raw header → snake_case header
  values: Record<string, string | number | null>        // snake_case header → normalised value
}
```

---

## VectorEntry

**Owned by**: `src/lib/vector-store/model.ts`

A stored embedding paired with its source item, held in the vector store.

```ts
type VectorEntry = {
  id: string              // Matches BidItem.id
  text: string            // Human-readable text chunk used to generate the embedding
  vector: number[]        // L2-normalised 1536-dim embedding (text-embedding-3-small)
  item: BidItem           // Full item stored inline for retrieval without a join
}
```

**Notes**:
- Vectors are L2-normalised at ingest time → query-time similarity is a dot-product
- `text` is stored for debuggability and can be returned as context to the LLM

---

## DatasetMetadata

**Owned by**: `src/lib/vector-store/model.ts`

Provenance for the active in-memory dataset.

```ts
type DatasetMetadata = {
  filename: string                         // Original uploaded filename
  saved_path: string                       // Absolute path to saved file on disk
  ingested_at: string                      // ISO 8601 timestamp
  record_count: number                     // Rows successfully embedded
  skipped_count: number                    // Rows skipped (empty or unrecoverable)
  column_mapping: Record<string, string>   // snake_case header → canonical field (if mapped)
  warnings: string[]                       // Non-fatal issues e.g. "unit_price missing in 3 rows"
}
```

---

## VectorStore (runtime class)

In-memory singleton held on `globalThis.__vectorStore`.

```ts
// Conceptual — implemented as a class in lib/vector-store.ts
type VectorStoreState = {
  entries: VectorEntry[]
  metadata: DatasetMetadata | null
}
```

**State transitions**:
```
empty  ──(ingest)──►  loaded
loaded ──(re-upload)─►  loaded   // full replacement, not merge
loaded ──(restart)──►  empty     // globalThis wiped on process exit
```

---

## IngestionResult

**Owned by**: `src/pages/api/ingest.ts` (inline — API-only response shape)

Returned by `POST /api/ingest` on success.

```ts
type IngestionResult = {
  filename: string
  record_count: number
  skipped_count: number
  column_mapping: Record<string, string>
  warnings: string[]
}
```

---

## Message

**Owned by**: `src/hooks/useChat/model.ts`

A single entry in the browser-side conversation state.

```ts
type Message = {
  id: string                                   // crypto.randomUUID()
  role: 'user' | 'agent' | 'system'           // system = ingestion confirmations / errors
  content: string                              // Markdown supported for agent role
  timestamp: number                            // Date.now()
}
```

Stored in React `useState<Message[]>`. Not sent to the server. Cleared on page refresh.

---

## Analytics Types

**Owned by**: `src/lib/analytics/model.ts`

```ts
type OutlierResult = {
  item: BidItem
  cluster_mean: number
  cluster_stddev: number
  deviation_factor: number      // (unit_price - mean) / stddev
  cluster_size: number
}

type QuantitySummary = {
  total_items: number
  total_estimated_cost: number
  items_with_missing_price: number
  items_with_missing_quantity: number
  by_unit: Record<string, {
    count: number
    total_quantity: number | null
    total_cost: number
  }>
}

type AgentChatResponse = {
  answer: string     // Markdown-formatted natural language response
}
```

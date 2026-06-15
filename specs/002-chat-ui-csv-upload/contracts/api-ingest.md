# Contract: POST /api/ingest

**Purpose**: Accept a CSV upload, save to disk, normalise columns and cell values, generate per-row embeddings, load the in-memory vector store.

## Request

**Method**: `POST`  
**Path**: `/api/ingest`  
**Content-Type**: `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | File | Yes | CSV only, max 100 MB |

**Client-side validation** (before any network request):
- `file.name` ends in `.csv` OR `file.type` is `text/csv`
- `file.size` ≤ `104_857_600` bytes (100 MB)

## Route Config

```ts
export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 300,
}
```

## Response

### 200 OK

```json
{
  "filename": "bid_data.csv",
  "record_count": 312,
  "skipped_count": 2,
  "column_mapping": {
    "item_no": "item_number",
    "desc": "description",
    "qty": "quantity",
    "unit_prc": "unit_price",
    "ext_amt": "total_cost",
    "unit": "unit"
  },
  "warnings": [
    "2 rows skipped: empty description and item_number",
    "unit_price missing in 1 row (row index 47)"
  ]
}
```

### 400 Bad Request

```json
{ "error": "No file uploaded. Include a 'file' field in multipart/form-data." }
```

### 413 Payload Too Large

```json
{ "error": "File exceeds the 100 MB limit." }
```

### 422 Unprocessable Entity

```json
{ "error": "CSV contained no processable rows.", "skipped_count": 8 }
```

### 500 Internal Server Error

```json
{ "error": "Ingestion failed: <message>" }
```

## Side Effects

1. File written to `./uploads/<ISO-timestamp>-<original-filename>`
2. Previous vector store replaced (not merged)
3. `globalThis.__vectorStore` populated with new `VectorEntry[]` and `DatasetMetadata`

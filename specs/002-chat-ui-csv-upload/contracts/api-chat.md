# Contract: POST /api/chat — SSE Chat Stream

**Purpose**: Accept a natural language question and stream the agent's answer token-by-token as a Server-Sent Events response.

## Request

**Method**: `POST`  
**Path**: `/api/chat`  
**Content-Type**: `application/json`

```json
{ "question": "What are the top 5 most expensive bid items?" }
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `question` | string | Yes | 1–2000 chars, non-empty after `.trim()` |

## Response

**Status**: `200 OK`  
**Content-Type**: `text/event-stream`  
**Cache-Control**: `no-cache`  
**Connection**: `keep-alive`

The server streams a sequence of SSE events. Each event is a JSON-encoded line prefixed with `data: ` and terminated with `\n\n`.

### Event sequence

**Streaming tokens** (zero or more):
```
data: {"type":"token","content":"The top 5 most expensive items are:\n"}\n\n
data: {"type":"token","content":"1. Grading (Item 202-0100) — $245,000\n"}\n\n
```

**Terminal: success**:
```
data: {"type":"done"}\n\n
```

**Terminal: no data loaded**:
```
data: {"type":"no_data","message":"No bid data loaded. Please upload a CSV file first."}\n\n
```

**Terminal: error**:
```
data: {"type":"error","message":"Agent failed: <reason>"}\n\n
```

Exactly one terminal event ends the stream. The client re-enables the send input on any terminal event.

## TypeScript Type

```ts
// Owned by: src/hooks/useChat/model.ts
type SseEvent =
  | { type: 'token';   content: string }
  | { type: 'done' }
  | { type: 'error';   message: string }
  | { type: 'no_data'; message: string }
```

## Client Usage

```ts
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question }),
})
const reader = res.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const text = decoder.decode(value)
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const event: SseEvent = JSON.parse(line.slice(6))
    // handle event: token → append, done/error/no_data → finalise
  }
}
```

## HTTP Error Codes

| Code | Meaning |
|------|---------|
| 400 | Missing or empty `question` field |
| 405 | Method not allowed (only POST accepted) |
| 500 | Unexpected server error before stream starts |

## Agent Tools (internal, unchanged)

Claude selects one or more tools per request before producing the streamed answer:

| Tool | Input type | Routes to | Purpose |
|------|-----------|-----------|---------|
| `get_top_expensive_items` | `{ n: number }` | `lib/analytics.ts` | Sort by `total_cost` desc, return top N |
| `detect_price_outliers` | `{ threshold_stddev?: number }` | `lib/analytics.ts` | Items > N stddevs from cluster mean |
| `summarize_quantities` | `{}` | `lib/analytics.ts` | Aggregate totals by unit |
| `get_average_unit_price` | `{ filter?: string }` | `lib/analytics.ts` | Mean unit price, optional filter |
| `query_bid_data` | `{ question: string, top_k?: number }` | `lib/vector-store.ts` | Cosine similarity search |

Tool results are resolved before streaming begins. The streamed content is only the final natural-language response.

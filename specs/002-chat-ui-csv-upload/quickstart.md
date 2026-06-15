# Quickstart Validation Guide

**Date**: 2026-06-13 | **Feature**: 002-chat-ui-csv-upload

## Prerequisites

- Node.js ≥ 22.14.0
- `OPENAI_API_KEY` set (for embeddings)
- `ANTHROPIC_API_KEY` set (for Claude agent)
- A DOT bid tabulation CSV file (the one provided with the take-home)

## Setup

```bash
git clone <repo> && cd take-home-edgevanta
npm install
cp .env.example .env.local   # fill in OPENAI_API_KEY and ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scenarios

### 1 — CSV Upload with Loading State (FR-001, FR-010, FR-011, FR-012, SC-001)

1. Click the file upload control (MUI Button with hidden `<input type="file" accept=".csv">`)
2. Select the provided CSV
3. Click **Upload** (or the control auto-submits)

**Expected**:
- MUI `CircularProgress` appears; upload button and text input disabled
- Within 60 s: system message in chat — e.g. `"Uploaded 'bid_data.csv' — 312 items ingested. 2 rows skipped."`
- `./uploads/` contains a timestamped copy of the file
- Column mapping shown in confirmation (e.g. `item_no → item_number`)

---

### 2 — Analytical Question (top items)

Type: `What are the top 5 most expensive bid items?`

**Expected**:
- Agent calls `get_top_expensive_items({ n: 5 })` on structured data
- Response lists 5 items with descriptions and total costs — values match the CSV exactly
- Response appears within 10 s

---

### 3 — Outlier Detection

Type: `Are there any items with unusual unit prices?`

**Expected**:
- Agent calls `detect_price_outliers()`
- Outlier items listed with their unit price, cluster average, and deviation factor
- If no outliers: `"No significant price outliers detected"`

---

### 4 — Semantic Question (vector search)

Type: `Show me drainage-related work`

**Expected**:
- Agent calls `query_bid_data` → cosine similarity search
- Returns bid items semantically related to drainage (pipe, culvert, etc.) even if the word "drainage" doesn't appear verbatim in the CSV

---

### 5 — No Data Loaded (FR-015)

1. Refresh the page
2. Type any question

**Expected**: `"No bid data has been loaded yet. Please upload a CSV file first."`

---

### 6 — Invalid File Rejection (FR-014, SC-004)

Select a `.pdf` or `.txt` file.

**Expected**: Client-side error before any upload — `"Only CSV files are accepted"` — no network request sent.

---

### 7 — Oversized File (FR-001)

Select or simulate a file > 100 MB.

**Expected**: Client-side rejection — `"File exceeds the 100 MB limit"` — no upload request sent.

---

### 8 — Conversation History Scroll (FR-004, FR-005, SC-003)

Send 10+ questions.

**Expected**: All messages visible in chronological order; newest auto-scrolled into view; text input pinned at bottom.

---

## Tests (Jest + React Testing Library)

```bash
npm test                    # run full suite
npm test -- --watch         # watch mode
npm test -- --coverage      # coverage report
```

Key cases verified by tests:

| Module | Key assertions |
|--------|---------------|
| `lib/csv-normaliser` | `"ITEM NO"` → `"item_no"`, `"unitPrice"` → `"unit_price"`, `"TotalCost"` → `"total_cost"`, `"$1,234.56"` → `1234.56`, `"100 LF"` stays as-is, `"  hello  "` → `"hello"` |
| `lib/analytics` | top-5 sort matches manual rank; outlier at > 2σ is flagged; item within range is not flagged |
| `lib/vector-store` | top-K returns correct items by cosine score; empty store returns `[]` |
| `lib/bid-item-formatter` | full BidItem produces correct text chunk; missing fields are omitted |
| `hooks/useChat` | mock WS: tokens accumulate in message content; `done` clears `isStreaming`; `error` appends error message |
| `components/ChatInput` | RTL: send button disabled when input empty; fires `onSend` on Enter; shows spinner when `isStreaming` |
| `components/FileUpload` | RTL: non-CSV file shows error; file > 100 MB shows error; valid CSV calls `onUpload` |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | `text-embedding-3-small` embeddings |
| `ANTHROPIC_API_KEY` | Yes | Claude claude-sonnet-4-6 agent |
| `UPLOAD_DIR` | No | Override default `./uploads/` |

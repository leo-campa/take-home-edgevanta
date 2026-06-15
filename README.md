# Construction Bid Estimating Agent

## Requirements

- Node.js >= 22.14.0

## Setup

```bash
git clone <repo-url>
cd take-home-edgevanta
npm install
cp .env.example .env.development
# Fill in your API keys in .env.development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create a `.env.development` file at the root with the following variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Used for embeddings and PDF vision extraction |
| `ANTHROPIC_API_KEY` | Yes | Used for the Claude agent |
| `UPLOAD_DIR` | No | Directory for saved CSVs (default: `./uploads`) |
| `PDF_UPLOAD_DIR` | No | Directory for saved PDFs (default: `./uploads-pdf`) |

## How to Run

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

Upload a CSV (bid data) or a PDF (construction plan set) — or both — using the upload buttons in the chat interface. Once data is loaded, type a question and the agent will respond using the relevant sources.

The agent's tools are also available as a standalone HTTP API:

```bash
# List all available tools and their input schemas
curl http://localhost:3000/api/tools

# Call a tool directly with structured input
curl -X POST http://localhost:3000/api/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{ "name": "get_top_expensive_items", "input": { "n": 5 } }'
```

## Key Decisions

**Hybrid PDF extraction (native → vision fallback)**
`pdfjs-dist` attempts native text extraction first. Pages with fewer than 200 meaningful characters are routed to GPT-4.1 for vision-based extraction. This keeps AI costs proportional to actual need — digitally-generated PDFs are processed entirely in-process at near-zero cost; only genuinely scanned pages trigger an API call.

**Dual-partition vector store**
CSV bid data and PDF plan documents live in independent partitions of the same in-memory store. Uploading one file type never clears the other. The agent searches both partitions on every query and combines results, so an estimator can ask cross-source questions (e.g. "Are the drainage quantities in the bid consistent with the plan notes?").

**Tool-use agent loop**
The Claude agent runs in a tool-use loop and decides which tools to call based on the question — no hardcoded routing. Analytical tools (`get_top_expensive_items`, `detect_price_outliers`, `summarize_quantities`, `get_average_unit_price`) handle structured bid data; semantic search tools (`query_bid_data`, `search_plan_documents`) handle freeform retrieval from both partitions.

**Programmatic tool API**
`GET /api/tools` exposes the full tool catalog with input schemas. `POST /api/tools/invoke` lets any external system call a tool directly by name with structured input and receive structured JSON back. This means the agent's capabilities are operable by another LLM or orchestration system without going through the natural-language chat endpoint.

**Vision cap at 50 pages**
The vision fallback is capped at 50 pages per ingestion session (50 × ~10 s ≈ 500 s, within the 600 s endpoint limit). Pages beyond the cap are skipped with a warning in the response rather than silently dropped or causing a timeout.

## What I'd Change With More Time

- **Streaming ingestion progress** — PDF ingest blocks for minutes on large scanned files. SSE progress events during extraction would make the experience significantly better.
- **Persistent vector store** — the in-memory store is lost on server restart. A real vector DB (pgvector, Pinecone, Weaviate) would make embeddings durable and scalable across restarts and multiple instances.
- **Object storage for uploaded files** — uploaded CSVs and PDFs are saved to local directories (`uploads/`, `uploads-pdf/`) which are lost on redeploy. S3-compatible object storage would make files durable, independently scalable, and accessible across instances.
- **Chunk overlap** — current chunking has no overlap between adjacent sections, which hurts recall on questions that span section boundaries.
- **MCP server** — the tools API is halfway to an MCP-compatible interface. A full MCP implementation would let any MCP-compatible client connect directly without a custom integration.

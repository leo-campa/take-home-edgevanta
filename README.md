# Construction Bid Estimating Agent

A chat interface for querying construction bid data using natural language. Upload a CSV bid tabulation, and ask questions like "What are the top 5 most expensive items?" or "Show me drainage-related work."

## Setup

```bash
git clone <repo-url>
cd take-home-edgevanta
npm install
cp .env.example .env.local
# Add your API keys to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Used for `text-embedding-3-small` embeddings |
| `ANTHROPIC_API_KEY` | Yes | Used for Claude agent (`claude-sonnet-4-6`) |
| `UPLOAD_DIR` | No | Directory for saved CSVs (default: `./uploads`) |

## Usage

1. Click **Upload CSV** and select a bid tabulation file (up to 500 MB)
2. Wait for the confirmation message showing the number of items ingested
3. Type a question in the chat input and press Enter or click Send

## Commands

```bash
npm run dev        # Start development server
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run lint       # Lint with Biome
npm run build      # Production build
```

## Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16 (Pages Router) + MUI | Chat UI, file upload |
| Streaming | SSE via `POST /api/chat` | Token-by-token agent responses |
| CSV parsing | PapaParse + custom normaliser | Column normalisation, canonical field detection |
| Embeddings | OpenAI `text-embedding-3-small` | 1536-dim L2-normalised vectors |
| Vector store | In-memory singleton (`globalThis`) | Dot-product cosine similarity |
| Agent | Anthropic `claude-sonnet-4-6` | Orchestrates analytics vs semantic search |
| Analytics | Deterministic functions | Top items, outliers, quantity summaries |

### Branch Strategy

```
feature/csv-flow/specs          → spec artifacts
feature/csv-flow/setup          → dependencies, config, models
feature/csv-flow/csv-parser     → CSV normaliser + bid formatter
feature/csv-flow/openai-embeddings → embeddings + vector store
feature/csv-flow/ingest-api     → POST /api/ingest
feature/csv-flow/agent          → Claude agent + POST /api/chat (SSE)
feature/csv-flow/chat-input     → useChat hook + UI components
feature/csv-flow/chat-interface → ChatInterface + page
```

### Key Design Decisions

- **SSE over WebSocket**: `POST /api/chat` returns `text/event-stream`, no custom server required
- **In-memory vector store**: Simple dot-product on L2-normalised vectors; swap by changing `src/lib/vector-store/index.ts`
- **Deterministic analytics**: Top items, outliers, and summaries computed directly on `BidItem[]`, not via LLM
- **Column normalisation**: `trim → camelCase split → whitespace→_ → toLowerCase`
- **No shared types folder**: Each module owns its types in a co-located `model.ts`

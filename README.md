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

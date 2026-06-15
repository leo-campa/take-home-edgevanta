import Anthropic from "@anthropic-ai/sdk";
import {
  detectPriceOutliers,
  getAverageUnitPrice,
  getTopExpensiveItems,
  summarizeQuantities,
} from "@/lib/analytics";
import { generateEmbeddings } from "@/lib/embeddings";
import { getStore } from "@/lib/vector-store";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an expert construction estimator assistant with access to two data sources:

1. CSV Bid Data (structured): Contains bid items with quantities, unit prices, and totals.
   - Use get_top_expensive_items, detect_price_outliers, summarize_quantities, get_average_unit_price for analytical questions
   - Use query_bid_data for semantic search over bid item descriptions

2. Plan Documents (unstructured): Extracted text from construction plan-set PDFs, including sheet notes, specifications, quantities, and requirements.
   - Use search_plan_documents for any question about the plan content

When both sources are available, use tools from both to give a complete, cross-referenced answer.
Always cite the source in your response (e.g., "According to Sheet D-101..." or "From the bid data...").
Format numbers with commas and currency symbols where appropriate.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_top_expensive_items",
    description: "Returns the top N most expensive bid items by total cost.",
    input_schema: {
      type: "object" as const,
      properties: {
        n: { type: "number", description: "Number of items to return" },
      },
      required: ["n"],
    },
  },
  {
    name: "detect_price_outliers",
    description:
      "Detects bid items whose unit price significantly deviates from the cluster mean.",
    input_schema: {
      type: "object" as const,
      properties: {
        threshold_stddev: {
          type: "number",
          description: "Standard deviation threshold (default: 2)",
        },
      },
    },
  },
  {
    name: "summarize_quantities",
    description:
      "Summarises total quantities and costs grouped by unit of measure.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_average_unit_price",
    description:
      "Returns the average unit price, optionally filtered by description keyword.",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description: "Optional keyword to filter by description",
        },
      },
    },
  },
  {
    name: "query_bid_data",
    description:
      "Performs semantic search over the embedded bid items using cosine similarity.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "Natural language question to search for",
        },
        top_k: {
          type: "number",
          description: "Number of results to return (default: 5)",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "search_plan_documents",
    description:
      "Performs semantic search over uploaded construction plan documents (PDFs). Returns the most relevant sections including sheet numbers, notes, specifications, and quantities. Use this when the user asks about plan requirements, specifications, notes, quantities, or drawing details.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        top_k: {
          type: "number",
          description: "Number of results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const store = getStore();
  const items = store.getItems();

  switch (name) {
    case "get_top_expensive_items": {
      const n = (input.n as number) ?? 5;
      return JSON.stringify(getTopExpensiveItems(n, items));
    }

    case "detect_price_outliers": {
      const threshold = (input.threshold_stddev as number) ?? 2;
      return JSON.stringify(detectPriceOutliers(items, threshold));
    }

    case "summarize_quantities": {
      return JSON.stringify(summarizeQuantities(items));
    }

    case "get_average_unit_price": {
      const filter = input.filter as string | undefined;
      return JSON.stringify({ average_unit_price: getAverageUnitPrice(items, filter) });
    }

    case "query_bid_data": {
      const question = input.question as string;
      const topK = Math.min((input.top_k as number) ?? 5, 10);
      const [queryVector] = await generateEmbeddings([question]);
      const results = store.searchCsv(queryVector, topK);
      return JSON.stringify(results.map(({ item, text }) => ({ item, text })));
    }

    case "search_plan_documents": {
      const query = input.query as string;
      const topK = Math.min((input.top_k as number) ?? 5, 10);
      const [queryVector] = await generateEmbeddings([query]);
      const results = store.searchPdf(queryVector, topK);
      const formatted = results.map(
        (entry) =>
          `[Page ${entry.chunk.page} — Sheet: ${entry.chunk.sheet ?? "UNKNOWN"} — Section: ${entry.chunk.section ?? "General Content"}]\n${entry.chunk.text}`,
      );
      return JSON.stringify(formatted);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function runToolCalls(
  content: Anthropic.ContentBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolUseBlocks = content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

  return Promise.all(
    toolUseBlocks.map(async (block) => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: await executeTool(block.name, block.input as Record<string, unknown>),
    })),
  );
}

function emitTextBlocks(content: Anthropic.ContentBlock[], onToken: (token: string) => void) {
  for (const block of content) {
    if (block.type === "text") onToken(block.text);
  }
}

export async function runAgent(
  question: string,
  onToken: (token: string) => void,
): Promise<void> {
  const store = getStore();

  if (store.isEmpty()) {
    onToken("No data has been loaded. Please upload a CSV file (bid data) or a PDF (plan documents), or both.");
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolResults = await runToolCalls(response.content);
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    } else {
      emitTextBlocks(response.content, onToken);
      break;
    }
  }
}

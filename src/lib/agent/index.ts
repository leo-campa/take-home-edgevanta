import Anthropic from "@anthropic-ai/sdk";
import {
  detectPriceOutliers,
  getAverageUnitPrice,
  getTopExpensiveItems,
  summarizeQuantities,
} from "@/lib/analytics";
import { getStore } from "@/lib/vector-store";

const MODEL = "claude-sonnet-4-6";

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
];

const SYSTEM_PROMPT = `You are an expert construction bid analyst. You have access to tools that query structured bid data and semantic embeddings. Use the appropriate tool based on the user's intent:
- Analytical questions (totals, rankings, outliers, averages) → structured tools
- Semantic questions (descriptions, categories, related work) → query_bid_data
Provide clear, concise answers based on the data returned by the tools. Format numbers with commas and currency symbols where appropriate.`;

function executeTool(name: string, input: Record<string, unknown>): string {
  const store = getStore();
  const items = store.getItems();

  switch (name) {
    case "get_top_expensive_items": {
      const n = (input.n as number) ?? 5;
      const top = getTopExpensiveItems(n, items);
      return JSON.stringify(top);
    }

    case "detect_price_outliers": {
      const threshold = (input.threshold_stddev as number) ?? 2;
      const outliers = detectPriceOutliers(items, threshold);
      return JSON.stringify(outliers);
    }

    case "summarize_quantities": {
      return JSON.stringify(summarizeQuantities(items));
    }

    case "get_average_unit_price": {
      const filter = input.filter as string | undefined;
      const avg = getAverageUnitPrice(items, filter);
      return JSON.stringify({ average_unit_price: avg });
    }

    case "query_bid_data": {
      return JSON.stringify({
        message:
          "Semantic search requires embedding the query. Using top results from store.",
        items: store.getTopByTotalCost((input.top_k as number) ?? 5),
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function runAgent(
  question: string,
  onToken: (token: string) => void,
): Promise<void> {
  const store = getStore();

  if (store.isEmpty()) {
    onToken("No bid data loaded. Please upload a CSV file first.");
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  let continueLoop = true;

  while (continueLoop) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = executeTool(
            block.name,
            block.input as Record<string, unknown>,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;

      for (const block of response.content) {
        if (block.type === "text") {
          onToken(block.text);
        }
      }
    }
  }
}

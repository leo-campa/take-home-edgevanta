/**
 * @jest-environment node
 */

import type { BidItem } from "@/lib/csv-normaliser/model";
import { getStore } from "@/lib/vector-store";
import type { DatasetMetadata } from "@/lib/vector-store/model";
import { runAgent } from "./index";

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

jest.mock("@/lib/vector-store", () => ({
  getStore: jest.fn(),
}));

jest.mock("@/lib/embeddings", () => ({
  generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

const mockGetItems = jest.fn();
const mockIsEmpty = jest.fn();
const mockGetTopByTotalCost = jest.fn();
const mockSearchCsv = jest.fn();
const mockSearchPdf = jest.fn();

const mockStore = {
  isEmpty: mockIsEmpty,
  getItems: mockGetItems,
  getTopByTotalCost: mockGetTopByTotalCost,
  searchCsv: mockSearchCsv,
  searchPdf: mockSearchPdf,
};

const _meta: DatasetMetadata = {
  filename: "test.csv",
  saved_path: "/uploads/test.csv",
  ingested_at: new Date().toISOString(),
  record_count: 3,
  skipped_count: 0,
  column_mapping: {},
  warnings: [],
};

const sampleItem: BidItem = {
  id: "0",
  item_number: "1",
  description: "Concrete Pipe",
  quantity: 100,
  unit: "LF",
  unit_price: 50,
  total_cost: 5000,
  project_id: null,
  let_date: null,
  county: null,
  engineer_estimate: null,
  bidder: null,
  bid_rank: null,
  bid_total: null,
  extra_fields: {},
  raw_row: {},
};

function makeTextResponse(text: string) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
  };
}

function makeToolUseResponse(
  toolName: string,
  toolId: string,
  input: Record<string, unknown>,
) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: toolId, name: toolName, input }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getStore as jest.Mock).mockReturnValue(mockStore);
  mockGetItems.mockReturnValue([sampleItem]);
  mockGetTopByTotalCost.mockReturnValue([sampleItem]);
  mockSearchCsv.mockReturnValue([]);
  mockSearchPdf.mockReturnValue([]);
});

describe("runAgent", () => {
  it("returns no-data message without calling the API when the store is empty", async () => {
    mockIsEmpty.mockReturnValue(true);
    const onToken = jest.fn();
    await runAgent("What are the top items?", onToken);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenCalledWith(expect.stringContaining("No data"));
  });

  it("no-data message mentions both CSV and PDF upload options", async () => {
    mockIsEmpty.mockReturnValue(true);
    const onToken = jest.fn();
    await runAgent("What are the top items?", onToken);
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toMatch(/CSV/i);
    expect(combined).toMatch(/PDF/i);
  });

  it("no-data message mentions both CSV and PDF upload options", async () => {
    mockIsEmpty.mockReturnValue(true);
    const onToken = jest.fn();
    await runAgent("What are the top items?", onToken);
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toMatch(/CSV/i);
    expect(combined).toMatch(/PDF/i);
  });

  it("calls onToken with streamed text content", async () => {
    mockIsEmpty.mockReturnValue(false);
    mockCreate.mockResolvedValue(makeTextResponse("Here are the top items."));
    const onToken = jest.fn();
    await runAgent("List top items", onToken);
    expect(onToken).toHaveBeenCalled();
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toContain("Here are the top items.");
  });

  it("routes analytical questions through tool use", async () => {
    mockIsEmpty.mockReturnValue(false);
    mockCreate
      .mockResolvedValueOnce(
        makeToolUseResponse("get_top_expensive_items", "tu_1", { n: 5 }),
      )
      .mockResolvedValueOnce(
        makeTextResponse("The top 5 items are listed above."),
      );

    const onToken = jest.fn();
    await runAgent("What are the top 5 most expensive items?", onToken);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toContain("top 5 items");
  });

  it("routes CSV semantic questions through query_bid_data which calls searchCsv", async () => {
    mockIsEmpty.mockReturnValue(false);
    mockCreate
      .mockResolvedValueOnce(
        makeToolUseResponse("query_bid_data", "tu_2", {
          question: "drainage work",
          top_k: 5,
        }),
      )
      .mockResolvedValueOnce(makeTextResponse("Drainage-related items found."));

    const onToken = jest.fn();
    await runAgent("Show me drainage-related work", onToken);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockSearchCsv).toHaveBeenCalled();
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toContain("Drainage");
  });

  it("routes PDF questions through search_plan_documents which calls searchPdf", async () => {
    mockIsEmpty.mockReturnValue(false);
    mockCreate
      .mockResolvedValueOnce(
        makeToolUseResponse("search_plan_documents", "tu_3", {
          query: "drainage requirements",
          top_k: 5,
        }),
      )
      .mockResolvedValueOnce(
        makeTextResponse("According to Sheet D-101, install 24-inch pipe."),
      );

    const onToken = jest.fn();
    await runAgent("What does the plan say about drainage?", onToken);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockSearchPdf).toHaveBeenCalled();
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toContain("D-101");
  });

  it("includes search_plan_documents in the TOOLS array", async () => {
    mockIsEmpty.mockReturnValue(false);
    mockCreate.mockResolvedValue(makeTextResponse("ok"));
    await runAgent("hi", jest.fn());

    const firstCall = mockCreate.mock.calls[0][0];
    const toolNames = firstCall.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("search_plan_documents");
  });

  it("includes both CSV and PDF sources in the system prompt", async () => {
    mockIsEmpty.mockReturnValue(false);
    mockCreate.mockResolvedValue(makeTextResponse("ok"));
    await runAgent("hi", jest.fn());

    const firstCall = mockCreate.mock.calls[0][0];
    const systemPrompt =
      typeof firstCall.system === "string"
        ? firstCall.system
        : (firstCall.messages?.[0]?.content ?? "");
    expect(systemPrompt).toMatch(/CSV/i);
    expect(systemPrompt).toMatch(/PDF|plan/i);
  });
});

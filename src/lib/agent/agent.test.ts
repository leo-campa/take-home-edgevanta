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

const mockGetItems = jest.fn();
const mockIsEmpty = jest.fn();
const mockGetTopByTotalCost = jest.fn();
const mockSearch = jest.fn();

const mockStore = {
  isEmpty: mockIsEmpty,
  getItems: mockGetItems,
  getTopByTotalCost: mockGetTopByTotalCost,
  search: mockSearch,
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
  mockSearch.mockReturnValue([]);
});

describe("runAgent", () => {
  it("returns no-data message without calling API when store is empty", async () => {
    mockIsEmpty.mockReturnValue(true);
    const onToken = jest.fn();
    await runAgent("What are the top items?", onToken);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenCalledWith(
      expect.stringContaining("No bid data"),
    );
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

  it("routes semantic questions through query_bid_data tool", async () => {
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
    const combined = onToken.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(combined).toContain("Drainage");
  });
});

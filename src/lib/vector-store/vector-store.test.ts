/**
 * @jest-environment node
 */

import type { BidItem } from "@/lib/csv-normaliser/model";
import { getStore } from "./index";
import type { DatasetMetadata, VectorEntry } from "./model";

function makeItem(overrides: Partial<BidItem> = {}): BidItem {
  return {
    id: "0",
    item_number: "1",
    description: "Concrete Pipe",
    quantity: 100,
    unit: "LF",
    unit_price: 50,
    total_cost: 5000,
    extra_fields: {},
    raw_row: {},
    ...overrides,
  };
}

function makeEntry(
  id: string,
  vec: number[],
  itemOverrides: Partial<BidItem> = {},
): VectorEntry {
  return {
    id,
    text: `Item ${id}`,
    vector: vec,
    item: makeItem({ id, ...itemOverrides }),
  };
}

const meta: DatasetMetadata = {
  filename: "test.csv",
  saved_path: "/uploads/test.csv",
  ingested_at: new Date().toISOString(),
  record_count: 0,
  skipped_count: 0,
  column_mapping: {},
  warnings: [],
};

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__vectorStore;
});

describe("getStore", () => {
  it("returns the same singleton", () => {
    expect(getStore()).toBe(getStore());
  });
});

describe("VectorStore.isEmpty", () => {
  it("is empty before any load", () => {
    expect(getStore().isEmpty()).toBe(true);
  });

  it("is not empty after load", () => {
    const store = getStore();
    store.load([makeEntry("0", [1, 0])], meta);
    expect(store.isEmpty()).toBe(false);
  });
});

describe("VectorStore.search", () => {
  it("returns empty array when store is empty", () => {
    expect(getStore().search([1, 0])).toEqual([]);
  });

  it("returns closest vector by dot product", () => {
    const store = getStore();
    const e1 = makeEntry("0", [1, 0]);
    const e2 = makeEntry("1", [0, 1]);
    store.load([e1, e2], meta);

    const result = store.search([1, 0], 1);
    expect(result[0].id).toBe("0");
  });

  it("returns top-K results", () => {
    const store = getStore();
    const entries = [
      makeEntry("0", [1, 0, 0]),
      makeEntry("1", [0, 1, 0]),
      makeEntry("2", [0, 0, 1]),
    ];
    store.load(entries, meta);
    expect(store.search([1, 0, 0], 2)).toHaveLength(2);
  });
});

describe("VectorStore.detectOutliers", () => {
  it("flags items > 2σ from cluster mean", () => {
    const store = getStore();
    const entries = [
      makeEntry("0", [1], { description: "Pipe", unit_price: 50 }),
      makeEntry("1", [1], { description: "Pipe", unit_price: 52 }),
      makeEntry("2", [1], { description: "Pipe", unit_price: 51 }),
      makeEntry("3", [1], { description: "Pipe", unit_price: 53 }),
      makeEntry("4", [1], { description: "Pipe", unit_price: 49 }),
      makeEntry("5", [1], { description: "Pipe", unit_price: 50 }),
      makeEntry("6", [1], { description: "Pipe", unit_price: 1000 }),
    ];
    store.load(entries, meta);
    const outliers = store.detectOutliers(2);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    expect(outliers[0].item.unit_price).toBe(1000);
  });

  it("ignores clusters with fewer than 3 items", () => {
    const store = getStore();
    const entries = [
      makeEntry("0", [1], { description: "Rare", unit_price: 50 }),
      makeEntry("1", [1], { description: "Rare", unit_price: 5000 }),
    ];
    store.load(entries, meta);
    expect(store.detectOutliers()).toHaveLength(0);
  });
});

describe("VectorStore.summarize", () => {
  it("totals match fixture data", () => {
    const store = getStore();
    const entries = [
      makeEntry("0", [1], { unit: "LF", quantity: 100, total_cost: 5000 }),
      makeEntry("1", [1], { unit: "LF", quantity: 200, total_cost: 10000 }),
      makeEntry("2", [1], { unit: "EA", quantity: 5, total_cost: 2500 }),
    ];
    store.load(entries, meta);
    const summary = store.summarize();
    expect(summary.total_items).toBe(3);
    expect(summary.total_estimated_cost).toBe(17500);
    expect(summary.by_unit.LF.count).toBe(2);
    expect(summary.by_unit.LF.total_quantity).toBe(300);
    expect(summary.by_unit.EA.total_cost).toBe(2500);
  });
});

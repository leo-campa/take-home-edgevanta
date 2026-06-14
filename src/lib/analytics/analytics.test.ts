/**
 * @jest-environment node
 */

import type { BidItem } from "@/lib/csv-normaliser/model";
import {
  detectPriceOutliers,
  getAverageUnitPrice,
  getTopExpensiveItems,
  summarizeQuantities,
} from "./index";

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

const fixture: BidItem[] = [
  makeItem({ id: "0", total_cost: 5000, unit_price: 50 }),
  makeItem({ id: "1", total_cost: 10000, unit_price: 100 }),
  makeItem({ id: "2", total_cost: 2500, unit_price: 25 }),
  makeItem({ id: "3", total_cost: 15000, unit_price: 150 }),
  makeItem({ id: "4", total_cost: 1000, unit_price: 10 }),
];

describe("getTopExpensiveItems", () => {
  it("returns items sorted by total_cost descending", () => {
    const top3 = getTopExpensiveItems(3, fixture);
    expect(top3[0].total_cost).toBe(15000);
    expect(top3[1].total_cost).toBe(10000);
    expect(top3[2].total_cost).toBe(5000);
    expect(top3).toHaveLength(3);
  });

  it("excludes items with null total_cost", () => {
    const items = [...fixture, makeItem({ id: "99", total_cost: null })];
    const top = getTopExpensiveItems(10, items);
    expect(top.every((i) => i.total_cost !== null)).toBe(true);
  });

  it("does not mutate the original array", () => {
    const original = [...fixture];
    getTopExpensiveItems(3, fixture);
    expect(fixture).toEqual(original);
  });
});

describe("detectPriceOutliers", () => {
  const clusterItems: BidItem[] = [
    makeItem({ id: "0", description: "Pipe", unit_price: 50 }),
    makeItem({ id: "1", description: "Pipe", unit_price: 52 }),
    makeItem({ id: "2", description: "Pipe", unit_price: 51 }),
    makeItem({ id: "3", description: "Pipe", unit_price: 53 }),
    makeItem({ id: "4", description: "Pipe", unit_price: 49 }),
    makeItem({ id: "5", description: "Pipe", unit_price: 50 }),
    makeItem({ id: "6", description: "Pipe", unit_price: 1000 }),
  ];

  it("flags items that deviate more than 2σ from cluster mean", () => {
    const outliers = detectPriceOutliers(clusterItems, 2);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    expect(outliers[0].item.unit_price).toBe(1000);
    expect(outliers[0].deviation_factor).toBeGreaterThan(2);
  });

  it("does not flag items within normal range", () => {
    const normals = detectPriceOutliers(clusterItems, 2);
    const flaggedIds = normals.map((o) => o.item.id);
    expect(flaggedIds).not.toContain("0");
    expect(flaggedIds).not.toContain("1");
  });

  it("excludes clusters with fewer than 3 items", () => {
    const small = [
      makeItem({ id: "0", description: "Rare", unit_price: 50 }),
      makeItem({ id: "1", description: "Rare", unit_price: 5000 }),
    ];
    expect(detectPriceOutliers(small)).toHaveLength(0);
  });
});

describe("summarizeQuantities", () => {
  const items: BidItem[] = [
    makeItem({ id: "0", unit: "LF", quantity: 100, total_cost: 5000 }),
    makeItem({ id: "1", unit: "LF", quantity: 200, total_cost: 10000 }),
    makeItem({ id: "2", unit: "EA", quantity: 5, total_cost: 2500 }),
    makeItem({
      id: "3",
      unit: null,
      quantity: null,
      unit_price: null,
      total_cost: null,
    }),
  ];

  it("total_items counts all items", () => {
    expect(summarizeQuantities(items).total_items).toBe(4);
  });

  it("total_estimated_cost sums numeric total_cost only", () => {
    expect(summarizeQuantities(items).total_estimated_cost).toBe(17500);
  });

  it("items_with_missing_price counts null unit_price", () => {
    expect(summarizeQuantities(items).items_with_missing_price).toBe(1);
  });

  it("items_with_missing_quantity counts null quantity", () => {
    expect(summarizeQuantities(items).items_with_missing_quantity).toBe(1);
  });

  it("by_unit groups correctly", () => {
    const summary = summarizeQuantities(items);
    expect(summary.by_unit.LF.count).toBe(2);
    expect(summary.by_unit.LF.total_quantity).toBe(300);
    expect(summary.by_unit.EA.total_cost).toBe(2500);
  });
});

describe("getAverageUnitPrice", () => {
  it("returns average of all unit prices", () => {
    const avg = getAverageUnitPrice(fixture);
    expect(avg).toBeCloseTo((50 + 100 + 25 + 150 + 10) / 5, 5);
  });

  it("filters by description substring when provided", () => {
    const items = [
      makeItem({ description: "Concrete Pipe", unit_price: 50 }),
      makeItem({ description: "Steel Pipe", unit_price: 100 }),
      makeItem({ description: "Asphalt", unit_price: 200 }),
    ];
    const avg = getAverageUnitPrice(items, "pipe");
    expect(avg).toBeCloseTo(75, 5);
  });

  it("returns 0 when no items have a unit price", () => {
    const items = [makeItem({ unit_price: null })];
    expect(getAverageUnitPrice(items)).toBe(0);
  });
});

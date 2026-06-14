import type { BidItem } from "@/lib/csv-normaliser/model";
import { formatBidItem } from "./index";

const fullItem: BidItem = {
  id: "0",
  item_number: "101",
  description: "Concrete Pipe",
  quantity: 100,
  unit: "LF",
  unit_price: 50,
  total_cost: 5000,
  extra_fields: { notes: "rush order" },
  raw_row: {},
};

describe("formatBidItem", () => {
  it("produces a full text chunk for a complete item", () => {
    const text = formatBidItem(fullItem);
    expect(text).toContain("Item Number: 101");
    expect(text).toContain("Description: Concrete Pipe");
    expect(text).toContain("Quantity: 100 LF");
    expect(text).toContain("Unit Price: $50");
    expect(text).toContain("Total Price: $5000");
  });

  it("appends extra_fields", () => {
    const text = formatBidItem(fullItem);
    expect(text).toContain("notes: rush order");
  });

  it("omits null fields", () => {
    const partial: BidItem = {
      ...fullItem,
      unit_price: null,
      total_cost: null,
      unit: null,
    };
    const text = formatBidItem(partial);
    expect(text).not.toContain("Unit Price");
    expect(text).not.toContain("Total Price");
    expect(text).toContain("Quantity: 100");
  });

  it("omits extra_fields when include_extra_fields is false", () => {
    const text = formatBidItem(fullItem, { include_extra_fields: false });
    expect(text).not.toContain("notes");
  });

  it("uses custom currency prefix", () => {
    const text = formatBidItem(fullItem, { currency_prefix: "€" });
    expect(text).toContain("Unit Price: €50");
  });

  it("omits quantity unit when unit is null", () => {
    const item: BidItem = { ...fullItem, unit: null };
    const text = formatBidItem(item);
    expect(text).toContain("Quantity: 100");
    expect(text).not.toContain("Quantity: 100 ");
  });
});

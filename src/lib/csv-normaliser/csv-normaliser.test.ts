import {
  buildColumnMapping,
  detectCanonicalField,
  normaliseCell,
  normaliseHeader,
  normaliseRow,
} from "./index";

describe("normaliseHeader", () => {
  it("lowercases plain headers", () => {
    expect(normaliseHeader("ITEM NO")).toBe("item_no");
  });

  it("converts whitespace to underscores", () => {
    expect(normaliseHeader("Unit Price")).toBe("unit_price");
  });

  it("splits camelCase", () => {
    expect(normaliseHeader("unitPrice")).toBe("unit_price");
  });

  it("splits PascalCase", () => {
    expect(normaliseHeader("TotalCost")).toBe("total_cost");
  });

  it("splits PascalCase with multiple words", () => {
    expect(normaliseHeader("ItemNumber")).toBe("item_number");
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseHeader("  qty  ")).toBe("qty");
  });
});

describe("normaliseCell", () => {
  it("parses US currency strings to numbers", () => {
    expect(normaliseCell("$1,234.56")).toBe(1234.56);
  });

  it("parses plain numeric strings", () => {
    expect(normaliseCell("100")).toBe(100);
  });

  it("keeps mixed strings as trimmed strings", () => {
    expect(normaliseCell("100 LF")).toBe("100 LF");
  });

  it("trims string values", () => {
    expect(normaliseCell("  hello  ")).toBe("hello");
  });

  it("returns null for empty string", () => {
    expect(normaliseCell("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normaliseCell("   ")).toBeNull();
  });

  it("keeps alphanumeric codes as strings", () => {
    expect(normaliseCell("202-0100")).toBe("202-0100");
  });
});

describe("detectCanonicalField", () => {
  it("maps item_no to item_number", () => {
    expect(detectCanonicalField("item_no")).toBe("item_number");
  });

  it("maps desc to description", () => {
    expect(detectCanonicalField("desc")).toBe("description");
  });

  it("maps qty to quantity", () => {
    expect(detectCanonicalField("qty")).toBe("quantity");
  });

  it("maps unit_prc to unit_price", () => {
    expect(detectCanonicalField("unit_prc")).toBe("unit_price");
  });

  it("maps ext_amt to total_cost", () => {
    expect(detectCanonicalField("ext_amt")).toBe("total_cost");
  });

  it("maps uom to unit", () => {
    expect(detectCanonicalField("uom")).toBe("unit");
  });

  it("returns null for unknown headers", () => {
    expect(detectCanonicalField("notes")).toBeNull();
  });
});

describe("normaliseRow", () => {
  it("maps canonical fields from raw row", () => {
    const rawRow = {
      "ITEM NO": "1",
      DESC: "Concrete Pipe",
      QTY: "100",
      UNIT: "LF",
      "UNIT PRC": "$50.00",
      "EXT AMT": "$5,000.00",
    };
    const result = normaliseRow(rawRow, 0);
    expect(result.id).toBe("0");
    expect(result.item_number).toBe("1");
    expect(result.description).toBe("Concrete Pipe");
    expect(result.quantity).toBe(100);
    expect(result.unit).toBe("LF");
    expect(result.unit_price).toBe(50);
    expect(result.total_cost).toBe(5000);
  });

  it("stores unknown columns in extra_fields", () => {
    const rawRow = { Notes: "some note", DESC: "item" };
    const result = normaliseRow(rawRow, 0);
    expect(result.extra_fields.notes).toBe("some note");
  });

  it("sets null for empty cells", () => {
    const rawRow = { "ITEM NO": "", DESC: "item" };
    const result = normaliseRow(rawRow, 0);
    expect(result.item_number).toBeNull();
  });

  it("preserves raw_row verbatim", () => {
    const rawRow = { "ITEM NO": "1", DESC: "Pipe" };
    const result = normaliseRow(rawRow, 1);
    expect(result.raw_row).toEqual(rawRow);
    expect(result.id).toBe("1");
  });
});

describe("buildColumnMapping", () => {
  it("maps known headers to canonical names", () => {
    const mapping = buildColumnMapping(["ITEM NO", "DESC", "QTY", "NOTES"]);
    expect(mapping.item_no).toBe("item_number");
    expect(mapping.desc).toBe("description");
    expect(mapping.qty).toBe("quantity");
    expect(mapping.notes).toBeUndefined();
  });
});

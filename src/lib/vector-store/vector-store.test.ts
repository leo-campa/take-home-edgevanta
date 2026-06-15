/**
 * @jest-environment node
 */

import type { BidItem } from "@/lib/csv-normaliser/model";
import type { ContentChunk } from "@/lib/pdf-chunker/model";
import { getStore } from "./index";
import type {
  DatasetMetadata,
  PdfDatasetMetadata,
  PdfVectorEntry,
  VectorEntry,
} from "./model";

// ─── CSV fixtures ─────────────────────────────────────────────────────────────
function makeItem(overrides: Partial<BidItem> = {}): BidItem {
  return {
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
    ...overrides,
  };
}

function makeCsvEntry(
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

const csvMeta: DatasetMetadata = {
  filename: "test.csv",
  saved_path: "/uploads/test.csv",
  ingested_at: new Date().toISOString(),
  record_count: 0,
  skipped_count: 0,
  column_mapping: {},
  warnings: [],
};

// ─── PDF fixtures ─────────────────────────────────────────────────────────────
function makeChunk(overrides: Partial<ContentChunk> = {}): ContentChunk {
  return {
    id: "chunk-1",
    page: 1,
    sheet: "D-101",
    section: "Drainage Notes",
    text: "Install 24-inch concrete pipe.",
    extractionMethod: "native",
    ...overrides,
  };
}

function makePdfEntry(id: string, vec: number[]): PdfVectorEntry {
  return {
    id,
    text: `Chunk ${id}`,
    vector: vec,
    chunk: makeChunk({ id }),
  };
}

const pdfMeta: PdfDatasetMetadata = {
  filename: "plan.pdf",
  saved_path: "/uploads-pdf/plan.pdf",
  ingested_at: new Date().toISOString(),
  page_count: 2,
  chunk_count: 3,
  native_pages: 2,
  vision_pages: 0,
  skipped_pages: 0,
  warnings: [],
};

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__vectorStore;
});

// ─── Singleton ────────────────────────────────────────────────────────────────
describe("getStore", () => {
  it("returns the same singleton instance", () => {
    expect(getStore()).toBe(getStore());
  });
});

// ─── isEmpty / state flags ────────────────────────────────────────────────────
describe("VectorStore state flags", () => {
  it("isEmpty() is true before any load", () => {
    expect(getStore().isEmpty()).toBe(true);
  });

  it("isCsvLoaded() is false before loadCsv", () => {
    expect(getStore().isCsvLoaded()).toBe(false);
  });

  it("isPdfLoaded() is false before loadPdf", () => {
    expect(getStore().isPdfLoaded()).toBe(false);
  });

  it("isEmpty() is false after loadCsv", () => {
    const store = getStore();
    store.loadCsv([makeCsvEntry("0", [1, 0])], csvMeta);
    expect(store.isEmpty()).toBe(false);
  });

  it("isEmpty() is false after loadPdf", () => {
    const store = getStore();
    store.loadPdf([makePdfEntry("0", [1, 0])], pdfMeta);
    expect(store.isEmpty()).toBe(false);
  });

  it("isCsvLoaded() is true after loadCsv", () => {
    const store = getStore();
    store.loadCsv([makeCsvEntry("0", [1, 0])], csvMeta);
    expect(store.isCsvLoaded()).toBe(true);
  });

  it("isPdfLoaded() is true after loadPdf", () => {
    const store = getStore();
    store.loadPdf([makePdfEntry("0", [1, 0])], pdfMeta);
    expect(store.isPdfLoaded()).toBe(true);
  });
});

// ─── CSV partition ────────────────────────────────────────────────────────────
describe("VectorStore.loadCsv / searchCsv", () => {
  it("searchCsv returns empty array when the CSV partition is empty", () => {
    expect(getStore().searchCsv([1, 0])).toEqual([]);
  });

  it("searchCsv returns the closest vector by dot product", () => {
    const store = getStore();
    const e1 = makeCsvEntry("0", [1, 0]);
    const e2 = makeCsvEntry("1", [0, 1]);
    store.loadCsv([e1, e2], csvMeta);
    const result = store.searchCsv([1, 0], 1);
    expect(result[0].id).toBe("0");
  });

  it("searchCsv returns top-K results", () => {
    const store = getStore();
    const entries = [
      makeCsvEntry("0", [1, 0, 0]),
      makeCsvEntry("1", [0, 1, 0]),
      makeCsvEntry("2", [0, 0, 1]),
    ];
    store.loadCsv(entries, csvMeta);
    expect(store.searchCsv([1, 0, 0], 2)).toHaveLength(2);
  });

  it("getCsvMetadata returns null before loadCsv", () => {
    expect(getStore().getCsvMetadata()).toBeNull();
  });

  it("getCsvMetadata returns the metadata passed to loadCsv", () => {
    const store = getStore();
    store.loadCsv([makeCsvEntry("0", [1])], csvMeta);
    expect(store.getCsvMetadata()?.filename).toBe("test.csv");
  });
});

// ─── PDF partition ────────────────────────────────────────────────────────────
describe("VectorStore.loadPdf / searchPdf", () => {
  it("searchPdf returns empty array when the PDF partition is empty", () => {
    expect(getStore().searchPdf([1, 0])).toEqual([]);
  });

  it("searchPdf returns the closest vector by dot product", () => {
    const store = getStore();
    const e1 = makePdfEntry("0", [1, 0]);
    const e2 = makePdfEntry("1", [0, 1]);
    store.loadPdf([e1, e2], pdfMeta);
    const result = store.searchPdf([1, 0], 1);
    expect(result[0].id).toBe("0");
  });

  it("searchPdf returns top-K results", () => {
    const store = getStore();
    const entries = [
      makePdfEntry("0", [1, 0, 0]),
      makePdfEntry("1", [0, 1, 0]),
      makePdfEntry("2", [0, 0, 1]),
    ];
    store.loadPdf(entries, pdfMeta);
    expect(store.searchPdf([1, 0, 0], 2)).toHaveLength(2);
  });

  it("getPdfMetadata returns null before loadPdf", () => {
    expect(getStore().getPdfMetadata()).toBeNull();
  });

  it("getPdfMetadata returns the metadata passed to loadPdf", () => {
    const store = getStore();
    store.loadPdf([makePdfEntry("0", [1])], pdfMeta);
    expect(store.getPdfMetadata()?.filename).toBe("plan.pdf");
  });
});

// ─── Dual-partition independence ──────────────────────────────────────────────
describe("VectorStore dual-partition independence", () => {
  it("loadPdf does not affect the CSV partition", () => {
    const store = getStore();
    store.loadCsv([makeCsvEntry("csv-0", [1, 0])], csvMeta);
    store.loadPdf([makePdfEntry("pdf-0", [0, 1])], pdfMeta);
    expect(store.searchCsv([1, 0], 1)[0].id).toBe("csv-0");
    expect(store.isCsvLoaded()).toBe(true);
  });

  it("loadCsv does not affect the PDF partition", () => {
    const store = getStore();
    store.loadPdf([makePdfEntry("pdf-0", [0, 1])], pdfMeta);
    store.loadCsv([makeCsvEntry("csv-0", [1, 0])], csvMeta);
    expect(store.searchPdf([0, 1], 1)[0].id).toBe("pdf-0");
    expect(store.isPdfLoaded()).toBe(true);
  });

  it("both partitions are searchable when both are loaded", () => {
    const store = getStore();
    store.loadCsv([makeCsvEntry("csv-0", [1, 0])], csvMeta);
    store.loadPdf([makePdfEntry("pdf-0", [0, 1])], pdfMeta);
    expect(store.searchCsv([1, 0], 1)).toHaveLength(1);
    expect(store.searchPdf([0, 1], 1)).toHaveLength(1);
  });

  it("loadPdf replaces only the PDF partition on second call", () => {
    const store = getStore();
    store.loadCsv([makeCsvEntry("csv-0", [1, 0])], csvMeta);
    store.loadPdf([makePdfEntry("pdf-0", [0, 1])], pdfMeta);
    store.loadPdf([makePdfEntry("pdf-1", [0, 1])], {
      ...pdfMeta,
      filename: "v2.pdf",
    });
    expect(store.searchPdf([0, 1], 5).map((e) => e.id)).toEqual(["pdf-1"]);
    expect(store.isCsvLoaded()).toBe(true);
    expect(store.getCsvMetadata()?.filename).toBe("test.csv");
  });
});

// ─── Existing analytics (unchanged) ──────────────────────────────────────────
describe("VectorStore.detectOutliers", () => {
  it("flags items > 2σ from cluster mean", () => {
    const store = getStore();
    const entries = [
      makeCsvEntry("0", [1], { description: "Pipe", unit_price: 50 }),
      makeCsvEntry("1", [1], { description: "Pipe", unit_price: 52 }),
      makeCsvEntry("2", [1], { description: "Pipe", unit_price: 51 }),
      makeCsvEntry("3", [1], { description: "Pipe", unit_price: 53 }),
      makeCsvEntry("4", [1], { description: "Pipe", unit_price: 49 }),
      makeCsvEntry("5", [1], { description: "Pipe", unit_price: 50 }),
      makeCsvEntry("6", [1], { description: "Pipe", unit_price: 1000 }),
    ];
    store.loadCsv(entries, csvMeta);
    const outliers = store.detectOutliers(2);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
    expect(outliers[0].item.unit_price).toBe(1000);
  });

  it("ignores clusters with fewer than 3 items", () => {
    const store = getStore();
    const entries = [
      makeCsvEntry("0", [1], { description: "Rare", unit_price: 50 }),
      makeCsvEntry("1", [1], { description: "Rare", unit_price: 5000 }),
    ];
    store.loadCsv(entries, csvMeta);
    expect(store.detectOutliers()).toHaveLength(0);
  });
});

describe("VectorStore.summarize", () => {
  it("totals match fixture data", () => {
    const store = getStore();
    const entries = [
      makeCsvEntry("0", [1], { unit: "LF", quantity: 100, total_cost: 5000 }),
      makeCsvEntry("1", [1], { unit: "LF", quantity: 200, total_cost: 10000 }),
      makeCsvEntry("2", [1], { unit: "EA", quantity: 5, total_cost: 2500 }),
    ];
    store.loadCsv(entries, csvMeta);
    const summary = store.summarize();
    expect(summary.total_items).toBe(3);
    expect(summary.total_estimated_cost).toBe(17500);
    expect(summary.by_unit.LF.count).toBe(2);
    expect(summary.by_unit.LF.total_quantity).toBe(300);
    expect(summary.by_unit.EA.total_cost).toBe(2500);
  });
});

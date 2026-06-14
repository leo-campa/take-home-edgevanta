import { chunkExtractedPages } from "./index";
import type { ExtractedPage } from "./model";

function makePage(overrides: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    page: 1,
    sheet: "D-101",
    text: "Sheet: D-101\n\nSection: Drainage Notes\n\nInstall 24-inch concrete pipe.",
    extractionMethod: "native",
    skipped: false,
    ...overrides,
  };
}

describe("chunkExtractedPages", () => {
  it("splits page text into one chunk per Section: marker", () => {
    const page = makePage({
      text: "Sheet: D-101\n\nSection: Drainage Notes\n\nInstall pipe.\n\nSection: Quantities\n\nConcrete Pipe: 95 LF",
    });
    const chunks = chunkExtractedPages([page]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].section).toBe("Drainage Notes");
    expect(chunks[1].section).toBe("Quantities");
  });

  it("falls back to a single page-level chunk when no Section: markers are present", () => {
    const page = makePage({ text: "Sheet: D-101\n\nSome general content here." });
    const chunks = chunkExtractedPages([page]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBeNull();
    expect(chunks[0].text).toContain("general content");
  });

  it("skips pages with skipped: true", () => {
    const page = makePage({ skipped: true });
    expect(chunkExtractedPages([page])).toHaveLength(0);
  });

  it("propagates extractionMethod from the page to each chunk", () => {
    const native = makePage({ page: 1, extractionMethod: "native" });
    const vision = makePage({ page: 2, sheet: "D-102", extractionMethod: "vision" });
    const chunks = chunkExtractedPages([native, vision]);
    expect(chunks.find((c) => c.page === 1)?.extractionMethod).toBe("native");
    expect(chunks.find((c) => c.page === 2)?.extractionMethod).toBe("vision");
  });

  it("assigns a unique UUID v4 to every chunk", () => {
    const page = makePage({
      text: "Sheet: D-101\n\nSection: Notes\n\nNote A.\n\nSection: Quantities\n\nItem: 100",
    });
    const chunks = chunkExtractedPages([page]);
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("propagates the page number to all chunks from that page", () => {
    const page = makePage({
      page: 5,
      text: "Sheet: D-105\n\nSection: Notes\n\nContent A.\n\nSection: Details\n\nContent B.",
    });
    const chunks = chunkExtractedPages([page]);
    expect(chunks.every((c) => c.page === 5)).toBe(true);
  });

  it("propagates the sheet identifier to every chunk", () => {
    const chunks = chunkExtractedPages([makePage()]);
    expect(chunks[0].sheet).toBe("D-101");
  });

  it("splits long sections at paragraph boundaries and adds a part N/M suffix", () => {
    const para = "W".repeat(450);
    const longContent = [para, para, para, para, para].join("\n\n");
    const page = makePage({
      text: `Sheet: D-101\n\nSection: Long Section\n\n${longContent}`,
    });
    const chunks = chunkExtractedPages([page]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].section).toMatch(/Long Section \(part 1\/\d+\)/);
  });

  it("skips section blocks whose content is empty after trimming", () => {
    const page = makePage({
      text: "Sheet: D-101\n\nSection: Empty Section\n\n   \n\nSection: Real Section\n\nActual content.",
    });
    const chunks = chunkExtractedPages([page]);
    const sections = chunks.map((c) => c.section);
    expect(sections).not.toContain("Empty Section");
    expect(sections).toContain("Real Section");
  });

  it("handles multiple pages and records correct page numbers on each chunk", () => {
    const pages = [
      makePage({ page: 1, text: "Sheet: D-101\n\nSection: Notes\n\nPage 1 content" }),
      makePage({
        page: 2,
        sheet: "D-102",
        text: "Sheet: D-102\n\nSection: Details\n\nPage 2 content",
      }),
    ];
    const chunks = chunkExtractedPages(pages);
    expect(chunks.some((c) => c.page === 1)).toBe(true);
    expect(chunks.some((c) => c.page === 2)).toBe(true);
  });

  it("returns an empty array when every page is skipped", () => {
    const pages = [
      makePage({ skipped: true }),
      makePage({ page: 2, skipped: true }),
    ];
    expect(chunkExtractedPages(pages)).toHaveLength(0);
  });
});

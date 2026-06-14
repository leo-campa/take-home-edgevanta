/**
 * @jest-environment node
 */

// ─── pdfjs-dist mock ──────────────────────────────────────────────────────────
const mockGetTextContent = jest.fn();
const mockGetPage = jest.fn();
const mockPdfjsDocument = {
  numPages: 1,
  getPage: mockGetPage,
};

jest.mock("pdfjs-dist", () => ({
  getDocument: jest.fn(() => ({ promise: Promise.resolve(mockPdfjsDocument) })),
}));

// ─── pdf-lib mock ─────────────────────────────────────────────────────────────
const mockDestSave = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
const mockDestAddPage = jest.fn();
const mockDestCopyPages = jest.fn().mockResolvedValue([{}]);
const mockDestDoc = {
  copyPages: mockDestCopyPages,
  addPage: mockDestAddPage,
  save: mockDestSave,
};
const mockSourceCopyPages = jest.fn().mockResolvedValue([{}]);
const mockSourceDoc = { numPages: 1, copyPages: mockSourceCopyPages };

jest.mock("pdf-lib", () => ({
  PDFDocument: {
    load: jest.fn().mockImplementation(() => Promise.resolve(mockSourceDoc)),
    create: jest.fn().mockImplementation(() => Promise.resolve(mockDestDoc)),
  },
}));

// ─── openai mock ──────────────────────────────────────────────────────────────
const mockChatCreate = jest.fn();
jest.mock("openai", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
);

// ─── fs mock ──────────────────────────────────────────────────────────────────
jest.mock("node:fs", () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from("mock-pdf-bytes")),
}));

import { extractPdfPages, MIN_NATIVE_CHARS } from "./index";

const LONG_TEXT = "A".repeat(MIN_NATIVE_CHARS + 10);
const SHORT_TEXT = "ab";

function makeTextContent(text: string) {
  return { items: [{ str: text }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPage.mockResolvedValue({ getTextContent: mockGetTextContent });
  mockDestSave.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockDestCopyPages.mockResolvedValue([{}]);
});

describe("extractPdfPages — native path", () => {
  it("returns extractionMethod 'native' when text length meets threshold", async () => {
    mockGetTextContent.mockResolvedValue(makeTextContent(LONG_TEXT));
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].extractionMethod).toBe("native");
  });

  it("does not call the OpenAI client when native extraction succeeds", async () => {
    mockGetTextContent.mockResolvedValue(makeTextContent(LONG_TEXT));
    await extractPdfPages("/fake/file.pdf");
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("parses Sheet: identifier from text", async () => {
    const text = `${LONG_TEXT}\nSheet: D-101\nSection: Notes\nSome content`;
    mockGetTextContent.mockResolvedValue(makeTextContent(text));
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].sheet).toBe("D-101");
  });

  it("parses Section: blocks from text", async () => {
    const text = `${LONG_TEXT}\nSheet: D-101\nSection: Drainage Notes\nInstall pipe.\nSection: Quantities\nPipe: 95 LF`;
    mockGetTextContent.mockResolvedValue(makeTextContent(text));
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].text).toContain("Section: Drainage Notes");
    expect(pages[0].text).toContain("Section: Quantities");
  });

  it("wraps text without Section: markers in a Section: General Content block", async () => {
    const text = `${LONG_TEXT}\nSheet: D-101\nSome notes without headers.`;
    mockGetTextContent.mockResolvedValue(makeTextContent(text));
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].text).toContain("Section: General Content");
  });

  it("sets the page number on the returned ExtractedPage", async () => {
    mockPdfjsDocument.numPages = 2;
    mockGetTextContent.mockResolvedValue(makeTextContent(LONG_TEXT));
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].page).toBe(1);
    expect(pages[1].page).toBe(2);
    mockPdfjsDocument.numPages = 1;
  });
});

describe("extractPdfPages — vision fallback path", () => {
  const visionResponse =
    "Sheet: D-102\n\nSection: Drainage Notes\n\nInstall 24-inch pipe.";

  beforeEach(() => {
    mockGetTextContent.mockResolvedValue(makeTextContent(SHORT_TEXT));
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: visionResponse } }],
    });
  });

  it("returns extractionMethod 'vision' when native text is below threshold", async () => {
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].extractionMethod).toBe("vision");
  });

  it("calls the OpenAI client for pages below the threshold", async () => {
    await extractPdfPages("/fake/file.pdf");
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  it("calls OpenAI with the gpt-4.1 model", async () => {
    await extractPdfPages("/fake/file.pdf");
    const call = mockChatCreate.mock.calls[0][0];
    expect(call.model).toBe("gpt-4.1");
  });

  it("uses pdf-lib to isolate the page before sending to GPT-4.1", async () => {
    const { PDFDocument } = jest.requireMock("pdf-lib") as {
      PDFDocument: { load: jest.Mock; create: jest.Mock };
    };
    await extractPdfPages("/fake/file.pdf");
    expect(PDFDocument.load).toHaveBeenCalled();
    expect(PDFDocument.create).toHaveBeenCalled();
  });

  it("parses Sheet: and Section: blocks from the GPT-4.1 response", async () => {
    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].sheet).toBe("D-102");
    expect(pages[0].text).toContain("Section: Drainage Notes");
  });
});

describe("extractPdfPages — mixed pages", () => {
  it("uses native for pages ≥ threshold and vision for pages below threshold", async () => {
    mockPdfjsDocument.numPages = 2;
    mockGetTextContent
      .mockResolvedValueOnce(makeTextContent(LONG_TEXT))
      .mockResolvedValueOnce(makeTextContent(SHORT_TEXT));
    mockChatCreate.mockResolvedValue({
      choices: [
        { message: { content: "Sheet: D-103\n\nSection: Notes\n\nContent" } },
      ],
    });

    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].extractionMethod).toBe("native");
    expect(pages[1].extractionMethod).toBe("vision");

    mockPdfjsDocument.numPages = 1;
  });
});

describe("extractPdfPages — skipped pages", () => {
  it("marks a page as skipped when vision also returns empty content", async () => {
    mockGetTextContent.mockResolvedValue(makeTextContent(SHORT_TEXT));
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });

    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].skipped).toBe(true);
    expect(pages[0].warning).toContain("Page 1");
  });

  it("records a warning but does not throw when the GPT-4.1 call rejects", async () => {
    mockGetTextContent.mockResolvedValue(makeTextContent(SHORT_TEXT));
    mockChatCreate.mockRejectedValue(new Error("rate limited"));

    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages[0].skipped).toBe(true);
    expect(pages[0].warning).toBeDefined();
  });

  it("continues processing remaining pages after a skipped page", async () => {
    mockPdfjsDocument.numPages = 2;
    mockGetTextContent
      .mockResolvedValueOnce(makeTextContent(SHORT_TEXT))
      .mockResolvedValueOnce(makeTextContent(LONG_TEXT));
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });

    const pages = await extractPdfPages("/fake/file.pdf");
    expect(pages).toHaveLength(2);
    expect(pages[0].skipped).toBe(true);
    expect(pages[1].skipped).toBeFalsy();

    mockPdfjsDocument.numPages = 1;
  });
});

describe("MIN_NATIVE_CHARS", () => {
  it("is exported and equals 200", () => {
    expect(MIN_NATIVE_CHARS).toBe(200);
  });
});

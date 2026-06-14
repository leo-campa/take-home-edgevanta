/**
 * @jest-environment node
 */
import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentChunk } from "@/lib/pdf-chunker/model";
import type { ExtractedPage } from "@/lib/pdf-extractor/model";

// ─── busboy mock ──────────────────────────────────────────────────────────────
type BbCallback = (...args: unknown[]) => void;
const bbCallbacks: Record<string, BbCallback> = {};
const mockBB = {
  on: jest.fn((event: string, cb: BbCallback) => {
    bbCallbacks[event] = cb;
    return mockBB;
  }),
};
jest.mock("busboy", () => jest.fn(() => mockBB));

// ─── fs mock ──────────────────────────────────────────────────────────────────
type StreamCallback = (...args: unknown[]) => void;
const wsCallbacks: Record<string, StreamCallback> = {};
const mockWriteStream = {
  on: jest.fn((event: string, cb: StreamCallback) => {
    wsCallbacks[event] = cb;
    return mockWriteStream;
  }),
  destroy: jest.fn(),
};
const streamCallbacks: Record<string, StreamCallback> = {};
const mockStream = {
  on: jest.fn((event: string, cb: StreamCallback) => {
    streamCallbacks[event] = cb;
    return mockStream;
  }),
  pipe: jest.fn(),
  destroy: jest.fn(),
};

jest.mock("node:fs", () => ({
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(() => mockWriteStream),
  rmSync: jest.fn(),
}));

// ─── lib mocks ────────────────────────────────────────────────────────────────
const mockExtractPdfPages = jest.fn();
jest.mock("@/lib/pdf-extractor", () => ({
  extractPdfPages: mockExtractPdfPages,
}));

const mockChunkExtractedPages = jest.fn();
jest.mock("@/lib/pdf-chunker", () => ({
  chunkExtractedPages: mockChunkExtractedPages,
}));

const mockGenerateEmbeddings = jest.fn();
jest.mock("@/lib/embeddings", () => ({
  generateEmbeddings: mockGenerateEmbeddings,
}));

const mockLoadPdf = jest.fn();
jest.mock("@/lib/vector-store", () => ({
  getStore: jest.fn(() => ({ loadPdf: mockLoadPdf })),
}));

import handler from "./ingest-pdf";

// ─── helpers ──────────────────────────────────────────────────────────────────
function buildReq(method = "POST"): NextApiRequest {
  return {
    method,
    headers: { "content-type": "multipart/form-data; boundary=boundary" },
    pipe: jest.fn(),
  } as unknown as NextApiRequest;
}

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
  };
  return res as unknown as NextApiResponse & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

function makeExtractedPage(
  overrides: Partial<ExtractedPage> = {},
): ExtractedPage {
  return {
    page: 1,
    sheet: "D-101",
    text: "Sheet: D-101\n\nSection: Notes\n\nContent",
    extractionMethod: "native",
    skipped: false,
    ...overrides,
  };
}

function makeChunk(overrides: Partial<ContentChunk> = {}): ContentChunk {
  return {
    id: "uuid-1",
    page: 1,
    sheet: "D-101",
    section: "Notes",
    text: "Content",
    extractionMethod: "native",
    ...overrides,
  };
}

/** Simulate a successful multipart file upload through the busboy mock. */
function triggerFileUpload(filename: string, mimeType: string) {
  bbCallbacks["file"]?.("file", mockStream, { filename, mimeType });
  wsCallbacks["finish"]?.();
}

/** Simulate busboy finishing without sending any file (no-file scenario). */
function triggerNoFile() {
  bbCallbacks["close"]?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(bbCallbacks).forEach((k) => delete bbCallbacks[k]);
  Object.keys(wsCallbacks).forEach((k) => delete wsCallbacks[k]);
  Object.keys(streamCallbacks).forEach((k) => delete streamCallbacks[k]);

  mockBB.on.mockImplementation((event: string, cb: BbCallback) => {
    bbCallbacks[event] = cb;
    return mockBB;
  });
  mockWriteStream.on.mockImplementation((event: string, cb: StreamCallback) => {
    wsCallbacks[event] = cb;
    return mockWriteStream;
  });
  mockStream.on.mockImplementation((event: string, cb: StreamCallback) => {
    streamCallbacks[event] = cb;
    return mockStream;
  });
  mockStream.pipe.mockReturnValue(mockWriteStream);
});

describe("POST /api/ingest-pdf", () => {
  it("returns 405 for non-POST requests", async () => {
    const res = buildMockRes();
    await handler(buildReq("GET"), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 400 when no file is uploaded", async () => {
    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    triggerNoFile();
    await promise;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("No file") }),
    );
  });

  it("returns 400 when the uploaded file is not a PDF", async () => {
    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    triggerFileUpload("data.csv", "text/csv");
    await promise;
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("PDF") }),
    );
  });

  it("returns 413 when the file exceeds the size limit", async () => {
    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    bbCallbacks["file"]?.("file", mockStream, {
      filename: "big.pdf",
      mimeType: "application/pdf",
    });
    streamCallbacks["limit"]?.();
    wsCallbacks["finish"]?.();
    await promise;
    expect(res.status).toHaveBeenCalledWith(413);
  });

  it("returns 422 when all pages are skipped", async () => {
    mockExtractPdfPages.mockResolvedValue([
      makeExtractedPage({ skipped: true, warning: "Page 1: no content" }),
    ]);
    mockChunkExtractedPages.mockReturnValue([]);

    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    triggerFileUpload("empty.pdf", "application/pdf");
    await promise;

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("No content") }),
    );
  });

  it("returns 500 and rolls back the PDF partition when embedding generation fails", async () => {
    mockExtractPdfPages.mockResolvedValue([makeExtractedPage()]);
    mockChunkExtractedPages.mockReturnValue([makeChunk()]);
    mockGenerateEmbeddings.mockRejectedValue(new Error("OpenAI timeout"));

    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    triggerFileUpload("plan.pdf", "application/pdf");
    await promise;

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockLoadPdf).toHaveBeenCalledWith([], expect.any(Object));
  });

  it("returns 200 with correct stats on the happy path", async () => {
    const pages: ExtractedPage[] = [
      makeExtractedPage({ page: 1, extractionMethod: "native" }),
      makeExtractedPage({ page: 2, extractionMethod: "vision" }),
    ];
    const chunks: ContentChunk[] = [makeChunk(), makeChunk({ id: "uuid-2" })];
    mockExtractPdfPages.mockResolvedValue(pages);
    mockChunkExtractedPages.mockReturnValue(chunks);
    mockGenerateEmbeddings.mockResolvedValue([[0.1], [0.2]]);

    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    triggerFileUpload("plan.pdf", "application/pdf");
    await promise;

    expect(res.status).not.toHaveBeenCalledWith(
      expect.not.stringMatching(/200/),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "plan.pdf",
        page_count: 2,
        chunk_count: 2,
        native_pages: 1,
        vision_pages: 1,
        skipped_pages: 0,
      }),
    );
  });

  it("calls store.loadPdf with the generated entries on success", async () => {
    const pages: ExtractedPage[] = [makeExtractedPage()];
    const chunks: ContentChunk[] = [makeChunk()];
    mockExtractPdfPages.mockResolvedValue(pages);
    mockChunkExtractedPages.mockReturnValue(chunks);
    mockGenerateEmbeddings.mockResolvedValue([[0.5, 0.5]]);

    const res = buildMockRes();
    const promise = handler(buildReq(), res);
    triggerFileUpload("plan.pdf", "application/pdf");
    await promise;

    expect(mockLoadPdf).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ chunk: chunks[0] })]),
      expect.objectContaining({ filename: "plan.pdf", chunk_count: 1 }),
    );
  });
});

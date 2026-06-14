/**
 * @jest-environment node
 */
import { generateEmbeddings } from "./index";

const mockCreate = jest.fn();

jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: { create: mockCreate },
  }));
});

function makeFakeEmbedding(index: number, dims = 1536): number[] {
  const vec = new Array(dims).fill(0) as number[];
  vec[0] = index + 1;
  return vec;
}

function fakeResponse(texts: string[], offset = 0) {
  return {
    data: texts.map((_, i) => ({
      index: i,
      embedding: makeFakeEmbedding(offset + i),
    })),
  };
}

describe("generateEmbeddings", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns one vector per input text", async () => {
    const texts = ["a", "b", "c"];
    mockCreate.mockResolvedValue(fakeResponse(texts));
    const result = await generateEmbeddings(texts);
    expect(result).toHaveLength(3);
  });

  it("makes multiple calls for batches > 100", async () => {
    const texts = Array.from({ length: 150 }, (_, i) => `text-${i}`);
    mockCreate
      .mockResolvedValueOnce(fakeResponse(texts.slice(0, 100), 0))
      .mockResolvedValueOnce(fakeResponse(texts.slice(100), 100));

    const result = await generateEmbeddings(texts);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
  });

  it("returns L2-normalised vectors", async () => {
    const texts = ["hello"];
    const raw = [3, 4, ...new Array(1534).fill(0)] as number[];
    mockCreate.mockResolvedValue({
      data: [{ index: 0, embedding: raw }],
    });
    const result = await generateEmbeddings(texts);
    const norm = Math.sqrt(result[0].reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

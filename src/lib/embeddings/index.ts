import OpenAI from "openai";

const BATCH_SIZE = 100;
const DIMS = 1536;

function l2Normalise(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return new Array(DIMS).fill(0) as number[];
  return vec.map((v) => v / norm);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    for (const item of response.data) {
      results[i + item.index] = l2Normalise(item.embedding);
    }
  }

  return results;
}

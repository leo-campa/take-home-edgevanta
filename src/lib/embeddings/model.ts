export type EmbeddingInput = {
  text: string;
  id: string;
};

export type EmbeddingResult = {
  id: string;
  vector: number[];
};

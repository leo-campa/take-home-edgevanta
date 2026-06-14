export type { ExtractedPage } from "@/lib/pdf-extractor/model";

export type ContentChunk = {
  id: string;
  page: number;
  sheet: string | null;
  section: string | null;
  text: string;
  extractionMethod: "native" | "vision";
};

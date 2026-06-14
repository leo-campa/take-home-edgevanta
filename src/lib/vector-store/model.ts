import type { BidItem } from "@/lib/csv-normaliser/model";
import type { ContentChunk } from "@/lib/pdf-chunker/model";

export type VectorEntry = {
  id: string;
  text: string;
  vector: number[];
  item: BidItem;
};

export type DatasetMetadata = {
  filename: string;
  saved_path: string;
  ingested_at: string;
  record_count: number;
  skipped_count: number;
  column_mapping: Record<string, string>;
  warnings: string[];
};

export type PdfVectorEntry = {
  id: string;
  text: string;
  vector: number[];
  chunk: ContentChunk;
};

export type PdfDatasetMetadata = {
  filename: string;
  saved_path: string;
  ingested_at: string;
  page_count: number;
  chunk_count: number;
  native_pages: number;
  vision_pages: number;
  skipped_pages: number;
  warnings: string[];
};

export type VectorStoreState = {
  csvEntries: VectorEntry[];
  csvMetadata: DatasetMetadata | null;
  pdfEntries: PdfVectorEntry[];
  pdfMetadata: PdfDatasetMetadata | null;
};

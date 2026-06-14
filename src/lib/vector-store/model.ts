import type { BidItem } from "@/lib/csv-normaliser/model";

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

export type VectorStoreState = {
  entries: VectorEntry[];
  metadata: DatasetMetadata | null;
};

import type { BidItem } from "@/lib/csv-normaliser/model";

export type OutlierResult = {
  item: BidItem;
  cluster_mean: number;
  cluster_stddev: number;
  deviation_factor: number;
  cluster_size: number;
};

export type QuantitySummary = {
  total_items: number;
  total_estimated_cost: number;
  items_with_missing_price: number;
  items_with_missing_quantity: number;
  by_unit: Record<
    string,
    {
      count: number;
      total_quantity: number | null;
      total_cost: number;
    }
  >;
};

export type AgentChatResponse = {
  answer: string;
};

import type { BidItem } from "@/lib/csv-normaliser/model";

export type OutlierResult = {
  item: BidItem;
  cluster_mean: number;
  cluster_stddev: number;
  deviation_factor: number;
  cluster_size: number;
};

export type UnitSummary = {
  count: number;
  total_quantity: number | null;
  total_cost: number;
};

export type QuantitySummary = {
  total_items: number;
  total_estimated_cost: number;
  items_with_missing_price: number;
  items_with_missing_quantity: number;
  by_unit: Record<string, UnitSummary>;
};

export type BidderSummary = {
  bidder: string;
  bid_total: number | null;
  total_ext_amt: number;
  item_count: number;
};

export type Bids = {
  bidder: string | null;
  bid_rank: number | null;
  unit_price: number | null;
  total_cost: number | null;
};

export type BidderComparison = {
  item_number: string | null;
  description: string | null;
  bids: Bids[];
};

export type BidVsEstimate = {
  item_number: string | null;
  description: string | null;
  bidder: string | null;
  bid_rank: number | null;
  unit_price: number;
  engineer_estimate: number;
  variance: number;
  variance_pct: number | null;
};

export type AgentChatResponse = {
  answer: string;
};

export type BidItem = {
  id: string;
  item_number: string | null;
  description: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | null;
  total_cost: number | null;
  project_id: string | null;
  let_date: string | null;
  county: string | null;
  engineer_estimate: number | null;
  bidder: string | null;
  bid_rank: number | null;
  bid_total: number | null;
  extra_fields: Record<string, string | number | null>;
  raw_row: Record<string, string>;
};

export type NormalisedRow = {
  headers: Record<string, string>;
  values: Record<string, string | number | null>;
};

export type ColumnMapping = Record<string, string>;

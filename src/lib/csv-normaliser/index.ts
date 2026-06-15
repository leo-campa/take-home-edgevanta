import type { BidItem, ColumnMapping } from "./model";

const CANONICAL_MAP: Record<string, keyof BidItem> = {
  // item_number
  item_no: "item_number",
  item_number: "item_number",
  item: "item_number",
  line: "item_number",
  line_no: "item_number",
  bid_item: "item_number",
  // description
  description: "description",
  desc: "description",
  item_desc: "description",
  work_description: "description",
  scope: "description",
  // quantity
  qty: "quantity",
  quantity: "quantity",
  qnty: "quantity",
  quant: "quantity",
  count: "quantity",
  // unit
  unit: "unit",
  uom: "unit",
  measure: "unit",
  unit_of_measure: "unit",
  u_m: "unit",
  // unit_price
  unit_price: "unit_price",
  unit_prc: "unit_price",
  uprice: "unit_price",
  unit_pr: "unit_price",
  price: "unit_price",
  rate: "unit_price",
  unit_rate: "unit_price",
  // total_cost
  total: "total_cost",
  total_cost: "total_cost",
  ext_amt: "total_cost",
  amount: "total_cost",
  extended: "total_cost",
  ext_cost: "total_cost",
  line_total: "total_cost",
  total_amount: "total_cost",
  // project_id
  proj_id: "project_id",
  project_id: "project_id",
  project_no: "project_id",
  // let_date
  let_dt: "let_date",
  let_date: "let_date",
  letting_date: "let_date",
  // county
  cnty: "county",
  county: "county",
  location: "county",
  area: "county",
  // engineer_estimate
  eng_est_unit_pr: "engineer_estimate",
  engineer_estimate: "engineer_estimate",
  eng_est: "engineer_estimate",
  est_unit_price: "engineer_estimate",
  // bidder
  bidder: "bidder",
  contractor: "bidder",
  company: "bidder",
  bidder_name: "bidder",
  // bid_rank
  bid_rank: "bid_rank",
  rank: "bid_rank",
  ranking: "bid_rank",
  // bid_total
  bid_total: "bid_total",
  total_bid: "bid_total",
};

// Fields that should remain as strings rather than parsed as numbers
const STRING_FIELDS = new Set<keyof BidItem>(["item_number", "description", "unit", "project_id", "let_date", "county", "bidder"]);

export function normaliseHeader(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

export function normaliseCell(raw: string): string | number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const stripped = trimmed.replace(/[$,]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(stripped)) return parseFloat(stripped);
  return trimmed;
}

export function detectCanonicalField(snakeKey: string): keyof BidItem | null {
  return CANONICAL_MAP[snakeKey] ?? null;
}

export function normaliseRow(
  rawRow: Record<string, string>,
  rowIndex: number,
): BidItem {
  const item: BidItem = {
    id: String(rowIndex),
    item_number: null,
    description: null,
    quantity: null,
    unit: null,
    unit_price: null,
    total_cost: null,
    project_id: null,
    let_date: null,
    county: null,
    engineer_estimate: null,
    bidder: null,
    bid_rank: null,
    bid_total: null,
    extra_fields: {},
    raw_row: rawRow,
  };

  for (const [rawHeader, rawValue] of Object.entries(rawRow)) {
    const snake = normaliseHeader(rawHeader);
    const canonical = detectCanonicalField(snake);

    if (canonical) {
      const value = STRING_FIELDS.has(canonical)
        ? rawValue.trim() || null
        : normaliseCell(rawValue);
      (item as Record<string, unknown>)[canonical] = value;
    } else {
      item.extra_fields[snake] = normaliseCell(rawValue);
    }
  }

  return item;
}

export function buildColumnMapping(rawHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const raw of rawHeaders) {
    const snake = normaliseHeader(raw);
    const canonical = detectCanonicalField(snake);
    if (canonical) mapping[snake] = canonical;
  }
  return mapping;
}

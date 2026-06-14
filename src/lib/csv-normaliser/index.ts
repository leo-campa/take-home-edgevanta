import type { BidItem, ColumnMapping, NormalisedRow } from "./model";

const STRING_CANONICAL_FIELDS = new Set<keyof BidItem>([
  "item_number",
  "description",
  "unit",
]);

const CANONICAL_MAP: Record<string, keyof BidItem> = {
  item_no: "item_number",
  item_number: "item_number",
  item: "item_number",
  description: "description",
  desc: "description",
  item_desc: "description",
  qty: "quantity",
  quantity: "quantity",
  unit_price: "unit_price",
  unit_prc: "unit_price",
  uprice: "unit_price",
  total: "total_cost",
  total_cost: "total_cost",
  ext_amt: "total_cost",
  amount: "total_cost",
  unit: "unit",
  uom: "unit",
};

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
  const normalised: NormalisedRow = { headers: {}, values: {} };

  for (const [rawHeader, rawValue] of Object.entries(rawRow)) {
    const snakeKey = normaliseHeader(rawHeader);
    normalised.headers[rawHeader] = snakeKey;
    normalised.values[snakeKey] = normaliseCell(rawValue);
  }

  const item: BidItem = {
    id: String(rowIndex),
    item_number: null,
    description: null,
    quantity: null,
    unit: null,
    unit_price: null,
    total_cost: null,
    extra_fields: {},
    raw_row: rawRow,
  };

  for (const [rawHeader, rawValue] of Object.entries(rawRow)) {
    const snake = normaliseHeader(rawHeader);
    const canonical = detectCanonicalField(snake);
    if (canonical) {
      if (STRING_CANONICAL_FIELDS.has(canonical)) {
        const trimmed = rawValue.trim();
        (item as Record<string, unknown>)[canonical] =
          trimmed === "" ? null : trimmed;
      } else {
        (item as Record<string, unknown>)[canonical] = normalised.values[snake];
      }
    } else {
      item.extra_fields[snake] = normalised.values[snake] ?? null;
    }
  }

  return item;
}

export function buildColumnMapping(rawHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const raw of rawHeaders) {
    const snake = normaliseHeader(raw);
    const canonical = detectCanonicalField(snake);
    if (canonical) {
      mapping[snake] = canonical;
    }
  }
  return mapping;
}

import type { BidItem } from "@/lib/csv-normaliser/model";
import type { OutlierResult, QuantitySummary } from "./model";

export function getTopExpensiveItems(n: number, items: BidItem[]): BidItem[] {
  return [...items]
    .filter((i) => i.total_cost !== null)
    .sort((a, b) => (b.total_cost as number) - (a.total_cost as number))
    .slice(0, n);
}

export function detectPriceOutliers(
  items: BidItem[],
  threshold = 2,
): OutlierResult[] {
  const clusters = groupByDescription(items);
  const results: OutlierResult[] = [];

  for (const group of Object.values(clusters)) {
    if (group.length < 3) continue;
    const prices = group
      .map((i) => i.unit_price)
      .filter((p): p is number => p !== null);
    if (prices.length < 3) continue;

    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance =
      prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    const stddev = Math.sqrt(variance);

    for (const item of group) {
      if (item.unit_price === null) continue;
      const deviation = Math.abs(item.unit_price - mean) / stddev;
      if (deviation > threshold) {
        results.push({
          item,
          cluster_mean: mean,
          cluster_stddev: stddev,
          deviation_factor: deviation,
          cluster_size: group.length,
        });
      }
    }
  }

  return results;
}

export function summarizeQuantities(items: BidItem[]): QuantitySummary {
  const byUnit: QuantitySummary["by_unit"] = {};
  let totalCost = 0;
  let missingPrice = 0;
  let missingQty = 0;

  for (const item of items) {
    if (item.unit_price === null) missingPrice++;
    if (item.quantity === null) missingQty++;
    if (typeof item.total_cost === "number") totalCost += item.total_cost;

    const unitKey = item.unit ?? "__unknown__";
    if (!byUnit[unitKey]) {
      byUnit[unitKey] = { count: 0, total_quantity: null, total_cost: 0 };
    }

    byUnit[unitKey].count++;

    if (typeof item.quantity === "number") {
      const prev = byUnit[unitKey].total_quantity ?? 0;
      byUnit[unitKey].total_quantity = prev + item.quantity;
    }

    if (typeof item.total_cost === "number") {
      byUnit[unitKey].total_cost += item.total_cost;
    }
  }

  return {
    total_items: items.length,
    total_estimated_cost: totalCost,
    items_with_missing_price: missingPrice,
    items_with_missing_quantity: missingQty,
    by_unit: byUnit,
  };
}

export function getAverageUnitPrice(items: BidItem[], filter?: string): number {
  const filtered = filter
    ? items.filter((i) =>
        i.description?.toLowerCase().includes(filter.toLowerCase()),
      )
    : items;

  const prices = filtered
    .map((i) => i.unit_price)
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return 0;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function groupByDescription(items: BidItem[]): Record<string, BidItem[]> {
  const groups: Record<string, BidItem[]> = {};
  for (const item of items) {
    const key = item.description ?? "__no_desc__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

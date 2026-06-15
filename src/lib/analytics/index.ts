import type { BidItem } from "@/lib/csv-normaliser/model";
import type {
  BidderComparison,
  BidderSummary,
  BidVsEstimate,
  OutlierResult,
  QuantitySummary,
} from "./model";

function groupByDescription(items: BidItem[]): Record<string, BidItem[]> {
  const groups: Record<string, BidItem[]> = {};
  for (const item of items) {
    const key = item.description ?? "__no_desc__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function computeStats(prices: number[]): { mean: number; stddev: number } {
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance =
    prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
  return { mean, stddev: Math.sqrt(variance) };
}

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
  const results: OutlierResult[] = [];

  for (const group of Object.values(groupByDescription(items))) {
    const prices = group
      .map((i) => i.unit_price)
      .filter((p): p is number => p !== null);

    if (prices.length < 3) continue;

    const { mean, stddev } = computeStats(prices);

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
      byUnit[unitKey].total_quantity =
        (byUnit[unitKey].total_quantity ?? 0) + item.quantity;
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

function filterByProject(items: BidItem[], projectId?: string): BidItem[] {
  if (!projectId) return items;
  return items.filter((item) => item.project_id === projectId);
}

export function summarizeByBidder(
  items: BidItem[],
  projectId?: string,
): BidderSummary[] {
  const projectItems = filterByProject(items, projectId);
  const byBidder: Record<string, BidderSummary> = {};

  for (const item of projectItems) {
    const bidderName = item.bidder ?? "__unknown__";

    if (!byBidder[bidderName]) {
      byBidder[bidderName] = {
        bidder: bidderName,
        bid_total: null,
        total_ext_amt: 0,
        item_count: 0,
      };
    }

    const summary = byBidder[bidderName];
    summary.item_count++;

    if (typeof item.total_cost === "number") {
      summary.total_ext_amt += item.total_cost;
    }

    // bid_total is the same for all rows of the same bidder+project — capture it once
    if (typeof item.bid_total === "number" && summary.bid_total === null) {
      summary.bid_total = item.bid_total;
    }
  }

  return Object.values(byBidder).sort(
    (a, b) => (a.bid_total ?? Infinity) - (b.bid_total ?? Infinity),
  );
}

export function compareBidders(
  items: BidItem[],
  itemNumber?: string,
  projectId?: string,
): BidderComparison[] {
  const projectItems = filterByProject(items, projectId);
  const targetItems = itemNumber
    ? projectItems.filter((item) => item.item_number === itemNumber)
    : projectItems;

  const groupedByItem: Record<string, BidItem[]> = {};
  for (const item of targetItems) {
    const key = item.item_number ?? item.description ?? "__unknown__";
    if (!groupedByItem[key]) groupedByItem[key] = [];
    groupedByItem[key].push(item);
  }

  return Object.values(groupedByItem).map((bids) => {
    const sortedByRank = [...bids].sort(
      (a, b) => (a.bid_rank ?? 999) - (b.bid_rank ?? 999),
    );

    return {
      item_number: bids[0].item_number,
      description: bids[0].description,
      bids: sortedByRank.map((b) => ({
        bidder: b.bidder,
        bid_rank: b.bid_rank,
        unit_price: b.unit_price,
        total_cost: b.total_cost,
      })),
    };
  });
}

export function getLowestBidder(
  items: BidItem[],
  projectId?: string,
): BidderSummary[] {
  const projectItems = filterByProject(items, projectId);
  const winners = projectItems.filter((item) => item.bid_rank === 1);

  // Fall back to all items if no bid_rank data is present
  const itemsToSummarize = winners.length > 0 ? winners : projectItems;
  return summarizeByBidder(itemsToSummarize);
}

export function compareBidVsEstimate(
  items: BidItem[],
  projectId?: string,
): BidVsEstimate[] {
  const projectItems = filterByProject(items, projectId);

  const itemsWithBothPrices = projectItems.filter(
    (item) =>
      typeof item.unit_price === "number" &&
      typeof item.engineer_estimate === "number" &&
      item.engineer_estimate !== 0,
  );

  return itemsWithBothPrices.map((item) => {
    const unitPrice = item.unit_price as number;
    const engineerEstimate = item.engineer_estimate as number;
    const variance = unitPrice - engineerEstimate;

    return {
      item_number: item.item_number,
      description: item.description,
      bidder: item.bidder,
      bid_rank: item.bid_rank,
      unit_price: unitPrice,
      engineer_estimate: engineerEstimate,
      variance,
      variance_pct: (variance / engineerEstimate) * 100,
    };
  });
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

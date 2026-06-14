import type { OutlierResult, QuantitySummary } from "@/lib/analytics/model";
import type { BidItem } from "@/lib/csv-normaliser/model";
import type { DatasetMetadata, VectorEntry, VectorStoreState } from "./model";

class VectorStore {
  private state: VectorStoreState = { entries: [], metadata: null };

  load(entries: VectorEntry[], metadata: DatasetMetadata): void {
    this.state = { entries, metadata };
  }

  isEmpty(): boolean {
    return this.state.entries.length === 0;
  }

  getMetadata(): DatasetMetadata | null {
    return this.state.metadata;
  }

  getItems(): BidItem[] {
    return this.state.entries.map((e) => e.item);
  }

  search(queryVector: number[], topK = 5): VectorEntry[] {
    if (this.state.entries.length === 0) return [];

    const scored = this.state.entries.map((entry) => ({
      entry,
      score: dotProduct(entry.vector, queryVector),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.entry);
  }

  getTopByTotalCost(n: number): BidItem[] {
    return [...this.state.entries]
      .filter((e) => e.item.total_cost !== null)
      .sort(
        (a, b) => (b.item.total_cost as number) - (a.item.total_cost as number),
      )
      .slice(0, n)
      .map((e) => e.item);
  }

  detectOutliers(thresholdStddev = 2): OutlierResult[] {
    const clusters = groupByDescription(this.getItems());
    const results: OutlierResult[] = [];

    for (const items of Object.values(clusters)) {
      if (items.length < 3) continue;
      const prices = items
        .map((i) => i.unit_price)
        .filter((p): p is number => p !== null);
      if (prices.length < 3) continue;

      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance =
        prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
      const stddev = Math.sqrt(variance);

      for (const item of items) {
        if (item.unit_price === null) continue;
        const deviation = Math.abs(item.unit_price - mean) / stddev;
        if (deviation > thresholdStddev) {
          results.push({
            item,
            cluster_mean: mean,
            cluster_stddev: stddev,
            deviation_factor: deviation,
            cluster_size: items.length,
          });
        }
      }
    }

    return results;
  }

  summarize(): QuantitySummary {
    const items = this.getItems();
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
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
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

declare global {
  // eslint-disable-next-line no-var
  var __vectorStore: VectorStore | undefined;
}

export function getStore(): VectorStore {
  if (!globalThis.__vectorStore) {
    globalThis.__vectorStore = new VectorStore();
  }
  return globalThis.__vectorStore;
}

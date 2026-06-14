import type { BidItem } from "@/lib/csv-normaliser/model";
import type { FormatterOptions } from "./model";

export function formatBidItem(
  item: BidItem,
  options: FormatterOptions = {},
): string {
  const { currency_prefix = "$", include_extra_fields = true } = options;
  const lines: string[] = [];

  if (item.item_number !== null) lines.push(`Item Number: ${item.item_number}`);
  if (item.description !== null) lines.push(`Description: ${item.description}`);

  if (item.quantity !== null) {
    const qty =
      item.unit !== null
        ? `${item.quantity} ${item.unit}`
        : String(item.quantity);
    lines.push(`Quantity: ${qty}`);
  }

  if (item.unit_price !== null) {
    lines.push(`Unit Price: ${currency_prefix}${item.unit_price}`);
  }

  if (item.total_cost !== null) {
    lines.push(`Total Price: ${currency_prefix}${item.total_cost}`);
  }

  if (include_extra_fields) {
    for (const [key, value] of Object.entries(item.extra_fields)) {
      if (value !== null) lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

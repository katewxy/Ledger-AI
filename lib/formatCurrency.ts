import type { Currency } from "@/types";

export function formatAmount(amount: number, currency: Currency): string {
  const abs = Math.abs(amount);
  const symbol = currency === "CNY" ? "¥" : "$";
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

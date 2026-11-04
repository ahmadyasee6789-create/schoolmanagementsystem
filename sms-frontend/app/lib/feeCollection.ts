export type PeriodType = "monthly" | "quarterly" | "half_yearly" | "yearly" | "custom" | "advance_only";
const counts = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

export function billingPeriods(type: PeriodType, start: string, custom: string[]): string[] | null {
  if (type === "advance_only") return [];
  if (type === "custom") {
    if (!custom.length || custom.length > 120 || custom.some((month) => !monthPattern.test(month))
      || new Set(custom).size !== custom.length) return null;
    return [...custom].sort();
  }
  if (!monthPattern.test(start)) return null;
  const [year, month] = start.split("-").map(Number);
  const periods = Array.from({ length: counts[type] }, (_, index) => {
    const ordinal = month - 1 + index;
    return `${String(year + Math.floor(ordinal / 12)).padStart(4, "0")}-${String(ordinal % 12 + 1).padStart(2, "0")}`;
  });
  return periods.every((period) => monthPattern.test(period)) ? periods : null;
}

export function collectionMoney(input: string): string | null {
  if (input === "") return "0.00";
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(input)) return null;
  return Number(input).toFixed(2);
}

export function staleCollectionPreview(status: number | undefined, detail: unknown): boolean {
  return status === 409 && (
    detail === "Preview is stale; request a fresh preview before confirming"
    || detail === "Preview is no longer valid; request a fresh preview before confirming"
  );
}

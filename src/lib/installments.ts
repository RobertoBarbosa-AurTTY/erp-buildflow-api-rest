// Installment helpers shared by payables and receivables.
import { addMonths } from "./dates.ts";

/** Splits a total into `count` parts in cents; the last part absorbs the rounding. */
export function splitInstallments(total: number, count: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - base * (count - 1) : base) / 100);
}

/** Monthly due dates starting at the first one. */
export function installmentDueDates(firstDueIso: string, count: number) {
  const first = new Date(firstDueIso);
  return Array.from({ length: count }, (_, i) => addMonths(first, i).toISOString());
}

export function installmentDescription(description: string, n: number, total: number) {
  return `${description.replace(/\s*-\s*parcela\s+\d+\/\d+\s*$/i, "")} - parcela ${n}/${total}`;
}

export function installmentCount(value: number | undefined) {
  return Math.max(1, Math.min(48, Math.floor(value ?? 1)));
}

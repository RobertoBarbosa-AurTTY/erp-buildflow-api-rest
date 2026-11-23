// Date helpers. "Day keys" are YYYY-MM-DD in the server time zone (TZ, default America/Maceio).

export function dayKey(value: string | Date) {
  const d = new Date(value);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function parseDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfDay(date: Date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Same day of month n months later, clamped to the last day (Jan 31 + 1 = Feb 28). */
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/** Day keys from `fromKey` to `toKey`, inclusive (max 1000). */
export function dayRange(fromKey: string, toKey: string) {
  const keys: string[] = [];
  let cursor = parseDayKey(fromKey);
  const end = parseDayKey(toKey);
  while (cursor <= end && keys.length < 1000) {
    keys.push(dayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export function inDayRange(value: string | undefined, fromKey: string, toKey: string) {
  if (!value) return false;
  const key = dayKey(value);
  return key >= fromKey && key <= toKey;
}

/** "YYYY-MM-DD" -> ISO range [start of day, end of day] in local time, for Mongo string filters. */
export function dayBounds(fromKey?: string, toKey?: string) {
  const range: { $gte?: string; $lte?: string } = {};
  if (fromKey) range.$gte = new Date(`${fromKey}T00:00:00`).toISOString();
  if (toKey) range.$lte = new Date(`${toKey}T23:59:59.999`).toISOString();
  return range;
}

export function shortDayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

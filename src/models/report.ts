// Dashboard, sales report and DRE. Only FINALIZED sales count (quotes and cancelled are left out).
// The numbers are computed in memory from the period's documents: simple and enough for a store's volume.
import { collection } from "../db.ts";
import { billStatus, daysUntil, round2, stockStatus } from "../lib/calc.ts";
import { addDays, dayBounds, dayKey, dayRange, inDayRange, parseDayKey, shortDayLabel, startOfDay } from "../lib/dates.ts";
import type { Payable, Receivable } from "../views/bill.ts";
import type { PaymentMethod } from "../views/common.ts";
import type { Product } from "../views/product.ts";
import type { Dashboard, DashboardPeriod, Dre, SalesReport } from "../views/report.ts";
import type { Sale } from "../views/sale.ts";
import type { CompanySettings } from "../views/settings.ts";

type CostIndex = Map<string, number>;

export interface Snapshot {
  sales: Sale[];
  products: Product[];
  payables: Payable[];
  receivables: Receivable[];
  costs: CostIndex;
}

/** Loads the data used by the reports. `fromKey` limits the sales to load. */
export async function loadSnapshot(fromKey?: string): Promise<Snapshot> {
  const [sales, products, payables, receivables] = await Promise.all([
    collection<Sale>("sales").find(fromKey ? { createdAt: dayBounds(fromKey) } : {}).toArray(),
    collection<Product>("products").find().toArray(),
    collection<Payable>("accounts_payable").find().toArray(),
    collection<Receivable>("accounts_receivable").find().toArray(),
  ]);
  return { sales, products, payables, receivables, costs: new Map(products.map((p) => [p._id, p.costPrice])) };
}

/** Cost of goods sold. Without a registered cost, uses 70% of the price (legacy rule). */
function saleCost(sale: Sale, costs: CostIndex) {
  return sale.items.reduce((sum, item) => sum + (costs.get(item.id) ?? item.price * 0.7) * item.qty, 0);
}

/** Net revenue per item, spreading the global discount proportionally. */
function itemNetRevenue(sale: Sale) {
  const lines = sale.items.map((item) => {
    const gross = item.qty * item.price;
    const discount =
      item.discount > 0
        ? item.discountType === "value"
          ? Math.min(item.discount, gross)
          : gross * (Math.min(item.discount, 100) / 100)
        : 0;
    return { item, net: Math.max(0, gross - discount) };
  });
  const subtotal = lines.reduce((s, l) => s + l.net, 0);
  const factor = subtotal > 0 ? sale.total / subtotal : 0;
  return lines.map((l) => ({ item: l.item, revenue: l.net * factor }));
}

function finalizedSales(data: Snapshot, fromKey: string, toKey: string) {
  return data.sales.filter((s) => s.status === "FINALIZED" && inDayRange(s.createdAt, fromKey, toKey));
}

function summarize(list: Sale[], costs: CostIndex) {
  const revenue = list.reduce((s, x) => s + x.total, 0);
  const cost = list.reduce((s, x) => s + saleCost(x, costs), 0);
  const discounts = list.reduce((s, x) => s + (x.totalDiscount || 0), 0);
  const items = list.reduce((s, x) => s + x.items.reduce((q, i) => q + i.qty, 0), 0);
  return {
    revenue: round2(revenue),
    gross: round2(revenue + discounts),
    discounts: round2(discounts),
    cost: round2(cost),
    profit: round2(revenue - cost),
    margin: revenue > 0 ? (revenue - cost) / revenue : 0,
    count: list.length,
    avgTicket: list.length ? round2(revenue / list.length) : 0,
    itemsSold: round2(items),
  };
}

function paymentBreakdown(list: Sale[]) {
  const map = new Map<PaymentMethod, { total: number; count: number }>();
  for (const s of list) {
    const row = map.get(s.paymentMethod) ?? { total: 0, count: 0 };
    row.total += s.total;
    row.count += 1;
    map.set(s.paymentMethod, row);
  }
  const grand = list.reduce((s, x) => s + x.total, 0);
  return [...map.entries()]
    .map(([method, v]) => ({ method, total: round2(v.total), count: v.count, share: grand ? v.total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}

function groupByDay(list: Sale[]) {
  const map = new Map<string, Sale[]>();
  for (const s of list) {
    const key = dayKey(s.createdAt);
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// DRE

export function computeDre(data: Snapshot, fromKey: string, toKey: string): Dre {
  const sum = summarize(finalizedSales(data, fromKey, toKey), data.costs);
  const despesasPagas = data.payables
    .filter((b) => b.status === "paid" && inDayRange(b.paidDate, fromKey, toKey))
    .reduce((s, b) => s + b.amount, 0);
  const outrosRecebimentos = data.receivables
    .filter((b) => b.status === "paid" && inDayRange(b.receivedDate, fromKey, toKey))
    .reduce((s, b) => s + b.amount, 0);
  const receitaLiquida = sum.gross - sum.discounts;
  const lucroBruto = receitaLiquida - sum.cost;
  return {
    receitaBruta: round2(sum.gross),
    descontos: round2(sum.discounts),
    receitaLiquida: round2(receitaLiquida),
    cmv: round2(sum.cost),
    lucroBruto: round2(lucroBruto),
    despesasPagas: round2(despesasPagas),
    outrosRecebimentos: round2(outrosRecebimentos),
    resultado: round2(lucroBruto - despesasPagas + outrosRecebimentos),
  };
}

// ---------------------------------------------------------------------------
// Dashboard

function periodRange(period: DashboardPeriod) {
  const today = startOfDay();
  let from = today;
  let prevFrom = addDays(today, -1);
  let prevTo = addDays(today, -1);
  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    from = addDays(today, -(days - 1));
    prevFrom = addDays(from, -days);
    prevTo = addDays(from, -1);
  } else if (period === "month") {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    // same number of days in the previous month, to compare equivalent periods
    const lastPrev = new Date(today.getFullYear(), today.getMonth(), 0);
    prevTo = addDays(prevFrom, Math.min(today.getDate() - 1, lastPrev.getDate() - 1));
  }
  return { from: dayKey(from), to: dayKey(today), prevFrom: dayKey(prevFrom), prevTo: dayKey(prevTo) };
}

function upcomingBills(data: Snapshot, windowDays: number): Dashboard["bills"] {
  const rows: Dashboard["bills"] = [];
  const push = (bill: Payable | Receivable, kind: "payable" | "receivable", party: string) => {
    const status = billStatus(bill);
    if (status !== "pending" && status !== "overdue") return;
    const days = daysUntil(bill.dueDate);
    if (days > windowDays) return;
    rows.push({ id: bill._id, kind, description: bill.description, party, amount: bill.amount, dueDate: bill.dueDate, days, overdue: status === "overdue" });
  };
  data.payables.forEach((b) => push(b, "payable", b.supplier));
  data.receivables.forEach((b) => push(b, "receivable", b.customerName));
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function getDashboard(period: DashboardPeriod): Promise<Dashboard> {
  const range = periodRange(period);
  const monthStart = dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const data = await loadSnapshot([range.prevFrom, monthStart].sort()[0]);
  const settings = await collection<CompanySettings & { _id: string }>("settings").findOne({ _id: "company" });
  const { costs } = data;
  const current = finalizedSales(data, range.from, range.to);
  const todaySum = summarize(finalizedSales(data, range.to, range.to), costs);
  const monthSum = summarize(finalizedSales(data, monthStart, range.to), costs);

  // Series: by hour today, by day in the other periods
  const seriesBucket = period === "today" ? "hour" : "day";
  const series: Dashboard["series"] = [];
  if (seriesBucket === "hour") {
    for (let h = 7; h <= 20; h++) {
      const sum = summarize(current.filter((s) => new Date(s.createdAt).getHours() === h), costs);
      series.push({ key: String(h), label: `${String(h).padStart(2, "0")}h`, revenue: sum.revenue, profit: sum.profit, count: sum.count });
    }
  } else {
    const byDay = groupByDay(current);
    for (const key of dayRange(range.from, range.to)) {
      const sum = summarize(byDay.get(key) ?? [], costs);
      series.push({ key, label: shortDayLabel(parseDayKey(key)), revenue: sum.revenue, profit: sum.profit, count: sum.count });
    }
  }

  const productMap = new Map<string, Dashboard["topProducts"][number]>();
  for (const s of current) {
    for (const { item, revenue } of itemNetRevenue(s)) {
      const row = productMap.get(item.id) ?? { id: item.id, sku: item.sku, name: item.name, qty: 0, unit: item.unit, revenue: 0 };
      row.qty += item.qty;
      row.revenue += revenue;
      productMap.set(item.id, row);
    }
  }
  const topProducts = [...productMap.values()]
    .map((p) => ({ ...p, revenue: round2(p.revenue), qty: round2(p.qty) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const expiryDays = settings?.expiryAlertDays ?? 30;
  const active = data.products.filter((p) => p.active);
  const lowStock = active
    .map((p) => ({ p, status: stockStatus(p) }))
    .filter((x) => x.status === "low" || x.status === "out")
    .sort((a, b) => a.p.quantity / Math.max(1, a.p.minStock) - b.p.quantity / Math.max(1, b.p.minStock));
  const expiryAlerts = active
    .filter((p) => p.expiryDate && daysUntil(p.expiryDate) <= expiryDays)
    .map((p) => ({ id: p._id, name: p.name, sku: p.sku, quantity: p.quantity, expiryDate: p.expiryDate!, days: daysUntil(p.expiryDate) }))
    .sort((a, b) => a.days - b.days);

  const bills = upcomingBills(data, 7);
  const sumBills = (kind: "payable" | "receivable", overdue: boolean) =>
    round2(bills.filter((b) => b.kind === kind && b.overdue === overdue).reduce((s, b) => s + b.amount, 0));

  return {
    period,
    from: range.from,
    to: range.to,
    summary: summarize(current, costs),
    previous: summarize(finalizedSales(data, range.prevFrom, range.prevTo), costs),
    today: { revenue: todaySum.revenue, count: todaySum.count },
    month: { revenue: monthSum.revenue, count: monthSum.count },
    series,
    seriesBucket,
    payments: paymentBreakdown(current),
    topProducts,
    stockAlerts: lowStock.slice(0, 6).map(({ p, status }) => ({
      id: p._id, name: p.name, sku: p.sku, quantity: p.quantity, minStock: p.minStock, unit: p.unit, status,
    })),
    stockAlertsTotal: lowStock.length,
    expiryAlerts,
    bills,
    billsTotals: {
      payable: sumBills("payable", false),
      receivable: sumBills("receivable", false),
      overduePayable: sumBills("payable", true),
      overdueReceivable: sumBills("receivable", true),
    },
    recentSales: [...current]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((s) => ({
        id: s._id, saleNumber: s.saleNumber, customerName: s.customerName ?? null, paymentMethod: s.paymentMethod,
        total: s.total, itemsCount: s.items.length, createdAt: s.createdAt,
      })),
  };
}

// ---------------------------------------------------------------------------
// Sales report

export async function getSalesReport(fromKey: string, toKey: string): Promise<SalesReport> {
  const data = await loadSnapshot(fromKey);
  const { costs } = data;
  const byId = new Map(data.products.map((p) => [p._id, p]));
  const list = finalizedSales(data, fromKey, toKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cancelled = data.sales.filter((s) => s.status === "CANCELLED" && inDayRange(s.createdAt, fromKey, toKey));

  const byDay = groupByDay(list);
  const daily = dayRange(fromKey, toKey).map((key) => {
    const sum = summarize(byDay.get(key) ?? [], costs);
    return { key, label: shortDayLabel(parseDayKey(key)), revenue: sum.revenue, cost: sum.cost, profit: sum.profit, count: sum.count };
  });

  type ProductRow = Omit<SalesReport["products"][number], "margin" | "share" | "abc">;
  const productMap = new Map<string, ProductRow>();
  for (const s of list) {
    for (const { item, revenue } of itemNetRevenue(s)) {
      const unitCost = costs.get(item.id) ?? item.price * 0.7;
      const row = productMap.get(item.id) ?? {
        id: item.id, sku: item.sku, name: item.name, category: byId.get(item.id)?.category ?? "Sem categoria",
        unit: item.unit, qty: 0, revenue: 0, cost: 0, profit: 0,
      };
      row.qty += item.qty;
      row.revenue += revenue;
      row.cost += unitCost * item.qty;
      row.profit = row.revenue - row.cost;
      productMap.set(item.id, row);
    }
  }
  const totalRevenue = [...productMap.values()].reduce((s, p) => s + p.revenue, 0);
  let cumulative = 0;
  const products = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => {
      const share = totalRevenue ? p.revenue / totalRevenue : 0;
      const before = cumulative;
      cumulative += share;
      const abc: "A" | "B" | "C" = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
      return {
        ...p, qty: round2(p.qty), revenue: round2(p.revenue), cost: round2(p.cost), profit: round2(p.profit),
        margin: p.revenue ? p.profit / p.revenue : 0, share, abc,
      };
    });

  const categoryMap = new Map<string, SalesReport["categories"][number]>();
  for (const p of products) {
    const row = categoryMap.get(p.category) ?? { category: p.category, qty: 0, products: 0, revenue: 0, cost: 0, profit: 0, margin: 0, share: 0 };
    row.qty += p.qty;
    row.products += 1;
    row.revenue += p.revenue;
    row.cost += p.cost;
    row.profit += p.profit;
    categoryMap.set(p.category, row);
  }
  const categories = [...categoryMap.values()]
    .map((c) => ({
      ...c, qty: round2(c.qty), revenue: round2(c.revenue), cost: round2(c.cost), profit: round2(c.profit),
      margin: c.revenue ? c.profit / c.revenue : 0, share: totalRevenue ? c.revenue / totalRevenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    from: fromKey,
    to: toKey,
    summary: summarize(list, costs),
    cancelled: { count: cancelled.length, total: round2(cancelled.reduce((s, x) => s + x.total, 0)) },
    daily,
    sales: list.map((s) => {
      const cost = saleCost(s, costs);
      return {
        id: s._id, saleNumber: s.saleNumber, createdAt: s.createdAt, customerName: s.customerName ?? null,
        userName: s.userName, paymentMethod: s.paymentMethod, itemsCount: s.items.length,
        discount: s.totalDiscount || 0, total: s.total, cost: round2(cost), profit: round2(s.total - cost),
      };
    }),
    products,
    categories,
    payments: paymentBreakdown(list).map((p) => ({ ...p, avgTicket: p.count ? round2(p.total / p.count) : 0 })),
    dre: computeDre(data, fromKey, toKey),
  };
}

// Dashboard, sales report, P&L (DRE) and cash flow.
// Field names in Portuguese (receitaBruta, entradaRealizada...) are kept because the front-end reads them.
import { z } from "zod";
import { DayKey, Id, IsoDate, Money, PaymentMethod } from "./common.ts";
import { StockStatus } from "./product.ts";

export const SalesSummary = z
  .object({
    revenue: Money,
    gross: Money.meta({ description: "Revenue + discounts" }),
    discounts: Money,
    cost: Money.meta({ description: "Cost of goods sold (70% of price when the product has no cost)" }),
    profit: Money,
    margin: z.number().meta({ description: "Fraction (0.25 = 25%)" }),
    count: z.number(),
    avgTicket: Money,
    itemsSold: z.number(),
  })
  .meta({ id: "SalesSummary" });

export const PaymentBreakdown = z
  .object({ method: PaymentMethod, total: Money, count: z.number(), share: z.number() })
  .meta({ id: "PaymentBreakdown" });

export const Dre = z
  .object({
    receitaBruta: Money.meta({ description: "Gross revenue" }),
    descontos: Money.meta({ description: "Discounts" }),
    receitaLiquida: Money.meta({ description: "Net revenue" }),
    cmv: Money.meta({ description: "Cost of goods sold" }),
    lucroBruto: Money.meta({ description: "Gross profit" }),
    despesasPagas: Money.meta({ description: "Paid payables" }),
    outrosRecebimentos: Money.meta({ description: "Received receivables" }),
    resultado: Money.meta({ description: "Result" }),
  })
  .meta({ id: "Dre", description: "Simplified income statement (DRE)" });
export type Dre = z.infer<typeof Dre>;

export const DashboardPeriod = z.enum(["today", "7d", "30d", "month"]).meta({ id: "DashboardPeriod" });
export type DashboardPeriod = z.infer<typeof DashboardPeriod>;

export const Dashboard = z
  .object({
    period: DashboardPeriod,
    from: DayKey,
    to: DayKey,
    summary: SalesSummary,
    previous: SalesSummary.meta({ description: "Previous equivalent period" }),
    today: z.object({ revenue: Money, count: z.number() }),
    month: z.object({ revenue: Money, count: z.number() }),
    series: z.array(z.object({ key: z.string(), label: z.string(), revenue: Money, profit: Money, count: z.number() })),
    seriesBucket: z.enum(["hour", "day"]),
    payments: z.array(PaymentBreakdown),
    topProducts: z.array(
      z.object({ id: z.string(), sku: z.string(), name: z.string(), qty: z.number(), unit: z.string(), revenue: Money }),
    ),
    stockAlerts: z.array(
      z.object({
        id: Id,
        name: z.string(),
        sku: z.string(),
        quantity: z.number(),
        minStock: z.number(),
        unit: z.string(),
        status: StockStatus,
      }),
    ),
    stockAlertsTotal: z.number(),
    expiryAlerts: z.array(
      z.object({ id: Id, name: z.string(), sku: z.string(), quantity: z.number(), expiryDate: IsoDate, days: z.number() }),
    ),
    bills: z.array(
      z.object({
        id: Id,
        kind: z.enum(["payable", "receivable"]),
        description: z.string(),
        party: z.string(),
        amount: Money,
        dueDate: IsoDate,
        days: z.number(),
        overdue: z.boolean(),
      }),
    ),
    billsTotals: z.object({ payable: Money, receivable: Money, overduePayable: Money, overdueReceivable: Money }),
    recentSales: z.array(
      z.object({
        id: Id,
        saleNumber: z.number(),
        customerName: z.string().nullable(),
        paymentMethod: PaymentMethod,
        total: Money,
        itemsCount: z.number(),
        createdAt: IsoDate,
      }),
    ),
  })
  .meta({ id: "Dashboard" });
export type Dashboard = z.infer<typeof Dashboard>;

export const SalesReport = z
  .object({
    from: DayKey,
    to: DayKey,
    summary: SalesSummary,
    cancelled: z.object({ count: z.number(), total: Money }),
    daily: z.array(z.object({ key: DayKey, label: z.string(), revenue: Money, cost: Money, profit: Money, count: z.number() })),
    sales: z.array(
      z.object({
        id: Id,
        saleNumber: z.number(),
        createdAt: IsoDate,
        customerName: z.string().nullable(),
        userName: z.string(),
        paymentMethod: PaymentMethod,
        itemsCount: z.number(),
        discount: Money,
        total: Money,
        cost: Money,
        profit: Money,
      }),
    ),
    products: z.array(
      z.object({
        id: z.string(),
        sku: z.string(),
        name: z.string(),
        category: z.string(),
        unit: z.string(),
        qty: z.number(),
        revenue: Money,
        cost: Money,
        profit: Money,
        margin: z.number(),
        share: z.number(),
        abc: z.enum(["A", "B", "C"]).meta({ description: "ABC curve: A up to 80% of revenue, B up to 95%, C the rest" }),
      }),
    ),
    categories: z.array(
      z.object({
        category: z.string(),
        qty: z.number(),
        products: z.number(),
        revenue: Money,
        cost: Money,
        profit: Money,
        margin: z.number(),
        share: z.number(),
      }),
    ),
    payments: z.array(PaymentBreakdown.extend({ avgTicket: Money })),
    dre: Dre,
  })
  .meta({ id: "SalesReport" });
export type SalesReport = z.infer<typeof SalesReport>;

const CashFlowDay = z.object({
  key: DayKey,
  label: z.string(),
  isToday: z.boolean(),
  isFuture: z.boolean(),
  entradaRealizada: Money.meta({ description: "Realized inflow" }),
  saidaRealizada: Money.meta({ description: "Realized outflow" }),
  entradaPrevista: Money.meta({ description: "Expected inflow" }),
  saidaPrevista: Money.meta({ description: "Expected outflow" }),
  saldoDia: Money.meta({ description: "Day balance" }),
  saldoAcumulado: Money.meta({ description: "Running balance" }),
});

export const CashFlow = z
  .object({
    todayKey: DayKey,
    days: z.array(CashFlowDay).meta({ description: "Last 30 days + next 30 days" }),
    totals: z.object({
      entradasRealizadas: Money,
      saidasRealizadas: Money,
      saldoRealizado: Money,
      entradasPrevistas: Money,
      saidasPrevistas: Money,
      saldoProjetado: Money,
      overdueReceivable: Money,
      overduePayable: Money,
      menorSaldo: z.object({ key: DayKey, value: Money }).nullable().meta({ description: "Lowest future running balance" }),
    }),
    months: z.array(Dre.extend({ key: z.string(), label: z.string(), partial: z.boolean() })).meta({
      description: "Monthly DRE: current month (partial) and up to 5 previous months",
    }),
  })
  .meta({ id: "CashFlow" });
export type CashFlow = z.infer<typeof CashFlow>;

const DayEntry = z.object({
  id: Id,
  kind: z.enum(["sale", "receivable", "payable"]),
  realized: z.boolean(),
  overdue: z.boolean(),
  description: z.string(),
  party: z.string(),
  method: z.string().optional(),
  date: IsoDate,
  amount: Money,
});
export type DayEntry = z.infer<typeof DayEntry>;

export const CashFlowDayDetail = z
  .object({
    key: DayKey,
    isToday: z.boolean(),
    entradas: z.array(DayEntry).meta({ description: "Inflows" }),
    saidas: z.array(DayEntry).meta({ description: "Outflows" }),
    totals: z.object({
      entradaRealizada: Money,
      entradaPrevista: Money,
      saidaRealizada: Money,
      saidaPrevista: Money,
      saldo: Money,
    }),
  })
  .meta({ id: "CashFlowDayDetail" });
export type CashFlowDayDetail = z.infer<typeof CashFlowDayDetail>;

// Cash flow: realized + expected.
//   Realized inflow:  finalized sales (except Crediário, counted when the installment is received) + received receivables.
//   Realized outflow: paid payables.
//   Expected:         open receivables/payables. Overdue ones are placed on "today".
import { billStatus, round2 } from "../lib/calc.ts";
import { addDays, dayKey, shortDayLabel, startOfDay } from "../lib/dates.ts";
import type { CashFlow, CashFlowDayDetail, DayEntry } from "../views/report.ts";
import { computeDre, loadSnapshot, type Snapshot } from "./report.ts";

const DAYS = 30;

interface Bucket {
  entradaRealizada: number;
  saidaRealizada: number;
  entradaPrevista: number;
  saidaPrevista: number;
}

const isOpen = (status: string) => status === "pending" || status === "overdue";

function buckets(data: Snapshot, todayKey: string) {
  const map = new Map<string, Bucket>();
  const get = (key: string) => {
    let row = map.get(key);
    if (!row) {
      row = { entradaRealizada: 0, saidaRealizada: 0, entradaPrevista: 0, saidaPrevista: 0 };
      map.set(key, row);
    }
    return row;
  };
  const expectedKey = (due: string) => {
    const key = dayKey(due);
    return key < todayKey ? todayKey : key;
  };
  for (const s of data.sales) {
    if (s.status === "FINALIZED" && s.paymentMethod !== "Crediário") get(dayKey(s.createdAt)).entradaRealizada += s.total;
  }
  for (const b of data.receivables) {
    if (b.status === "paid" && b.receivedDate) get(dayKey(b.receivedDate)).entradaRealizada += b.amount;
    if (isOpen(billStatus(b))) get(expectedKey(b.dueDate)).entradaPrevista += b.amount;
  }
  for (const b of data.payables) {
    if (b.status === "paid" && b.paidDate) get(dayKey(b.paidDate)).saidaRealizada += b.amount;
    if (isOpen(billStatus(b))) get(expectedKey(b.dueDate)).saidaPrevista += b.amount;
  }
  return map;
}

export async function getCashFlow(): Promise<CashFlow> {
  const today = startOfDay();
  const todayKey = dayKey(today);
  const firstMonth = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const data = await loadSnapshot(dayKey(firstMonth < addDays(today, -DAYS) ? firstMonth : addDays(today, -DAYS)));
  const map = buckets(data, todayKey);

  const days: CashFlow["days"] = [];
  let running = 0;
  for (let i = -(DAYS - 1); i <= DAYS; i++) {
    const date = addDays(today, i);
    const key = dayKey(date);
    const row = map.get(key) ?? { entradaRealizada: 0, saidaRealizada: 0, entradaPrevista: 0, saidaPrevista: 0 };
    const saldoDia = row.entradaRealizada + row.entradaPrevista - row.saidaRealizada - row.saidaPrevista;
    running += saldoDia;
    days.push({
      key,
      label: shortDayLabel(date),
      isToday: key === todayKey,
      isFuture: key > todayKey,
      entradaRealizada: round2(row.entradaRealizada),
      saidaRealizada: round2(row.saidaRealizada),
      entradaPrevista: round2(row.entradaPrevista),
      saidaPrevista: round2(row.saidaPrevista),
      saldoDia: round2(saldoDia),
      saldoAcumulado: round2(running),
    });
  }

  const sum = (pick: (d: CashFlow["days"][number]) => number) => round2(days.reduce((s, d) => s + pick(d), 0));
  const entradasRealizadas = sum((d) => d.entradaRealizada);
  const saidasRealizadas = sum((d) => d.saidaRealizada);
  const lowest = days
    .filter((d) => d.key >= todayKey)
    .reduce<CashFlow["days"][number] | null>((min, d) => (!min || d.saldoAcumulado < min.saldoAcumulado ? d : min), null);
  const overdue = (list: { status: "pending" | "paid" | "overdue" | "cancelled"; dueDate: string; amount: number }[]) =>
    round2(list.filter((b) => billStatus(b) === "overdue").reduce((s, b) => s + b.amount, 0));

  // Monthly DRE: current month (partial) + 5 previous, dropping leading months without activity
  const months: CashFlow["months"] = [];
  for (let m = 5; m >= 0; m--) {
    const start = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const end = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    const month = start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    months.push({
      key: dayKey(start).slice(0, 7),
      label: `${month}/${String(start.getFullYear()).slice(2)}`,
      partial: m === 0,
      ...computeDre(data, dayKey(start), dayKey(end)),
    });
  }
  while (months.length > 1 && !months[0].receitaBruta && !months[0].despesasPagas && !months[0].outrosRecebimentos) {
    months.shift();
  }

  return {
    todayKey,
    days,
    totals: {
      entradasRealizadas,
      saidasRealizadas,
      saldoRealizado: round2(entradasRealizadas - saidasRealizadas),
      entradasPrevistas: sum((d) => d.entradaPrevista),
      saidasPrevistas: sum((d) => d.saidaPrevista),
      saldoProjetado: days.at(-1)?.saldoAcumulado ?? 0,
      overdueReceivable: overdue(data.receivables),
      overduePayable: overdue(data.payables),
      menorSaldo: lowest ? { key: lowest.key, value: lowest.saldoAcumulado } : null,
    },
    months,
  };
}

export async function getCashFlowDay(key: string): Promise<CashFlowDayDetail> {
  const todayKey = dayKey(new Date());
  const isToday = key === todayKey;
  const data = await loadSnapshot(key);
  const entradas: DayEntry[] = [];
  const saidas: DayEntry[] = [];
  // overdue expectations fall on "today"
  const isExpectedOn = (due: string) => {
    const dueKey = dayKey(due);
    return dueKey === key || (isToday && dueKey < todayKey);
  };

  for (const s of data.sales) {
    if (s.status !== "FINALIZED" || s.paymentMethod === "Crediário" || dayKey(s.createdAt) !== key) continue;
    entradas.push({
      id: s._id, kind: "sale", realized: true, overdue: false, description: `Venda #${s.saleNumber}`,
      party: s.customerName || "Consumidor final", method: s.paymentMethod, date: s.createdAt, amount: s.total,
    });
  }
  for (const b of data.receivables) {
    const status = billStatus(b);
    const base = { id: b._id, kind: "receivable" as const, description: b.description, party: b.customerName, amount: b.amount };
    if (b.status === "paid" && b.receivedDate && dayKey(b.receivedDate) === key) {
      entradas.push({ ...base, realized: true, overdue: false, method: b.paymentMethod, date: b.receivedDate });
    } else if (isOpen(status) && isExpectedOn(b.dueDate)) {
      entradas.push({ ...base, realized: false, overdue: status === "overdue", date: b.dueDate });
    }
  }
  for (const b of data.payables) {
    const status = billStatus(b);
    const base = { id: b._id, kind: "payable" as const, description: b.description, party: b.supplier, amount: b.amount };
    if (b.status === "paid" && b.paidDate && dayKey(b.paidDate) === key) {
      saidas.push({ ...base, realized: true, overdue: false, method: b.paymentMethod, date: b.paidDate });
    } else if (isOpen(status) && isExpectedOn(b.dueDate)) {
      saidas.push({ ...base, realized: false, overdue: status === "overdue", date: b.dueDate });
    }
  }

  const order = (a: DayEntry, b: DayEntry) => Number(b.realized) - Number(a.realized) || b.amount - a.amount;
  entradas.sort(order);
  saidas.sort(order);
  const total = (list: DayEntry[], realized: boolean) =>
    round2(list.filter((e) => e.realized === realized).reduce((s, e) => s + e.amount, 0));
  const totals = {
    entradaRealizada: total(entradas, true),
    entradaPrevista: total(entradas, false),
    saidaRealizada: total(saidas, true),
    saidaPrevista: total(saidas, false),
    saldo: 0,
  };
  totals.saldo = round2(totals.entradaRealizada + totals.entradaPrevista - totals.saidaRealizada - totals.saidaPrevista);
  return { key, isToday, entradas, saidas, totals };
}

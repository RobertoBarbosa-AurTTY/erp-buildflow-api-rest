// Cash register sessions: open, cash in/out (suprimento/sangria), close with counting, audit.
import { randomUUID } from "node:crypto";
import { HttpError } from "../core/http-error.ts";
import { collection, nextSequence } from "../db.ts";
import { round2, saleAmountsByMethod } from "../lib/calc.ts";
import { dayBounds } from "../lib/dates.ts";
import type { CashMovement, CashSession, CashSummary, CountedByMethod } from "../views/cash-session.ts";
import { PAYMENT_METHODS, type PaymentMethod } from "../views/common.ts";
import type { Sale } from "../views/sale.ts";

const cashSessions = () => collection<CashSession>("cash_sessions");
const cashMovements = () => collection<CashMovement>("cash_movements");
const sales = () => collection<Sale>("sales");

/** Methods counted at closing ("Crediário" does not enter the drawer). */
const RECONCILED_METHODS = PAYMENT_METHODS.filter((m) => m !== "Crediário");
const LONG_OPEN_MS = 24 * 60 * 60 * 1000;

const emptyByMethod = () => Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;

function summarize(session: CashSession, sessionSales: Sale[], movements: CashMovement[]): CashSummary {
  const byMethod = emptyByMethod();
  let totalSales = 0;
  let totalDiscounts = 0;
  let salesCount = 0;
  let cancelledCount = 0;
  for (const sale of sessionSales) {
    if (sale.status === "CANCELLED") cancelledCount++;
    if (sale.status !== "FINALIZED") continue;
    salesCount++;
    totalSales += sale.total;
    totalDiscounts += sale.totalDiscount;
    for (const [method, amount] of Object.entries(saleAmountsByMethod(sale))) {
      byMethod[method as PaymentMethod] += amount ?? 0;
    }
  }
  for (const m of PAYMENT_METHODS) byMethod[m] = round2(byMethod[m]);

  const sum = (type: CashMovement["type"]) =>
    round2(movements.filter((m) => m.type === type).reduce((s, m) => s + m.amount, 0));
  const suprimentos = sum("suprimento");
  const retiradas = sum("retirada");
  const expectedCash = round2(session.openingAmount + byMethod.Dinheiro + suprimentos - retiradas);
  const expectedByMethod = { ...byMethod, Dinheiro: expectedCash };

  let counted: number | null = null;
  let difference: number | null = null;
  if (session.status === "fechado") {
    if (session.countedByMethod) {
      counted = round2(RECONCILED_METHODS.reduce((s, m) => s + (session.countedByMethod?.[m] ?? 0), 0));
      difference = round2(counted - RECONCILED_METHODS.reduce((s, m) => s + expectedByMethod[m], 0));
    } else if (session.closingAmount != null) {
      // Old records only store the cash counted in the drawer.
      counted = round2(session.closingAmount);
      difference = round2(counted - expectedCash);
    }
  }

  const end = session.closedAt ? new Date(session.closedAt).getTime() : Date.now();
  const durationMs = Math.max(0, end - new Date(session.openedAt).getTime());
  return {
    session,
    salesCount,
    cancelledCount,
    totalSales: round2(totalSales),
    totalDiscounts: round2(totalDiscounts),
    byMethod,
    suprimentos,
    retiradas,
    expectedCash,
    expectedByMethod,
    counted,
    difference,
    durationMs,
    longOpen: session.status === "aberto" && durationMs > LONG_OPEN_MS,
  };
}

async function sessionData(sessionId: string) {
  const [sessionSales, movements] = await Promise.all([
    sales().find({ caixaId: sessionId }).sort({ createdAt: -1 }).toArray(),
    cashMovements().find({ caixaId: sessionId }).sort({ timestamp: 1 }).toArray(),
  ]);
  return { sessionSales, movements };
}

async function summaryOf(session: CashSession) {
  const { sessionSales, movements } = await sessionData(session._id);
  return summarize(session, sessionSales, movements);
}

/** Open session with its summary, or null. */
export async function getOpenSession() {
  const open = await cashSessions().findOne({ status: "aberto" });
  return open ? summaryOf(open) : null;
}

export async function getSessionDetail(id: string) {
  const session = await cashSessions().findOne({ _id: id });
  if (!session) throw new HttpError(404, "Caixa não encontrado");
  const { sessionSales, movements } = await sessionData(id);
  return { ...summarize(session, sessionSales, movements), sales: sessionSales, movements };
}

export async function listSessionSummaries(filters: { start?: string; end?: string; status?: CashSession["status"] }) {
  const query: Record<string, unknown> = {};
  if (filters.start || filters.end) query.openedAt = dayBounds(filters.start, filters.end);
  if (filters.status) query.status = filters.status;
  const sessions = await cashSessions().find(query).sort({ openedAt: -1 }).toArray();
  const ids = sessions.map((s) => s._id);
  const [saleList, moveList] = await Promise.all([
    sales().find({ caixaId: { $in: ids } }).toArray(),
    cashMovements().find({ caixaId: { $in: ids } }).toArray(),
  ]);
  return sessions.map((s) =>
    summarize(
      s,
      saleList.filter((x) => x.caixaId === s._id),
      moveList.filter((x) => x.caixaId === s._id),
    ),
  );
}

export async function openCashSession(input: { openingAmount: number; notes?: string }, operatorName: string) {
  if (await cashSessions().findOne({ status: "aberto" })) {
    throw new HttpError(409, "Já existe um caixa aberto. Feche-o antes de abrir um novo.");
  }
  const session: CashSession = {
    _id: randomUUID(),
    number: await nextSequence("cash_sessions"),
    status: "aberto",
    operatorName,
    openedAt: new Date().toISOString(),
    openingAmount: round2(input.openingAmount),
    notes: input.notes?.trim() || undefined,
  };
  await cashSessions().insertOne(session);
  return session;
}

export async function addCashMovement(
  sessionId: string,
  input: { type: CashMovement["type"]; amount: number; reason: string },
  userName: string,
) {
  const session = await cashSessions().findOne({ _id: sessionId });
  if (!session || session.status !== "aberto") throw new HttpError(409, "O caixa precisa estar aberto.");
  const amount = round2(input.amount);
  if (input.type === "retirada") {
    const { expectedCash } = await summaryOf(session);
    if (amount > expectedCash) {
      const available = expectedCash.toFixed(2).replace(".", ",");
      throw new HttpError(400, `Sangria maior que o dinheiro disponível em caixa (R$ ${available}).`);
    }
  }
  const movement: CashMovement = {
    _id: randomUUID(),
    caixaId: session._id,
    type: input.type,
    amount,
    reason: input.reason,
    userName,
    timestamp: new Date().toISOString(),
  };
  await cashMovements().insertOne(movement);
  return movement;
}

export async function closeCashSession(id: string, input: { counted: CountedByMethod; notes?: string }) {
  const session = await cashSessions().findOne({ _id: id });
  if (!session || session.status !== "aberto") throw new HttpError(409, "Nenhum caixa aberto para fechar.");
  const counted: CountedByMethod = {};
  for (const m of RECONCILED_METHODS) counted[m] = round2(input.counted[m] ?? 0);
  const closed: CashSession = {
    ...session,
    status: "fechado",
    closedAt: new Date().toISOString(),
    closingAmount: counted.Dinheiro ?? 0,
    countedByMethod: counted,
    notes: input.notes?.trim() || session.notes,
  };
  await cashSessions().replaceOne({ _id: id }, closed);
  return summaryOf(closed);
}

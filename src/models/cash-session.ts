// Cash register sessions: open, cash in/out (suprimento/sangria), close with counting, audit.
import { randomUUID } from "node:crypto";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, json, nextSequence, replace } from "../db.ts";
import { round2, saleAmountsByMethod } from "../lib/calc.ts";
import { dayBounds } from "../lib/dates.ts";
import type { CashMovement, CashSession, CashSummary, CountedByMethod } from "../views/cash-session.ts";
import { PAYMENT_METHODS, type PaymentMethod } from "../views/common.ts";
import type { Sale } from "../views/sale.ts";

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
    docs<Sale>(`SELECT doc FROM sales WHERE doc->>'caixaId' = $1 ORDER BY doc->>'createdAt' COLLATE "C" DESC`, [sessionId]),
    docs<CashMovement>(
      `SELECT doc FROM cash_movements WHERE doc->>'caixaId' = $1 ORDER BY doc->>'timestamp' COLLATE "C"`,
      [sessionId],
    ),
  ]);
  return { sessionSales, movements };
}

async function summaryOf(session: CashSession) {
  const { sessionSales, movements } = await sessionData(session._id);
  return summarize(session, sessionSales, movements);
}

/** Open session with its summary, or null. */
const findOpenSession = async () =>
  (await docs<CashSession>(`SELECT doc FROM cash_sessions WHERE doc->>'status' = 'aberto' LIMIT 1`))[0];

export async function getOpenSession() {
  const open = await findOpenSession();
  return open ? summaryOf(open) : null;
}

export async function getSessionDetail(id: string) {
  const session = await findById<CashSession>("cash_sessions", id);
  if (!session) throw new HttpError(404, "Caixa não encontrado");
  const { sessionSales, movements } = await sessionData(id);
  return { ...summarize(session, sessionSales, movements), sales: sessionSales, movements };
}

export async function listSessionSummaries(filters: { start?: string; end?: string; status?: CashSession["status"] }) {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  const { from, to } = dayBounds(filters.start, filters.end);
  const sessions = await docs<CashSession>(
    `SELECT doc FROM cash_sessions
     WHERE doc @> $1::jsonb AND doc->>'openedAt' COLLATE "C" BETWEEN $2 AND $3
     ORDER BY doc->>'openedAt' COLLATE "C" DESC`,
    [json(query), from, to],
  );
  const ids = sessions.map((s) => s._id);
  const [saleList, moveList] = await Promise.all([
    docs<Sale>("SELECT doc FROM sales WHERE doc->>'caixaId' = ANY($1)", [ids]),
    docs<CashMovement>("SELECT doc FROM cash_movements WHERE doc->>'caixaId' = ANY($1)", [ids]),
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
  if (await findOpenSession()) {
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
  await insert("cash_sessions", session);
  return session;
}

export async function addCashMovement(
  sessionId: string,
  input: { type: CashMovement["type"]; amount: number; reason: string },
  userName: string,
) {
  const session = await findById<CashSession>("cash_sessions", sessionId);
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
  await insert("cash_movements", movement);
  return movement;
}

export async function closeCashSession(id: string, input: { counted: CountedByMethod; notes?: string }) {
  const session = await findById<CashSession>("cash_sessions", id);
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
  await replace("cash_sessions", closed);
  return summaryOf(closed);
}

// Sales (POS), quotes and cancellations.
// Finalizing a sale: requires an open cash session, checks stock, takes stock out (VENDA)
// and, for "Crediário", creates a receivable due in 30 days.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, json, merge, nextSequence, query, replace } from "../db.ts";
import { round2, saleAmountsByMethod, saleTotals } from "../lib/calc.ts";
import { dayBounds } from "../lib/dates.ts";
import type { Role } from "../views/auth.ts";
import type { Receivable } from "../views/bill.ts";
import type { CashSession } from "../views/cash-session.ts";
import { DiscountType, PaymentMethod } from "../views/common.ts";
import type { Customer } from "../views/customer.ts";
import type { Product } from "../views/product.ts";
import { type Sale, SaleItem, type SaleStatus, type SplitPayment } from "../views/sale.ts";
import { recordMovement } from "./stock-movement.ts";

const isCustomItem = (item: Pick<SaleItem, "id">) => item.id.startsWith("custom-");

export const PaymentInput = z
  .object({
    method: PaymentMethod,
    amountPaid: z.number().min(0).nullable().optional().meta({ description: "Cash handed by the customer (Dinheiro)" }),
    split: z
      .object({ cash: z.number().positive(), method: PaymentMethod })
      .nullable()
      .optional()
      .meta({ description: "Split payment: part in cash + the rest with `method` (PIX, card or boleto)" }),
  })
  .meta({ id: "PaymentInput" });
export type PaymentInput = z.infer<typeof PaymentInput>;

export const CreateSaleInput = z
  .object({
    items: z.array(SaleItem).min(1, "A venda precisa ter ao menos um item."),
    globalDiscount: z.number().min(0).default(0),
    globalDiscountType: DiscountType.default("percent"),
    status: z.enum(["FINALIZED", "QUOTE"]),
    payment: PaymentInput.optional().meta({ description: "Required when status is FINALIZED" }),
    customerId: z.string().nullable().optional(),
  })
  .meta({ id: "CreateSaleInput" });
export type CreateSaleInput = z.infer<typeof CreateSaleInput>;

export interface SaleFilters {
  start?: string;
  end?: string;
  status?: SaleStatus;
  paymentMethod?: PaymentMethod;
  search?: string;
}

export async function listSales(filters: SaleFilters) {
  const filter: Record<string, unknown> = {};
  if (filters.status) filter.status = filters.status;
  const { from, to } = dayBounds(filters.start, filters.end);
  const term = filters.search?.trim().toLowerCase().replace(/^#/, "") ?? "";
  const list = await docs<Sale>(
    `SELECT doc FROM sales WHERE doc @> $1::jsonb AND doc->>'createdAt' COLLATE "C" BETWEEN $2 AND $3
     ORDER BY doc->>'createdAt' COLLATE "C" DESC`,
    [json(filter), from, to],
  );
  return list.filter((sale) => {
    if (filters.paymentMethod) {
      if (sale.status === "QUOTE") return false;
      if (!(filters.paymentMethod in saleAmountsByMethod(sale))) return false;
    }
    if (term) {
      const haystack = [String(sale.saleNumber), sale.customerName ?? "", sale.userName].join(" ").toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export async function getSale(id: string) {
  const sale = await findById<Sale>("sales", id);
  if (!sale) throw new HttpError(404, "Venda não encontrada");
  return sale;
}

async function resolveCustomer(customerId?: string | null) {
  if (!customerId) return null;
  const customer = await findById<Customer>("customers", customerId);
  if (!customer) throw new HttpError(404, "Cliente não encontrado");
  return customer;
}

async function requireOpenCashSession() {
  const [open] = await docs<CashSession>(`SELECT doc FROM cash_sessions WHERE doc->>'status' = 'aberto' LIMIT 1`);
  if (!open) throw new HttpError(409, "Nenhum caixa aberto. Abra o caixa para finalizar vendas.");
  return open;
}

/** Checks the stock balance adding up the demand of each product. */
async function checkStock(items: SaleItem[]) {
  const demand = new Map<string, number>();
  for (const item of items) {
    if (!isCustomItem(item)) demand.set(item.id, (demand.get(item.id) ?? 0) + item.qty);
  }
  for (const [id, qty] of demand) {
    const product = await findById<Product>("products", id);
    if (!product) throw new HttpError(404, "Produto não encontrado no estoque.");
    if (product.quantity < qty) {
      throw new HttpError(
        409,
        `Estoque insuficiente para "${product.name}": disponível ${product.quantity}, solicitado ${qty}.`,
      );
    }
  }
  return demand;
}

async function takeStock(demand: Map<string, number>, saleNumber: number, userName: string) {
  for (const [productId, qty] of demand) {
    await recordMovement(productId, "VENDA", -qty, { reference: `Venda #${saleNumber}`, userName });
  }
}

function resolvePayment(total: number, payment: PaymentInput | undefined, customer: Customer | null) {
  if (!payment) throw new HttpError(400, "Informe a forma de pagamento.");
  if (payment.split) {
    const cash = round2(payment.split.cash);
    if (payment.split.method === "Dinheiro" || payment.split.method === "Crediário") {
      throw new HttpError(400, "No pagamento dividido, o restante deve ser PIX, cartão ou boleto.");
    }
    if (cash >= total) throw new HttpError(400, "A parte em dinheiro deve ser maior que zero e menor que o total.");
    const splitPayment: SplitPayment = { cash, method: payment.split.method, rest: round2(total - cash) };
    return { paymentMethod: payment.split.method, splitPayment, amountPaid: null, change: null };
  }
  if (payment.method === "Crediário" && !customer) {
    throw new HttpError(400, "Selecione um cliente para vender no crediário.");
  }
  if (payment.method === "Dinheiro") {
    const paid = round2(payment.amountPaid ?? total);
    if (paid < total) throw new HttpError(400, "Valor recebido menor que o total da venda.");
    return { paymentMethod: payment.method, splitPayment: null, amountPaid: paid, change: round2(paid - total) };
  }
  return { paymentMethod: payment.method, splitPayment: null, amountPaid: null, change: null };
}

async function createCreditReceivable(sale: Sale, customer: Customer) {
  const due = new Date();
  due.setDate(due.getDate() + 30);
  await insert<Receivable>("accounts_receivable", {
    _id: randomUUID(),
    description: `Crediário - venda ${sale.saleNumber}`,
    customerId: customer._id,
    customerName: customer.name,
    category: "Crediário",
    amount: sale.total,
    dueDate: due.toISOString(),
    documentNumber: `VND-${sale.saleNumber}`,
    saleId: sale._id,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
}

export async function createSale(input: CreateSaleInput, userName: string) {
  const customer = await resolveCustomer(input.customerId);
  const totals = saleTotals(input.items, input.globalDiscount, input.globalDiscountType);
  const base = {
    _id: randomUUID(),
    items: input.items,
    grossSubtotal: totals.grossSubtotal,
    itemsDiscountTotal: totals.itemsDiscountTotal,
    globalDiscount: input.globalDiscount,
    globalDiscountType: input.globalDiscountType,
    globalDiscountAmount: totals.globalDiscountAmount,
    totalDiscount: totals.totalDiscount,
    total: totals.total,
    customerId: customer?._id ?? null,
    customerName: customer?.name ?? null,
    userName,
    createdAt: new Date().toISOString(),
  };

  if (input.status === "QUOTE") {
    const quote: Sale = {
      ...base,
      saleNumber: await nextSequence("sales"),
      status: "QUOTE",
      paymentMethod: input.payment?.method ?? "Dinheiro",
      splitPayment: null,
      amountPaid: null,
      change: null,
      caixaId: null,
    };
    await insert("sales", quote);
    return quote;
  }

  const session = await requireOpenCashSession();
  const demand = await checkStock(input.items);
  const payment = resolvePayment(totals.total, input.payment, customer);
  const sale: Sale = {
    ...base,
    ...payment,
    saleNumber: await nextSequence("sales"),
    status: "FINALIZED",
    caixaId: session._id,
  };
  await insert("sales", sale);
  await takeStock(demand, sale.saleNumber, userName);
  if (sale.paymentMethod === "Crediário" && customer) await createCreditReceivable(sale, customer);
  return sale;
}

/** Turns a quote into a finalized sale (cash session and stock are checked now). */
export async function convertQuote(id: string, payment: PaymentInput, userName: string) {
  const quote = await findById<Sale>("sales", id);
  if (!quote) throw new HttpError(404, "Orçamento não encontrado");
  if (quote.status !== "QUOTE") throw new HttpError(400, "Somente orçamentos podem ser convertidos.");
  const session = await requireOpenCashSession();
  const customer = await resolveCustomer(quote.customerId);
  const demand = await checkStock(quote.items);
  const resolved = resolvePayment(quote.total, payment, customer);
  const sale: Sale = {
    ...quote,
    ...resolved,
    status: "FINALIZED",
    caixaId: session._id,
    userName,
    createdAt: new Date().toISOString(),
  };
  await replace("sales", sale);
  await takeStock(demand, sale.saleNumber, userName);
  if (sale.paymentMethod === "Crediário" && customer) await createCreditReceivable(sale, customer);
  return sale;
}

/** Cancels a sale: returns the stock (ESTORNO) and cancels the linked pending receivable. */
export async function cancelSale(id: string, reason: string, user: { name: string; role: Role }) {
  const sale = await getSale(id);
  if (sale.status === "CANCELLED") throw new HttpError(400, "Esta venda já está cancelada.");

  if (sale.status === "FINALIZED") {
    for (const item of sale.items) {
      if (isCustomItem(item) || !(await findById("products", item.id))) continue;
      await recordMovement(item.id, "ESTORNO", item.qty, {
        reason: `Cancelamento: ${reason}`,
        reference: `Venda #${sale.saleNumber}`,
        userName: user.name,
      });
    }
    await query(
      `UPDATE accounts_receivable SET doc = doc || $2::jsonb WHERE doc->>'saleId' = $1 AND doc->>'status' = 'pending'`,
      [sale._id, json({ status: "cancelled", notes: `Venda #${sale.saleNumber} cancelada` })],
    );
  }

  return (await merge<Sale>("sales", id, { status: "CANCELLED", cancelledAt: new Date().toISOString(), cancelReason: reason }))!;
}

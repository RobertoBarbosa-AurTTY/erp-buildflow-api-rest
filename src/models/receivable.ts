// Accounts receivable. Same rules as payables: installments share `installmentGroupId`
// and receiving a recurring bill creates the next month's occurrence.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, query, removeById, replace } from "../db.ts";
import { round2 } from "../lib/calc.ts";
import { addMonths } from "../lib/dates.ts";
import { installmentCount, installmentDescription, installmentDueDates, splitInstallments } from "../lib/installments.ts";
import type { Receivable } from "../views/bill.ts";
import type { Customer } from "../views/customer.ts";
import type { SettleInput } from "./payable.ts";

export const RECEIVABLE_CATEGORIES = ["Vendas a prazo", "Crediário", "Serviços", "Outros"];

export const ReceivableInput = z
  .object({
    description: z.string().trim().min(1, "Descrição é obrigatória"),
    customerId: z.string().optional().meta({ description: "Registered customer. When set, `customerName` comes from it" }),
    customerName: z.string().trim().default("").meta({ description: "Required when there is no customerId" }),
    category: z.string().default("Outros").meta({ examples: RECEIVABLE_CATEGORIES }),
    amount: z.number().positive("Valor inválido").meta({ description: "Total amount (split when installments > 1)" }),
    dueDate: z.string().min(1, "Data de vencimento é obrigatória").meta({ description: "ISO date (first due date)" }),
    documentNumber: z.string().optional(),
    notes: z.string().optional(),
    recurring: z.boolean().optional(),
    installments: z.number().int().min(1).max(48).optional().meta({ description: "1 to 48. Ignored on update" }),
  })
  .meta({ id: "ReceivableInput" });
export type ReceivableInput = z.infer<typeof ReceivableInput>;

const clean = (value: string | undefined) => value?.trim() || undefined;

export async function listReceivables() {
  return docs<Receivable>(
    `SELECT doc FROM accounts_receivable
     ORDER BY doc->>'dueDate' COLLATE "C", (doc->>'installmentNumber')::int NULLS FIRST`,
  );
}

async function getReceivable(id: string) {
  const bill = await findById<Receivable>("accounts_receivable", id);
  if (!bill) throw new HttpError(404, "Conta não encontrada");
  return bill;
}

async function resolveCustomer(input: ReceivableInput) {
  if (input.customerId) {
    const customer = await findById<Customer>("customers", input.customerId);
    if (!customer) throw new HttpError(404, "Cliente não encontrado");
    return { customerId: customer._id, customerName: customer.name };
  }
  if (!input.customerName) throw new HttpError(400, "Informe o cliente");
  return { customerId: undefined, customerName: input.customerName };
}

export async function createReceivable(input: ReceivableInput) {
  const base = {
    ...(await resolveCustomer(input)),
    description: input.description,
    category: input.category || "Outros",
    documentNumber: clean(input.documentNumber),
    notes: clean(input.notes),
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
  const count = installmentCount(input.installments);
  let bills: Receivable[];
  if (count > 1) {
    const groupId = randomUUID();
    const dues = installmentDueDates(input.dueDate, count);
    bills = splitInstallments(input.amount, count).map((amount, i) => ({
      ...base,
      _id: randomUUID(),
      description: installmentDescription(base.description, i + 1, count),
      amount,
      dueDate: dues[i],
      recurring: false,
      installmentGroupId: groupId,
      installmentNumber: i + 1,
      totalInstallments: count,
    }));
  } else {
    bills = [{ ...base, _id: randomUUID(), amount: round2(input.amount), dueDate: input.dueDate, recurring: Boolean(input.recurring) }];
  }
  await insert("accounts_receivable", bills);
  return bills;
}

export async function updateReceivable(id: string, input: ReceivableInput) {
  const existing = await getReceivable(id);
  if (existing.status === "paid" || existing.status === "cancelled") {
    throw new HttpError(400, "Contas recebidas ou canceladas não podem ser editadas");
  }
  const bill: Receivable = {
    ...existing,
    ...(await resolveCustomer(input)),
    description: input.description,
    category: input.category || "Outros",
    amount: round2(input.amount),
    dueDate: input.dueDate,
    documentNumber: clean(input.documentNumber),
    notes: clean(input.notes),
    recurring: existing.installmentGroupId ? false : Boolean(input.recurring),
  };
  await replace("accounts_receivable", bill);
  return bill;
}

export async function receiveReceivable(id: string, input: SettleInput) {
  const existing = await getReceivable(id);
  if (existing.status === "paid") throw new HttpError(400, "Esta conta já foi recebida");
  if (existing.status === "cancelled") throw new HttpError(400, "Conta cancelada não pode ser recebida");
  const received: Receivable = { ...existing, status: "paid", receivedDate: input.date, paymentMethod: input.paymentMethod };
  await replace("accounts_receivable", received);
  let next: Receivable | null = null;
  if (existing.recurring) {
    const { receivedDate: _r, paymentMethod: _m, ...template } = existing;
    next = {
      ...template,
      _id: randomUUID(),
      dueDate: addMonths(new Date(existing.dueDate), 1).toISOString(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await insert("accounts_receivable", next);
  }
  return { received, next };
}

export async function cancelReceivable(id: string) {
  const existing = await getReceivable(id);
  if (existing.status === "paid") throw new HttpError(400, "Contas recebidas não podem ser canceladas");
  const cancelled: Receivable = { ...existing, status: "cancelled" };
  await replace("accounts_receivable", cancelled);
  return cancelled;
}

export async function deleteReceivable(id: string) {
  if (!(await removeById("accounts_receivable", id))) throw new HttpError(404, "Conta não encontrada");
}

/** Deletes the open/cancelled installments of a group. Received ones stay in the history. */
export async function deleteReceivableGroup(groupId: string) {
  const { rowCount } = await query(
    `DELETE FROM accounts_receivable WHERE doc->>'installmentGroupId' = $1 AND doc->>'status' IS DISTINCT FROM 'paid'`,
    [groupId],
  );
  return { deleted: rowCount ?? 0 };
}

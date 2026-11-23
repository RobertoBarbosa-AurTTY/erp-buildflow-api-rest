// Accounts payable. Installments create N bills sharing `installmentGroupId` (monthly due dates).
// Paying a recurring bill creates the next month's occurrence.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { collection } from "../db.ts";
import { round2 } from "../lib/calc.ts";
import { addMonths } from "../lib/dates.ts";
import { installmentCount, installmentDescription, installmentDueDates, splitInstallments } from "../lib/installments.ts";
import type { Payable } from "../views/bill.ts";
import { PaymentMethod } from "../views/common.ts";

const payables = () => collection<Payable>("accounts_payable");

export const PAYABLE_CATEGORIES = [
  "Fornecedores", "Aluguel", "Utilidades", "Impostos", "Pessoal", "Serviços", "Manutenção", "Seguros", "Outros",
];

export const PayableInput = z
  .object({
    description: z.string().trim().min(1, "Descrição é obrigatória"),
    supplier: z.string().trim().default(""),
    category: z.string().default("Outros").meta({ examples: PAYABLE_CATEGORIES }),
    amount: z.number().positive("Valor inválido").meta({ description: "Total amount (split when installments > 1)" }),
    dueDate: z.string().min(1, "Data de vencimento é obrigatória").meta({ description: "ISO date (first due date)" }),
    documentNumber: z.string().optional(),
    barcode: z.string().optional(),
    notes: z.string().optional(),
    recurring: z.boolean().optional(),
    installments: z.number().int().min(1).max(48).optional().meta({ description: "1 to 48. Ignored on update" }),
  })
  .meta({ id: "PayableInput" });
export type PayableInput = z.infer<typeof PayableInput>;

export const SettleInput = z
  .object({ date: z.string().min(1).meta({ description: "ISO date of payment" }), paymentMethod: PaymentMethod })
  .meta({ id: "SettleInput" });
export type SettleInput = z.infer<typeof SettleInput>;

const clean = (value: string | undefined) => value?.trim() || undefined;

export async function listPayables() {
  return payables().find().sort({ dueDate: 1, installmentNumber: 1 }).toArray();
}

async function getPayable(id: string) {
  const bill = await payables().findOne({ _id: id });
  if (!bill) throw new HttpError(404, "Conta não encontrada");
  return bill;
}

export async function createPayable(input: PayableInput) {
  const base = {
    description: input.description,
    supplier: input.supplier,
    category: input.category || "Outros",
    documentNumber: clean(input.documentNumber),
    barcode: clean(input.barcode),
    notes: clean(input.notes),
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
  const count = installmentCount(input.installments);
  let bills: Payable[];
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
  await payables().insertMany(bills);
  return bills;
}

export async function updatePayable(id: string, input: PayableInput) {
  const existing = await getPayable(id);
  if (existing.status === "paid" || existing.status === "cancelled") {
    throw new HttpError(400, "Contas pagas ou canceladas não podem ser editadas");
  }
  const bill: Payable = {
    ...existing,
    description: input.description,
    supplier: input.supplier,
    category: input.category || "Outros",
    amount: round2(input.amount),
    dueDate: input.dueDate,
    documentNumber: clean(input.documentNumber),
    barcode: clean(input.barcode),
    notes: clean(input.notes),
    recurring: existing.installmentGroupId ? false : Boolean(input.recurring),
  };
  await payables().replaceOne({ _id: id }, bill);
  return bill;
}

export async function payPayable(id: string, input: SettleInput) {
  const existing = await getPayable(id);
  if (existing.status === "paid") throw new HttpError(400, "Esta conta já está paga");
  if (existing.status === "cancelled") throw new HttpError(400, "Conta cancelada não pode ser paga");
  const paid: Payable = { ...existing, status: "paid", paidDate: input.date, paymentMethod: input.paymentMethod };
  await payables().replaceOne({ _id: id }, paid);
  let next: Payable | null = null;
  if (existing.recurring) {
    const { paidDate: _p, paymentMethod: _m, ...template } = existing;
    next = {
      ...template,
      _id: randomUUID(),
      dueDate: addMonths(new Date(existing.dueDate), 1).toISOString(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await payables().insertOne(next);
  }
  return { paid, next };
}

export async function cancelPayable(id: string) {
  const existing = await getPayable(id);
  if (existing.status === "paid") throw new HttpError(400, "Contas pagas não podem ser canceladas");
  const cancelled: Payable = { ...existing, status: "cancelled" };
  await payables().replaceOne({ _id: id }, cancelled);
  return cancelled;
}

export async function deletePayable(id: string) {
  const { deletedCount } = await payables().deleteOne({ _id: id });
  if (!deletedCount) throw new HttpError(404, "Conta não encontrada");
}

/** Deletes the open/cancelled installments of a group. Paid ones stay in the history. */
export async function deletePayableGroup(groupId: string) {
  const { deletedCount } = await payables().deleteMany({ installmentGroupId: groupId, status: { $ne: "paid" } });
  return { deleted: deletedCount };
}

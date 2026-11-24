// Customers. Name required; e-mail and CPF/CNPJ unique; CPF/CNPJ check digits validated.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, json, removeById, replace } from "../db.ts";
import { billStatus } from "../lib/calc.ts";
import { byName, documentError, isValidEmail, normalize, onlyDigits } from "../lib/text.ts";
import type { Receivable } from "../views/bill.ts";
import type { Customer, CustomerStats } from "../views/customer.ts";
import type { Sale } from "../views/sale.ts";

export const CustomerInput = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório"),
    cpfCnpj: z.string().optional().meta({ description: "CPF or CNPJ, with or without mask" }),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    active: z.boolean().optional(),
  })
  .meta({ id: "CustomerInput" });
export type CustomerInput = z.infer<typeof CustomerInput>;

export async function listCustomers(search?: string, activeOnly?: boolean) {
  const term = normalize(search);
  const digits = onlyDigits(search);
  const list = await docs<Customer>("SELECT doc FROM customers WHERE doc @> $1::jsonb", [json(activeOnly ? { active: true } : {})]);
  return list
    .filter((c) => {
      if (!term) return true;
      if (normalize(c.name).includes(term) || normalize(c.email).includes(term)) return true;
      return digits.length >= 3 && (onlyDigits(c.cpfCnpj).includes(digits) || onlyDigits(c.phone).includes(digits));
    })
    .sort(byName);
}

const emptyStats = (): CustomerStats => ({
  totalSpent: 0,
  purchaseCount: 0,
  lastPurchase: null,
  openReceivables: 0,
  overdueReceivables: 0,
});

/** Totals by customer: finalized purchases and open receivables. */
export async function getCustomerStats(customerId?: string) {
  // one customer, or every sale/bill with a customer
  const where = "($1::text IS NULL OR doc->>'customerId' = $1) AND coalesce(doc->>'customerId', '') <> ''";
  const [saleList, billList] = await Promise.all([
    docs<Sale>(`SELECT doc FROM sales WHERE ${where} AND doc->>'status' = 'FINALIZED'`, [customerId ?? null]),
    docs<Receivable>(`SELECT doc FROM accounts_receivable WHERE ${where} AND doc->>'status' = 'pending'`, [customerId ?? null]),
  ]);
  const stats: Record<string, CustomerStats> = {};
  for (const sale of saleList) {
    const s = (stats[sale.customerId!] ??= emptyStats());
    s.totalSpent += sale.total;
    s.purchaseCount += 1;
    if (!s.lastPurchase || sale.createdAt > s.lastPurchase) s.lastPurchase = sale.createdAt;
  }
  for (const bill of billList) {
    const s = (stats[bill.customerId!] ??= emptyStats());
    s.openReceivables += bill.amount;
    if (billStatus(bill) === "overdue") s.overdueReceivables += bill.amount;
  }
  return stats;
}

export async function getCustomerDetail(id: string) {
  const customer = await findById<Customer>("customers", id);
  if (!customer) throw new HttpError(404, "Cliente não encontrado");
  const [history, open, stats] = await Promise.all([
    docs<Sale>(`SELECT doc FROM sales WHERE doc->>'customerId' = $1 ORDER BY doc->>'createdAt' COLLATE "C" DESC`, [id]),
    docs<Receivable>(
      `SELECT doc FROM accounts_receivable WHERE doc->>'customerId' = $1 AND doc->>'status' = 'pending'
       ORDER BY doc->>'dueDate' COLLATE "C"`,
      [id],
    ),
    getCustomerStats(id),
  ]);
  return { customer, stats: stats[id] ?? emptyStats(), sales: history, receivables: open };
}

async function normalizeInput(input: CustomerInput, existing?: Customer) {
  const cpfCnpj = onlyDigits(input.cpfCnpj);
  // An old invalid document does not block editing other fields.
  if (cpfCnpj !== onlyDigits(existing?.cpfCnpj)) {
    const error = documentError(cpfCnpj);
    if (error) throw new HttpError(400, error);
  }
  const email = input.email?.trim().toLowerCase() || undefined;
  if (email && !isValidEmail(email)) throw new HttpError(400, "E-mail inválido");
  const others = (await docs<Customer>("SELECT doc FROM customers")).filter((c) => c._id !== existing?._id);
  if (email && others.some((c) => c.email === email)) throw new HttpError(409, "Já existe um cliente com esse e-mail");
  if (cpfCnpj && others.some((c) => onlyDigits(c.cpfCnpj) === cpfCnpj)) {
    throw new HttpError(409, "Já existe um cliente com esse CPF/CNPJ");
  }
  return {
    name: input.name,
    cpfCnpj: cpfCnpj || undefined,
    email,
    phone: onlyDigits(input.phone) || undefined,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    active: input.active ?? existing?.active ?? true,
  };
}

export async function createCustomer(input: CustomerInput) {
  const customer: Customer = { _id: randomUUID(), ...(await normalizeInput(input)), createdAt: new Date().toISOString() };
  await insert("customers", customer);
  return customer;
}

/** Full replace: empty optional fields are removed. */
export async function updateCustomer(id: string, input: CustomerInput) {
  const existing = await findById<Customer>("customers", id);
  if (!existing) throw new HttpError(404, "Cliente não encontrado");
  const customer: Customer = { _id: id, createdAt: existing.createdAt, ...(await normalizeInput(input, existing)) };
  await replace("customers", customer);
  return customer;
}

export async function deleteCustomer(id: string) {
  if (!(await findById("customers", id))) throw new HttpError(404, "Cliente não encontrado");
  const open = await docs(
    "SELECT doc FROM accounts_receivable WHERE doc->>'customerId' = $1 AND doc->>'status' = 'pending' LIMIT 1",
    [id],
  );
  if (open.length) {
    throw new HttpError(409, "Cliente possui contas a receber em aberto e não pode ser excluído");
  }
  await removeById("customers", id);
}

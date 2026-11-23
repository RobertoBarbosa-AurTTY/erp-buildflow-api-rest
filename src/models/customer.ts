// Customers. Name required; e-mail and CPF/CNPJ unique; CPF/CNPJ check digits validated.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { collection } from "../db.ts";
import { billStatus } from "../lib/calc.ts";
import { byName, documentError, isValidEmail, normalize, onlyDigits } from "../lib/text.ts";
import type { Receivable } from "../views/bill.ts";
import type { Customer, CustomerStats } from "../views/customer.ts";
import type { Sale } from "../views/sale.ts";

const customers = () => collection<Customer>("customers");
const receivables = () => collection<Receivable>("accounts_receivable");
const sales = () => collection<Sale>("sales");

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
  const list = await customers().find(activeOnly ? { active: true } : {}).toArray();
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
  const filter: Record<string, unknown> = customerId ? { customerId } : { customerId: { $nin: [null, ""] } };
  const [saleList, billList] = await Promise.all([
    sales().find({ ...filter, status: "FINALIZED" }, { projection: { customerId: 1, total: 1, createdAt: 1 } }).toArray(),
    receivables().find({ ...filter, status: "pending" }).toArray(),
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
  const customer = await customers().findOne({ _id: id });
  if (!customer) throw new HttpError(404, "Cliente não encontrado");
  const [history, open, stats] = await Promise.all([
    sales().find({ customerId: id }).sort({ createdAt: -1 }).toArray(),
    receivables().find({ customerId: id, status: "pending" }).sort({ dueDate: 1 }).toArray(),
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
  const others = (await customers().find().toArray()).filter((c) => c._id !== existing?._id);
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
  await customers().insertOne(customer);
  return customer;
}

/** Full replace: empty optional fields are removed. */
export async function updateCustomer(id: string, input: CustomerInput) {
  const existing = await customers().findOne({ _id: id });
  if (!existing) throw new HttpError(404, "Cliente não encontrado");
  const customer: Customer = { _id: id, createdAt: existing.createdAt, ...(await normalizeInput(input, existing)) };
  await customers().replaceOne({ _id: id }, customer);
  return customer;
}

export async function deleteCustomer(id: string) {
  if (!(await customers().findOne({ _id: id }))) throw new HttpError(404, "Cliente não encontrado");
  if (await receivables().findOne({ customerId: id, status: "pending" })) {
    throw new HttpError(409, "Cliente possui contas a receber em aberto e não pode ser excluído");
  }
  await customers().deleteOne({ _id: id });
}

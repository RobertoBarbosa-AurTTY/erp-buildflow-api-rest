import { z } from "zod";
import { Id, IsoDate, Money } from "./common.ts";
import { Receivable } from "./bill.ts";
import { Sale } from "./sale.ts";

export const Customer = z
  .object({
    _id: Id,
    name: z.string().meta({ examples: ["Construtora Horizonte Ltda"] }),
    cpfCnpj: z.string().optional().meta({ description: "Digits only (11 = CPF, 14 = CNPJ)" }),
    email: z.string().optional(),
    phone: z.string().optional().meta({ description: "Digits only" }),
    address: z.string().optional(),
    notes: z.string().optional(),
    active: z.boolean(),
    createdAt: IsoDate,
  })
  .meta({ id: "Customer" });
export type Customer = z.infer<typeof Customer>;

export const CustomerStats = z
  .object({
    totalSpent: Money,
    purchaseCount: z.number(),
    lastPurchase: IsoDate.nullable(),
    openReceivables: Money,
    overdueReceivables: Money,
  })
  .meta({ id: "CustomerStats" });
export type CustomerStats = z.infer<typeof CustomerStats>;

export const CustomerStatsMap = z
  .record(z.string(), CustomerStats)
  .meta({ description: "Stats by customer id (only customers with purchases or open bills)" });

export const CustomerDetail = z
  .object({
    customer: Customer,
    stats: CustomerStats,
    sales: z.array(Sale).meta({ description: "All sales, newest first" }),
    receivables: z.array(Receivable).meta({ description: "Pending receivables, by due date" }),
  })
  .meta({ id: "CustomerDetail" });

// Accounts payable and receivable.
import { z } from "zod";
import { BillStatus, Id, IsoDate, Money, PaymentMethod } from "./common.ts";

const BillBase = z.object({
  _id: Id,
  description: z.string(),
  category: z.string(),
  amount: Money,
  dueDate: IsoDate,
  paymentMethod: PaymentMethod.optional(),
  documentNumber: z.string().optional(),
  status: BillStatus,
  recurring: z.boolean().optional().meta({ description: "Settling it creates the next month's bill" }),
  notes: z.string().optional(),
  installmentGroupId: z.string().optional().meta({ description: "Shared by all installments of the same purchase" }),
  installmentNumber: z.number().optional(),
  totalInstallments: z.number().optional(),
  createdAt: IsoDate,
});

export const Payable = BillBase.extend({
  supplier: z.string(),
  paidDate: IsoDate.optional(),
  barcode: z.string().optional().meta({ description: "Boleto barcode" }),
}).meta({ id: "Payable" });
export type Payable = z.infer<typeof Payable>;

export const Receivable = BillBase.extend({
  customerId: Id.optional(),
  customerName: z.string(),
  receivedDate: IsoDate.optional(),
  saleId: Id.optional().meta({ description: "Sale that created it (Crediário)" }),
}).meta({ id: "Receivable" });
export type Receivable = z.infer<typeof Receivable>;

export const PayResult = z
  .object({ paid: Payable, next: Payable.nullable().meta({ description: "Next occurrence when the bill is recurring" }) })
  .meta({ id: "PayResult" });

export const ReceiveResult = z
  .object({ received: Receivable, next: Receivable.nullable().meta({ description: "Next occurrence when the bill is recurring" }) })
  .meta({ id: "ReceiveResult" });

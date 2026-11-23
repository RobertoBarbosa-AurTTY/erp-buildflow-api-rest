import { z } from "zod";
import { PaymentMethod } from "./common.ts";

export const CompanySettings = z
  .object({
    companyName: z.string().meta({ description: "Legal name (razão social)" }),
    tradeName: z.string().meta({ description: "Trade name (nome fantasia)" }),
    cnpj: z.string().meta({ description: "Digits only" }),
    stateRegistration: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    receiptFooter: z.string().optional(),
    lowStockAlert: z.boolean(),
    expiryAlertDays: z.number().int().min(0).max(365),
    defaultPaymentMethod: PaymentMethod,
  })
  .meta({ id: "CompanySettings" });
export type CompanySettings = z.infer<typeof CompanySettings>;

export const DataExport = z
  .object({
    app: z.string(),
    version: z.number(),
    exportedAt: z.string(),
    data: z.record(z.string(), z.array(z.unknown())).meta({ description: "Documents by collection" }),
  })
  .meta({ id: "DataExport" });

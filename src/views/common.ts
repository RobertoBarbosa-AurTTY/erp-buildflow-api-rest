// Shared building blocks of the JSON representations.
import { z } from "zod";

export const Id = z.string().meta({ description: "Document id", examples: ["p1"] });

export const IsoDate = z.string().meta({ description: "ISO 8601 date-time", examples: ["2026-11-23T13:00:00.000Z"] });

export const DayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD")
  .meta({ description: "Day in the store time zone (YYYY-MM-DD)", examples: ["2026-11-23"] });

export const Money = z.number().meta({ description: "Amount in BRL", examples: [35.9] });

export const PaymentMethod = z
  .enum(["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Crediário"])
  .meta({ id: "PaymentMethod", description: "Payment method (Portuguese labels used by the front-end)" });
export type PaymentMethod = z.infer<typeof PaymentMethod>;
export const PAYMENT_METHODS = PaymentMethod.options;

export const DiscountType = z
  .enum(["percent", "value"])
  .meta({ id: "DiscountType", description: "`percent` (0-100) or `value` (BRL)" });
export type DiscountType = z.infer<typeof DiscountType>;

export const BillStatus = z
  .enum(["pending", "paid", "overdue", "cancelled"])
  .meta({ id: "BillStatus", description: "`overdue` is computed: pending with due date in the past" });
export type BillStatus = z.infer<typeof BillStatus>;

export const Deleted = z.object({ deleted: z.number().meta({ description: "Number of deleted documents" }) });

/** Query string boolean: accepts "true" / "false". */
export const QueryBoolean = z.enum(["true", "false"]).transform((value) => value === "true");

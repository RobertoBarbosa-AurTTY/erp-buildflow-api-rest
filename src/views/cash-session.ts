import { z } from "zod";
import { Id, IsoDate, Money, PaymentMethod } from "./common.ts";
import { Sale } from "./sale.ts";

const ByMethod = z.record(PaymentMethod, Money).meta({ id: "AmountByMethod", description: "Amount per payment method" });

export const CountedByMethod = z
  .partialRecord(PaymentMethod, z.number().min(0))
  .meta({ id: "CountedByMethod", description: "Amount counted at closing, per payment method (Crediário is ignored)" });
export type CountedByMethod = z.infer<typeof CountedByMethod>;

export const CashSession = z
  .object({
    _id: Id,
    number: z.number(),
    status: z.enum(["aberto", "fechado"]).meta({ description: "aberto: open, fechado: closed" }),
    operatorName: z.string(),
    openedAt: IsoDate,
    closedAt: IsoDate.optional(),
    openingAmount: Money,
    closingAmount: Money.optional().meta({ description: "Cash counted at closing" }),
    countedByMethod: CountedByMethod.optional(),
    notes: z.string().optional(),
  })
  .meta({ id: "CashSession" });
export type CashSession = z.infer<typeof CashSession>;

export const CashMovement = z
  .object({
    _id: Id,
    caixaId: Id.meta({ description: "Cash session id" }),
    type: z.enum(["retirada", "suprimento"]).meta({ description: "retirada: cash out (sangria), suprimento: cash in" }),
    amount: Money,
    reason: z.string(),
    userName: z.string(),
    timestamp: IsoDate,
  })
  .meta({ id: "CashMovement" });
export type CashMovement = z.infer<typeof CashMovement>;

export const CashSummary = z
  .object({
    session: CashSession,
    salesCount: z.number(),
    cancelledCount: z.number(),
    totalSales: Money,
    totalDiscounts: Money,
    byMethod: ByMethod,
    suprimentos: Money.meta({ description: "Total cash in" }),
    retiradas: Money.meta({ description: "Total cash out" }),
    expectedCash: Money.meta({ description: "Opening + cash sales + cash in - cash out" }),
    expectedByMethod: ByMethod,
    counted: Money.nullable().meta({ description: "Total counted (closed sessions)" }),
    difference: Money.nullable().meta({ description: "Counted - expected (positive = surplus)" }),
    durationMs: z.number(),
    longOpen: z.boolean().meta({ description: "Open for more than 24 hours" }),
  })
  .meta({ id: "CashSummary" });
export type CashSummary = z.infer<typeof CashSummary>;

export const CashSessionDetail = CashSummary.extend({
  sales: z.array(Sale),
  movements: z.array(CashMovement),
}).meta({ id: "CashSessionDetail" });

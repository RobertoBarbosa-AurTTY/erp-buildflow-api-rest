import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listSales } from "../../models/sale.ts";
import { DayKey, PaymentMethod } from "../../views/common.ts";
import { Sale, SaleStatus } from "../../views/sale.ts";

export default defineRoute({
  summary: "List sales",
  description:
    "Newest first. `paymentMethod` also matches split payments and excludes quotes. " +
    "`search` matches the sale number (`#1032`), customer and operator.",
  tags: ["Sales"],
  access: "auth",
  query: z.object({
    start: DayKey.optional(),
    end: DayKey.optional(),
    status: SaleStatus.optional(),
    paymentMethod: PaymentMethod.optional(),
    search: z.string().optional(),
  }),
  response: z.array(Sale),
  handler: ({ query }) => listSales(query),
});

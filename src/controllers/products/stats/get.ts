import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { getStockStats } from "../../../models/product.ts";
import { StockStats } from "../../../views/product.ts";

export default defineRoute({
  summary: "Stock indicators",
  description: "Totals of active products: units, cost and sale value, low/out of stock and expiring soon.",
  tags: ["Products"],
  access: "auth",
  query: z.object({ expiryDays: z.coerce.number().int().min(0).default(30) }),
  response: StockStats,
  handler: ({ query }) => getStockStats(query.expiryDays),
});

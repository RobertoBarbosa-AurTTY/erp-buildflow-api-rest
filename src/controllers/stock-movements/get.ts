import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listMovements } from "../../models/stock-movement.ts";
import { StockMovement, StockMovementType } from "../../views/stock.ts";

export default defineRoute({
  summary: "List stock movements",
  description: "Newest first. Search matches product name, SKU and reference.",
  tags: ["Stock movements"],
  access: "auth",
  query: z.object({
    productId: z.string().optional(),
    type: StockMovementType.optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
  response: z.array(StockMovement),
  handler: ({ query }) => listMovements(query),
});

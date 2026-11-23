import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listProducts } from "../../models/product.ts";
import { QueryBoolean } from "../../views/common.ts";
import { Product, StockStatus } from "../../views/product.ts";

export default defineRoute({
  summary: "List products",
  description: "Sorted by name. Search matches name, SKU, barcode and brand (case and accent insensitive).",
  tags: ["Products"],
  access: "auth",
  query: z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    status: StockStatus.optional(),
    includeInactive: QueryBoolean.optional().meta({ description: "Default false" }),
  }),
  response: z.array(Product),
  handler: ({ query }) => listProducts(query),
});

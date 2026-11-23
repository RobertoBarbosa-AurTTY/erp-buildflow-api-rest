import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { findProductByCode } from "../../../models/product.ts";
import { Product } from "../../../views/product.ts";

export default defineRoute({
  summary: "Find product by SKU or barcode",
  description: "Exact match on an active product. Used by the POS barcode reader.",
  tags: ["Products"],
  access: "auth",
  query: z.object({ code: z.string().min(1).meta({ examples: ["MAT-001"] }) }),
  response: Product,
  errors: [404],
  handler: ({ query }) => findProductByCode(query.code),
});

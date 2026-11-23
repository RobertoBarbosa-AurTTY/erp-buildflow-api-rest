import { defineRoute } from "../../core/route.ts";
import { createProduct, ProductInput } from "../../models/product.ts";
import { Product } from "../../views/product.ts";

export default defineRoute({
  summary: "Create product",
  description: "SKU and barcode must be unique. A positive `quantity` creates an ENTRADA stock movement.",
  tags: ["Products"],
  access: "auth",
  body: ProductInput,
  status: 201,
  response: Product,
  errors: [409],
  handler: ({ body, user }) => createProduct(body, user.name),
});

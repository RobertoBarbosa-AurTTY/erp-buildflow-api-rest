import { defineRoute } from "../../../core/route.ts";
import { getProduct } from "../../../models/product.ts";
import { Product } from "../../../views/product.ts";

export default defineRoute({
  summary: "Get product",
  tags: ["Products"],
  access: "auth",
  response: Product,
  errors: [404],
  handler: ({ params }) => getProduct(params.id),
});

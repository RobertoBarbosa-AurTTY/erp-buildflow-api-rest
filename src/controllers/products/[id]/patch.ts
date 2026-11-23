import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { ProductPatch, updateProduct } from "../../../models/product.ts";
import { Product } from "../../../views/product.ts";

export default defineRoute({
  summary: "Update product",
  description:
    "Partial update. Send `{ \"active\": false }` to deactivate. " +
    "`quantity` is ignored: use `POST /stock-movements` so the history stays consistent.",
  tags: ["Products"],
  access: "auth",
  params: z.object({ id: z.string() }),
  body: ProductPatch,
  response: Product,
  errors: [404, 409],
  handler: ({ params, body }) => updateProduct(params.id, body),
});

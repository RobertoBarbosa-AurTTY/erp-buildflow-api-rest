import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { assignProductAddress } from "../../../../models/product.ts";
import { Product } from "../../../../views/product.ts";

export default defineRoute({
  summary: "Set product warehouse address",
  description: "Copies the address location to the product. `addressId: null` removes the location.",
  tags: ["Products"],
  access: "auth",
  params: z.object({ id: z.string() }),
  body: z.object({ addressId: z.string().nullable() }),
  response: Product,
  errors: [404],
  handler: ({ params, body }) => assignProductAddress(params.id, body.addressId),
});

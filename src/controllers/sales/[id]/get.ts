import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { getSale } from "../../../models/sale.ts";
import { Sale } from "../../../views/sale.ts";

export default defineRoute({
  summary: "Get sale",
  tags: ["Sales"],
  access: "auth",
  params: z.object({ id: z.string() }),
  response: Sale,
  errors: [404],
  handler: ({ params }) => getSale(params.id),
});

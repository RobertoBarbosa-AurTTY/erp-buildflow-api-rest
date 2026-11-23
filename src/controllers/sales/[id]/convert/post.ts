import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { convertQuote, PaymentInput } from "../../../../models/sale.ts";
import { Sale } from "../../../../views/sale.ts";

export default defineRoute({
  summary: "Convert quote into sale",
  description: "Same rules as finalizing a sale: open cash session, stock and payment are checked now.",
  tags: ["Sales"],
  access: "auth",
  params: z.object({ id: z.string() }),
  body: z.object({ payment: PaymentInput }),
  response: Sale,
  errors: [404, 409],
  handler: ({ params, body, user }) => convertQuote(params.id, body.payment, user.name),
});

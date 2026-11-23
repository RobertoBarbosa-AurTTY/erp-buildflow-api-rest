import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { cancelSale } from "../../../../models/sale.ts";
import { Sale } from "../../../../views/sale.ts";

export default defineRoute({
  summary: "Cancel sale",
  description: "Returns the stock (ESTORNO movements) and cancels the pending Crediário receivable of the sale.",
  tags: ["Sales"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  body: z.object({ reason: z.string().trim().min(3, "Informe o motivo do cancelamento.") }),
  response: Sale,
  errors: [404],
  handler: ({ params, body, user }) => cancelSale(params.id, body.reason, user),
});

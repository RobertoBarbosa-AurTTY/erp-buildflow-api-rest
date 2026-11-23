import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { addCashMovement } from "../../../../models/cash-session.ts";
import { CashMovement } from "../../../../views/cash-session.ts";

export default defineRoute({
  summary: "Cash in / cash out",
  description: "`suprimento` adds cash, `retirada` (sangria) removes it and cannot exceed the expected cash.",
  tags: ["Cash sessions"],
  access: "auth",
  params: z.object({ id: z.string() }),
  body: z.object({
    type: CashMovement.shape.type,
    amount: z.number().positive("Informe um valor maior que zero."),
    reason: z.string().trim().min(1, "Informe o motivo."),
  }),
  status: 201,
  response: CashMovement,
  errors: [409],
  handler: ({ params, body, user }) => addCashMovement(params.id, body, user.name),
});

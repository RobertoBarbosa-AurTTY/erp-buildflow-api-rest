import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { SettleInput } from "../../../../models/payable.ts";
import { payPayable } from "../../../../models/payable.ts";
import { PayResult } from "../../../../views/bill.ts";

export default defineRoute({
  summary: "Pay payable",
  description: "Marks the bill as paid. A recurring bill also creates next month's occurrence (`next`).",
  tags: ["Payables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  body: SettleInput,
  response: PayResult,
  errors: [404],
  handler: ({ params, body }) => payPayable(params.id, body),
});

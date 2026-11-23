import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { ReceivableInput, updateReceivable } from "../../../models/receivable.ts";
import { Receivable } from "../../../views/bill.ts";

export default defineRoute({
  summary: "Update receivable",
  description: "Only pending bills can be edited. `installments` is ignored; installments cannot be recurring.",
  tags: ["Receivables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  body: ReceivableInput,
  response: Receivable,
  errors: [404],
  handler: ({ params, body }) => updateReceivable(params.id, body),
});

import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { PayableInput, updatePayable } from "../../../models/payable.ts";
import { Payable } from "../../../views/bill.ts";

export default defineRoute({
  summary: "Update payable",
  description: "Only pending bills can be edited. `installments` is ignored; installments cannot be recurring.",
  tags: ["Payables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  body: PayableInput,
  response: Payable,
  errors: [404],
  handler: ({ params, body }) => updatePayable(params.id, body),
});

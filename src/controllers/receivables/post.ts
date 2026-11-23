import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { createReceivable, ReceivableInput } from "../../models/receivable.ts";
import { Receivable } from "../../views/bill.ts";

export default defineRoute({
  summary: "Create receivable",
  description:
    "With `installments` > 1 the amount is split (the last one absorbs the cents) into monthly bills " +
    "sharing `installmentGroupId`. Always returns an array.",
  tags: ["Receivables"],
  access: ["Gerente"],
  body: ReceivableInput,
  status: 201,
  response: z.array(Receivable),
  errors: [404],
  handler: ({ body }) => createReceivable(body),
});

import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { createPayable, PayableInput } from "../../models/payable.ts";
import { Payable } from "../../views/bill.ts";

export default defineRoute({
  summary: "Create payable",
  description:
    "With `installments` > 1 the amount is split (the last one absorbs the cents) into monthly bills " +
    "sharing `installmentGroupId`. Always returns an array.",
  tags: ["Payables"],
  access: ["Gerente"],
  body: PayableInput,
  status: 201,
  response: z.array(Payable),
  errors: [404],
  handler: ({ body }) => createPayable(body),
});

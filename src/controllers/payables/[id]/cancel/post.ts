import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { cancelPayable } from "../../../../models/payable.ts";
import { Payable } from "../../../../views/bill.ts";

export default defineRoute({
  summary: "Cancel payable",
  description: "Paid bills cannot be cancelled.",
  tags: ["Payables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  response: Payable,
  errors: [404],
  handler: ({ params }) => cancelPayable(params.id),
});

import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { cancelReceivable } from "../../../../models/receivable.ts";
import { Receivable } from "../../../../views/bill.ts";

export default defineRoute({
  summary: "Cancel receivable",
  description: "Received bills cannot be cancelled.",
  tags: ["Receivables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  response: Receivable,
  errors: [404],
  handler: ({ params }) => cancelReceivable(params.id),
});

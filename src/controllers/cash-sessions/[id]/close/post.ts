import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { closeCashSession } from "../../../../models/cash-session.ts";
import { CashSummary, CountedByMethod } from "../../../../views/cash-session.ts";

export default defineRoute({
  summary: "Close cash session",
  description: "Stores the amount counted per payment method and returns the final summary with the difference.",
  tags: ["Cash sessions"],
  access: "auth",
  params: z.object({ id: z.string() }),
  body: z.object({ counted: CountedByMethod, notes: z.string().optional() }),
  response: CashSummary,
  errors: [409],
  handler: ({ params, body }) => closeCashSession(params.id, body),
});

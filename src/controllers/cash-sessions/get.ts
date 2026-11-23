import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listSessionSummaries } from "../../models/cash-session.ts";
import { CashSession, CashSummary } from "../../views/cash-session.ts";
import { DayKey } from "../../views/common.ts";

export default defineRoute({
  summary: "List cash sessions (audit)",
  description: "Newest first, each with sales by method, cash in/out, expected and counted amounts.",
  tags: ["Cash sessions"],
  access: ["Gerente"],
  query: z.object({
    start: DayKey.optional().meta({ description: "Opening day from" }),
    end: DayKey.optional().meta({ description: "Opening day to" }),
    status: CashSession.shape.status.optional(),
  }),
  response: z.array(CashSummary),
  handler: ({ query }) => listSessionSummaries(query),
});

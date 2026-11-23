import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listReceivings } from "../../models/receiving.ts";
import { ReceivingSummary } from "../../views/stock.ts";

export default defineRoute({
  summary: "List goods receipts",
  description: "ENTRADA movements grouped by invoice reference, newest first.",
  tags: ["Receivings"],
  access: "auth",
  query: z.object({ limit: z.coerce.number().int().positive().default(20) }),
  response: z.array(ReceivingSummary),
  handler: ({ query }) => listReceivings(query.limit),
});

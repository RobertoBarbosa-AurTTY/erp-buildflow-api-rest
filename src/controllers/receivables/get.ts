import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listReceivables } from "../../models/receivable.ts";
import { Receivable } from "../../views/bill.ts";

export default defineRoute({
  summary: "List receivables",
  description: "All bills sorted by due date. Status `overdue` is computed by the client from `dueDate`.",
  tags: ["Receivables"],
  access: "auth",
  response: z.array(Receivable),
  handler: () => listReceivables(),
});

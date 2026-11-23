import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listPayables } from "../../models/payable.ts";
import { Payable } from "../../views/bill.ts";

export default defineRoute({
  summary: "List payables",
  description: "All bills sorted by due date. Status `overdue` is computed by the client from `dueDate`.",
  tags: ["Payables"],
  access: "auth",
  response: z.array(Payable),
  handler: () => listPayables(),
});

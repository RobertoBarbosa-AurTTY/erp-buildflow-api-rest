import { defineRoute } from "../../../core/route.ts";
import { getOpenSession } from "../../../models/cash-session.ts";
import { CashSummary } from "../../../views/cash-session.ts";

export default defineRoute({
  summary: "Current open cash session",
  description: "Summary of the open session, or `null` when the cash register is closed.",
  tags: ["Cash sessions"],
  access: "auth",
  response: CashSummary.nullable(),
  handler: () => getOpenSession(),
});

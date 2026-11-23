import { defineRoute } from "../../core/route.ts";
import { getCashFlow } from "../../models/cash-flow.ts";
import { CashFlow } from "../../views/report.ts";

export default defineRoute({
  summary: "Cash flow",
  description:
    "Last 30 days (realized) and next 30 days (expected), with running balance and monthly DRE. " +
    "Realized inflow: finalized sales (except Crediário) + received receivables. Realized outflow: paid payables. " +
    "Expected: open bills; overdue ones are placed on today.",
  tags: ["Reports"],
  access: ["Gerente"],
  response: CashFlow,
  handler: () => getCashFlow(),
});

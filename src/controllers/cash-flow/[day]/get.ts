import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { getCashFlowDay } from "../../../models/cash-flow.ts";
import { DayKey } from "../../../views/common.ts";
import { CashFlowDayDetail } from "../../../views/report.ts";

export default defineRoute({
  summary: "Cash flow of one day",
  description: "Every inflow and outflow of the day, realized first. Today also lists overdue bills.",
  tags: ["Reports"],
  access: ["Gerente"],
  params: z.object({ day: DayKey }),
  response: CashFlowDayDetail,
  handler: ({ params }) => getCashFlowDay(params.day),
});

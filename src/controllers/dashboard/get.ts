import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { getDashboard } from "../../models/report.ts";
import { Dashboard, DashboardPeriod } from "../../views/report.ts";

export default defineRoute({
  summary: "Dashboard",
  description:
    "Sales indicators of the period compared to the previous equivalent period, series by hour (today) or day, " +
    "top products, stock and expiry alerts, bills due in 7 days and recent sales.",
  tags: ["Reports"],
  access: "auth",
  query: z.object({ period: DashboardPeriod.default("today") }),
  response: Dashboard,
  handler: ({ query }) => getDashboard(query.period),
});

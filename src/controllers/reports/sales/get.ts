import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { HttpError } from "../../../core/http-error.ts";
import { getSalesReport } from "../../../models/report.ts";
import { DayKey } from "../../../views/common.ts";
import { SalesReport } from "../../../views/report.ts";

export default defineRoute({
  summary: "Sales report",
  description: "Summary, daily series, sales, products (ABC curve), categories, payment methods and DRE of the period.",
  tags: ["Reports"],
  access: ["Gerente"],
  query: z.object({ from: DayKey, to: DayKey }),
  response: SalesReport,
  handler: ({ query }) => {
    if (query.from > query.to) throw new HttpError(400, "A data inicial deve ser anterior à final");
    return getSalesReport(query.from, query.to);
  },
});

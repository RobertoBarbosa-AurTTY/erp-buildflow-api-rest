import { defineRoute } from "../../../core/route.ts";
import { getCustomerStats } from "../../../models/customer.ts";
import { CustomerStatsMap } from "../../../views/customer.ts";

export default defineRoute({
  summary: "Customer totals",
  description: "Total spent, purchase count and open/overdue receivables, keyed by customer id.",
  tags: ["Customers"],
  access: "auth",
  response: CustomerStatsMap,
  handler: () => getCustomerStats(),
});

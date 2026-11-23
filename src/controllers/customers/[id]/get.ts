import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { getCustomerDetail } from "../../../models/customer.ts";
import { CustomerDetail } from "../../../views/customer.ts";

export default defineRoute({
  summary: "Get customer with history",
  description: "Customer, totals, all sales and pending receivables.",
  tags: ["Customers"],
  access: "auth",
  params: z.object({ id: z.string() }),
  response: CustomerDetail,
  errors: [404],
  handler: ({ params }) => getCustomerDetail(params.id),
});

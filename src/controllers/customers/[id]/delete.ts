import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { deleteCustomer } from "../../../models/customer.ts";

export default defineRoute({
  summary: "Delete customer",
  description: "Refused (409) when the customer has pending receivables.",
  tags: ["Customers"],
  access: [],
  params: z.object({ id: z.string() }),
  errors: [404, 409],
  handler: ({ params }) => deleteCustomer(params.id),
});

import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { CustomerInput, updateCustomer } from "../../../models/customer.ts";
import { Customer } from "../../../views/customer.ts";

export default defineRoute({
  summary: "Replace customer",
  description: "Full update: optional fields not sent are removed.",
  tags: ["Customers"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  body: CustomerInput,
  response: Customer,
  errors: [404, 409],
  handler: ({ params, body }) => updateCustomer(params.id, body),
});

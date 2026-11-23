import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listCustomers } from "../../models/customer.ts";
import { QueryBoolean } from "../../views/common.ts";
import { Customer } from "../../views/customer.ts";

export default defineRoute({
  summary: "List customers",
  description: "Sorted by name. Search matches name and e-mail; 3+ digits also match CPF/CNPJ and phone.",
  tags: ["Customers"],
  access: "auth",
  query: z.object({
    search: z.string().optional(),
    active: QueryBoolean.optional().meta({ description: "`true` returns only active customers (POS picker)" }),
  }),
  response: z.array(Customer),
  handler: ({ query }) => listCustomers(query.search, query.active),
});

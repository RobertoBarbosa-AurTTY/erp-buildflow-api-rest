import { defineRoute } from "../../core/route.ts";
import { createCustomer, CustomerInput } from "../../models/customer.ts";
import { Customer } from "../../views/customer.ts";

export default defineRoute({
  summary: "Create customer",
  description: "CPF/CNPJ check digits are validated. E-mail and CPF/CNPJ must be unique. Masks are removed.",
  tags: ["Customers"],
  access: ["Gerente"],
  body: CustomerInput,
  status: 201,
  response: Customer,
  errors: [409],
  handler: ({ body }) => createCustomer(body),
});

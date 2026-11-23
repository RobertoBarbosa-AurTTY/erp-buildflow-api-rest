import { defineRoute } from "../../core/route.ts";
import { CreateSaleInput, createSale } from "../../models/sale.ts";
import { Sale } from "../../views/sale.ts";

export default defineRoute({
  summary: "Create sale or quote",
  description: [
    "Totals are computed by the server from the items and discounts.",
    "",
    "- **QUOTE**: saved without touching stock or cash.",
    "- **FINALIZED**: requires an open cash session (409), enough stock (409) and `payment`.",
    "  Takes the stock out (VENDA movements). `Dinheiro` computes the change from `amountPaid`.",
    "  `Crediário` requires a customer and creates a receivable due in 30 days.",
    "  `split` pays part in cash and the rest with PIX, card or boleto.",
  ].join("\n"),
  tags: ["Sales"],
  access: "auth",
  body: CreateSaleInput,
  status: 201,
  response: Sale,
  errors: [404, 409],
  handler: ({ body, user }) => createSale(body, user.name),
});

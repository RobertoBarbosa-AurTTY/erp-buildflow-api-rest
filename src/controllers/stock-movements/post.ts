import { defineRoute } from "../../core/route.ts";
import { AdjustStockInput, adjustStock } from "../../models/stock-movement.ts";
import { StockMovement } from "../../views/stock.ts";

export default defineRoute({
  summary: "Adjust stock",
  description:
    "Manual adjustment with a reason: `add` (ENTRADA), `remove` (SAIDA, cannot exceed the balance) " +
    "or `set` (AJUSTE, inventory count).",
  tags: ["Stock movements"],
  access: "auth",
  body: AdjustStockInput,
  status: 201,
  response: StockMovement,
  errors: [404],
  handler: ({ body, user }) => adjustStock(body, user.name),
});

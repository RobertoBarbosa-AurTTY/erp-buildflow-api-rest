import { defineRoute } from "../../core/route.ts";
import { ReceivingInput, registerReceiving } from "../../models/receiving.ts";
import { ReceivingResult } from "../../views/stock.ts";

export default defineRoute({
  summary: "Register goods receipt",
  description:
    "Adds stock for each item (reference `NF <document>`). Items without `productId` create a new product " +
    "from `newProduct`. With `updateCost`, the product cost and supplier are updated.",
  tags: ["Receivings"],
  access: "auth",
  body: ReceivingInput,
  status: 201,
  response: ReceivingResult,
  errors: [404, 409],
  handler: ({ body, user }) => registerReceiving(body, user.name),
});

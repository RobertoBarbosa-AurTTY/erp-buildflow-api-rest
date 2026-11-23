import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { SettleInput } from "../../../../models/payable.ts";
import { receiveReceivable } from "../../../../models/receivable.ts";
import { ReceiveResult } from "../../../../views/bill.ts";

export default defineRoute({
  summary: "Receive receivable",
  description: "Marks the bill as received. A recurring bill also creates next month's occurrence (`next`).",
  tags: ["Receivables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  body: SettleInput,
  response: ReceiveResult,
  errors: [404],
  handler: ({ params, body }) => receiveReceivable(params.id, body),
});

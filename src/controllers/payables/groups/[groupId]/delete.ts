import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { deletePayableGroup } from "../../../../models/payable.ts";
import { Deleted } from "../../../../views/common.ts";

export default defineRoute({
  summary: "Delete installment group",
  description: "Deletes the open and cancelled installments of the group. Paid ones stay in the history.",
  tags: ["Payables"],
  access: ["Gerente"],
  params: z.object({ groupId: z.string() }),
  response: Deleted,
  handler: ({ params }) => deletePayableGroup(params.groupId),
});

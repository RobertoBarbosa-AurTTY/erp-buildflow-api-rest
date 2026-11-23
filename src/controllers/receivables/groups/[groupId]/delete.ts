import { z } from "zod";
import { defineRoute } from "../../../../core/route.ts";
import { deleteReceivableGroup } from "../../../../models/receivable.ts";
import { Deleted } from "../../../../views/common.ts";

export default defineRoute({
  summary: "Delete installment group",
  description: "Deletes the open and cancelled installments of the group. Received ones stay in the history.",
  tags: ["Receivables"],
  access: ["Gerente"],
  params: z.object({ groupId: z.string() }),
  response: Deleted,
  handler: ({ params }) => deleteReceivableGroup(params.groupId),
});

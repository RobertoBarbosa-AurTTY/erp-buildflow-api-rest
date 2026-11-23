import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { deleteReceivable } from "../../../models/receivable.ts";

export default defineRoute({
  summary: "Delete receivable",
  tags: ["Receivables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  errors: [404],
  handler: ({ params }) => deleteReceivable(params.id),
});

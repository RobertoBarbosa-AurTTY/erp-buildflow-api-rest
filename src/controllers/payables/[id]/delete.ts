import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { deletePayable } from "../../../models/payable.ts";

export default defineRoute({
  summary: "Delete payable",
  tags: ["Payables"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  errors: [404],
  handler: ({ params }) => deletePayable(params.id),
});

import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { getSessionDetail } from "../../../models/cash-session.ts";
import { CashSessionDetail } from "../../../views/cash-session.ts";

export default defineRoute({
  summary: "Get cash session",
  description: "Summary plus the session's sales and cash movements.",
  tags: ["Cash sessions"],
  access: ["Gerente"],
  params: z.object({ id: z.string() }),
  response: CashSessionDetail,
  errors: [404],
  handler: ({ params }) => getSessionDetail(params.id),
});

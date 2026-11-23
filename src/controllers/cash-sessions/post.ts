import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { openCashSession } from "../../models/cash-session.ts";
import { CashSession } from "../../views/cash-session.ts";

export default defineRoute({
  summary: "Open cash session",
  description: "Only one session can be open at a time (409). The logged user is the operator.",
  tags: ["Cash sessions"],
  access: "auth",
  body: z.object({ openingAmount: z.number().min(0).default(0), notes: z.string().optional() }),
  status: 201,
  response: CashSession,
  errors: [409],
  handler: ({ body, user }) => openCashSession(body, user.name),
});

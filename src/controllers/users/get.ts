import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listUsers } from "../../models/user.ts";
import { SessionUser } from "../../views/auth.ts";

export default defineRoute({
  summary: "List users",
  tags: ["Auth"],
  access: "auth",
  response: z.array(SessionUser),
  handler: () => listUsers(),
});

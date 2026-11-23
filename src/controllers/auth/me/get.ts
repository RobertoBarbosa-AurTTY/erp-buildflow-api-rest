import { defineRoute } from "../../../core/route.ts";
import { getUser } from "../../../models/user.ts";
import { SessionUser } from "../../../views/auth.ts";

export default defineRoute({
  summary: "Current user",
  description: "Validates the token and returns the logged user.",
  tags: ["Auth"],
  access: "auth",
  response: SessionUser,
  handler: ({ user }) => getUser(user.id),
});

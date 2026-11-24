import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { login } from "../../../models/user.ts";
import { LoginResult } from "../../../views/auth.ts";

export default defineRoute({
  summary: "Log in",
  description: "Returns a JWT. Send it on the next requests as `Authorization: Bearer <token>`.",
  tags: ["Auth"],
  access: "public",
  body: z.object({
    email: z.string().meta({ examples: ["usuario@empresa.com.br"] }),
    password: z.string(),
  }),
  response: LoginResult,
  errors: [401],
  handler: ({ body }) => login(body.email, body.password),
});

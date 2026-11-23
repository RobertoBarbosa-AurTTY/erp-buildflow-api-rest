import { z } from "zod";

export const Role = z
  .enum(["Admin", "Gerente", "Operador"])
  .meta({ id: "Role", description: "Admin: full access. Gerente: store management. Operador: cashier." });
export type Role = z.infer<typeof Role>;

export const SessionUser = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    role: Role,
  })
  .meta({ id: "SessionUser" });
export type SessionUser = z.infer<typeof SessionUser>;

export const LoginResult = z
  .object({
    token: z.string().meta({ description: "JWT. Send it as `Authorization: Bearer <token>`" }),
    user: SessionUser,
  })
  .meta({ id: "LoginResult" });

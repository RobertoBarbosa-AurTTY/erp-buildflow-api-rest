// JWT authentication (Bearer token) and role checks.
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { config } from "../config.ts";
import type { Role, SessionUser } from "../views/auth.ts";
import { HttpError } from "./http-error.ts";

export function signToken(user: SessionUser) {
  const options = { subject: user.id, expiresIn: config.jwtExpiresIn } as SignOptions;
  return jwt.sign({ name: user.name, email: user.email, role: user.role }, config.jwtSecret, options);
}

/** Reads `Authorization: Bearer <token>`. Returns null when missing or invalid. */
export function readUser(authorization: string | undefined): SessionUser | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authorization.slice(7), config.jwtSecret) as jwt.JwtPayload;
    return { id: String(payload.sub), name: payload.name, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

/** Admin always has access (same rule as the front-end `hasRole`). */
export function hasRole(user: SessionUser, roles: Role[]) {
  return user.role === "Admin" || roles.includes(user.role);
}

export function requireRole(user: SessionUser, roles: Role[]) {
  if (!hasRole(user, roles)) throw new HttpError(403, "Você não tem permissão para esta ação.");
}

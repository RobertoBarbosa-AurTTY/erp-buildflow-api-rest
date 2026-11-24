// Users and login.
import bcrypt from "bcryptjs";
import { signToken } from "../core/auth.ts";
import { HttpError } from "../core/http-error.ts";
import { docs } from "../db.ts";
import type { Role, SessionUser } from "../views/auth.ts";

export interface UserDocument {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
}

export function toSessionUser(user: UserDocument): SessionUser {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

export async function login(email: string, password: string) {
  const [user] = await docs<UserDocument>(
    `SELECT doc FROM users WHERE doc->>'email' = $1 AND doc @> '{"active": true}'`,
    [email.trim().toLowerCase()],
  );
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "E-mail ou senha inválidos");
  }
  const session = toSessionUser(user);
  return { token: signToken(session), user: session };
}

export async function getUser(id: string) {
  const [user] = await docs<UserDocument>(`SELECT doc FROM users WHERE id = $1 AND doc @> '{"active": true}'`, [id]);
  if (!user) throw new HttpError(401, "Usuário não encontrado ou inativo");
  return toSessionUser(user);
}

export async function listUsers() {
  const list = await docs<UserDocument>(`SELECT doc FROM users ORDER BY doc->>'name' COLLATE "C"`);
  return list.map(toSessionUser);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

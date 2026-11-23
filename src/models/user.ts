// Users and login.
import bcrypt from "bcryptjs";
import { signToken } from "../core/auth.ts";
import { HttpError } from "../core/http-error.ts";
import { collection } from "../db.ts";
import type { Role, SessionUser } from "../views/auth.ts";

export interface UserDocument {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
}

const users = () => collection<UserDocument>("users");

export function toSessionUser(user: UserDocument): SessionUser {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

export async function login(email: string, password: string) {
  const user = await users().findOne({ email: email.trim().toLowerCase(), active: true });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "E-mail ou senha inválidos");
  }
  const session = toSessionUser(user);
  return { token: signToken(session), user: session };
}

export async function getUser(id: string) {
  const user = await users().findOne({ _id: id, active: true });
  if (!user) throw new HttpError(401, "Usuário não encontrado ou inativo");
  return toSessionUser(user);
}

export async function listUsers() {
  const list = await users().find().sort({ name: 1 }).toArray();
  return list.map(toSessionUser);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

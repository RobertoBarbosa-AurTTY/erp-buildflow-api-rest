// Contract of a controller file. Every file inside src/controllers exports `default defineRoute({...})`.
// The same object drives request validation, the handler typing and the Swagger documentation.
import type { z } from "zod";
import type { Role, SessionUser } from "../views/auth.ts";

/** "public": no token. "auth": any logged user. Role[]: only these roles (Admin is always allowed). */
export type Access = "public" | "auth" | Role[];

type Input<S> = S extends z.ZodType ? z.output<S> : Record<string, never>;
type Result<S> = S extends z.ZodType ? z.input<S> : void;

export interface RouteContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  /** Logged user (null only on "public" routes). */
  user: SessionUser;
}

export interface RouteConfig<P, Q, B, R> {
  /** Short title shown in Swagger. */
  summary: string;
  /** Longer explanation (Markdown). Business rules belong here. */
  description?: string;
  tags: string[];
  access: Access;
  params?: P;
  query?: Q;
  body?: B;
  /** Success status. Default: 200, or 204 when there is no response schema. */
  status?: number;
  /** Success response body. Omit for 204 No Content. */
  response?: R;
  /** Business error statuses this route can return (400/401/403 are added automatically). */
  errors?: number[];
  handler: (ctx: RouteContext<Input<P>, Input<Q>, Input<B>>) => Promise<Result<R>> | Result<R>;
}

export function defineRoute<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType | undefined = undefined,
>(route: RouteConfig<P, Q, B, R>) {
  return route;
}

export type AnyRoute = RouteConfig<any, any, any, any>;

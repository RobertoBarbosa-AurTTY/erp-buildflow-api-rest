// File-based routing.
//
//   src/controllers/products/get.ts          -> GET    /api/products
//   src/controllers/products/[id]/patch.ts   -> PATCH  /api/products/:id
//
// Folder path = endpoint path, `[name]` folder = path parameter, file name = HTTP verb.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Router, type Request } from "express";
import type { z } from "zod";
import { readUser, requireRole } from "./auth.ts";
import { HttpError } from "./http-error.ts";
import type { Access, AnyRoute } from "./route.ts";

export const METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type Method = (typeof METHODS)[number];

export interface LoadedRoute {
  method: Method;
  /** Express path, e.g. /products/:id */
  path: string;
  file: string;
  route: AnyRoute;
}

export async function loadRoutes(dir: string): Promise<LoadedRoute[]> {
  const files = (await readdir(dir, { recursive: true })).filter((file) => file.endsWith(".ts"));
  const routes: LoadedRoute[] = [];
  for (const file of files) {
    const method = path.basename(file, ".ts") as Method;
    if (!METHODS.includes(method)) {
      throw new Error(`Invalid controller "${file}": the file name must be an HTTP verb (${METHODS.join(", ")}).`);
    }
    const segments = path.dirname(file).split(path.sep).filter((s) => s && s !== ".");
    const urlPath = "/" + segments.map((s) => s.replace(/^\[(\w+)\]$/, ":$1")).join("/");
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    if (!mod.default?.handler) throw new Error(`Controller "${file}" must export default defineRoute({...}).`);
    routes.push({ method, path: urlPath, file, route: mod.default });
  }
  return routes.sort(compareRoutes);
}

/** Static segments come before dynamic ones, so /products/stats wins over /products/:id. */
function compareRoutes(a: LoadedRoute, b: LoadedRoute) {
  const sa = a.path.split("/");
  const sb = b.path.split("/");
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] === undefined) return -1;
    if (sb[i] === undefined) return 1;
    if (sa[i] === sb[i]) continue;
    const dynamicA = sa[i].startsWith(":");
    const dynamicB = sb[i].startsWith(":");
    if (dynamicA !== dynamicB) return dynamicA ? 1 : -1;
    return sa[i].localeCompare(sb[i]);
  }
  return METHODS.indexOf(a.method) - METHODS.indexOf(b.method);
}

export function createRouter(routes: LoadedRoute[]) {
  const router = Router();
  for (const { method, path: routePath, route } of routes) {
    router[method](routePath, async (req, res) => {
      const user = authenticate(req, route.access);
      const result = await route.handler({
        user: user!,
        params: parse(route.params, req.params, "params"),
        query: parse(route.query, req.query, "query"),
        body: parse(route.body, req.body ?? {}, "body"),
      });
      if (result === undefined) res.status(204).end();
      else res.status(route.status ?? 200).json(result);
    });
  }
  return router;
}

function authenticate(req: Request, access: Access) {
  if (access === "public") return null;
  const user = readUser(req.headers.authorization);
  if (!user) throw new HttpError(401, "Sessão expirada. Faça login novamente.");
  if (Array.isArray(access)) requireRole(user, access);
  return user;
}

function parse(schema: z.ZodType | undefined, value: unknown, where: string) {
  if (!schema) return value;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({ in: where, path: issue.path.join("."), message: issue.message }));
  const first = issues[0];
  throw new HttpError(400, first.path ? `${first.path}: ${first.message}` : first.message, issues);
}

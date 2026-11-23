// Builds the OpenAPI 3.1 document from the loaded routes.
// Request and response schemas are the same zod schemas used for validation, so the docs never drift.
// Schemas with `.meta({ id: "Name" })` become reusable entries in components.schemas.
import { z } from "zod";
import type { LoadedRoute } from "./router.ts";
import type { Access } from "./route.ts";

type JsonSchema = Record<string, any>;

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Invalid request or business rule violation",
  401: "Missing, invalid or expired token",
  403: "The user's role is not allowed",
  404: "Resource not found",
  409: "Conflict with the current state (duplicate, insufficient stock, open cash session...)",
};

const TAGS = [
  { name: "Auth", description: "Login and current user" },
  { name: "Products", description: "Product catalog, stock status and warehouse location" },
  { name: "Categories", description: "Product categories" },
  { name: "Stock movements", description: "Stock history and manual adjustments" },
  { name: "Receivings", description: "Goods receipts (invoice / NF-e import)" },
  { name: "Warehouse addresses", description: "Physical addresses: deposit, aisle, shelf, level and slot" },
  { name: "Customers", description: "Customers, purchase history and open receivables" },
  { name: "Sales", description: "POS sales, quotes and cancellations" },
  { name: "Cash sessions", description: "Cash register: open, cash in/out, close and audit" },
  { name: "Payables", description: "Accounts payable, installments and recurring bills" },
  { name: "Receivables", description: "Accounts receivable, installments and recurring bills" },
  { name: "Reports", description: "Dashboard, sales report, P&L (DRE) and cash flow" },
  { name: "Settings", description: "Company settings and demo data" },
  { name: "System", description: "Health check" },
];

const DESCRIPTION = `
REST API of **BuildFlow ERP**, a management system for building material stores (POS, stock, finance).

### Authentication
Call \`POST /auth/login\`, then send the token on every request:
\`Authorization: Bearer <token>\`. Click **Authorize** above to try it here.

Roles: **Admin** (full access), **Gerente** (store management) and **Operador** (cashier).
Admin is always allowed. Each operation lists who can call it.

### Conventions
- JSON in and out. Ids are strings (\`_id\`).
- Dates are ISO 8601 (\`2026-11-23T13:00:00.000Z\`). Day filters use \`YYYY-MM-DD\` in the store time zone.
- Money is a number in BRL with 2 decimals.
- Errors always return \`{ "error": "message", "details"?: [...] }\`. The message is ready to show to the user.
- Domain values (payment methods, movement types, cash status) keep the Portuguese names used by the front-end.

### Routing
Each endpoint is one file: \`src/controllers/<path>/<verb>.ts\`. A \`[id]\` folder is a path parameter.
`.trim();

export function buildOpenApi(routes: LoadedRoute[]) {
  const schemas: Record<string, JsonSchema> = {
    Error: {
      type: "object",
      properties: {
        error: { type: "string", description: "Message ready to show to the user", examples: ["Produto não encontrado"] },
        details: {
          type: "array",
          description: "Validation issues (only on 400 validation errors)",
          items: {
            type: "object",
            properties: {
              in: { type: "string", enum: ["params", "query", "body"] },
              path: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      required: ["error"],
    },
  };

  const toJson = (schema: z.ZodType, io: "input" | "output"): JsonSchema => {
    const raw = JSON.stringify(z.toJSONSchema(schema, { io, unrepresentable: "any" }));
    const { $schema: _, $defs, ...rest } = JSON.parse(raw.replaceAll("#/$defs/", "#/components/schemas/"));
    Object.assign(schemas, $defs ?? {});
    return rest;
  };

  const toParameters = (schema: z.ZodType | undefined, where: "path" | "query") => {
    if (!schema) return [];
    const json = toJson(schema, "input");
    return Object.entries<JsonSchema>(json.properties ?? {}).map(([name, prop]) => ({
      name,
      in: where,
      required: where === "path" || (json.required ?? []).includes(name),
      description: prop.description,
      schema: prop,
    }));
  };

  const paths: Record<string, Record<string, unknown>> = {};
  for (const { method, path, route } of routes) {
    const openApiPath = path.replace(/:(\w+)/g, "{$1}");
    const pathParams = route.params ?? autoParams(path);
    const status = route.status ?? (route.response ? 200 : 204);

    const responses: Record<string, unknown> = {
      [status]: route.response
        ? { description: "Success", content: { "application/json": { schema: toJson(route.response, "output") } } }
        : { description: "Success (no content)" },
    };
    const errors = new Set(route.errors ?? []);
    if (route.params || route.query || route.body) errors.add(400);
    if (route.access !== "public") errors.add(401);
    if (Array.isArray(route.access)) errors.add(403);
    for (const code of [...errors].sort()) {
      responses[code] = {
        description: ERROR_DESCRIPTIONS[code] ?? "Error",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      };
    }

    paths[openApiPath] ??= {};
    paths[openApiPath][method] = {
      tags: route.tags,
      summary: route.summary,
      description: [route.description, accessText(route.access)].filter(Boolean).join("\n\n"),
      operationId: operationId(method, path),
      parameters: [...toParameters(pathParams, "path"), ...toParameters(route.query, "query")],
      requestBody: route.body
        ? { required: true, content: { "application/json": { schema: toJson(route.body, "input") } } }
        : undefined,
      responses,
      security: route.access === "public" ? [] : [{ bearerAuth: [] }],
    };
  }

  return {
    openapi: "3.1.0",
    info: { title: "BuildFlow ERP API", version: "1.0.0", description: DESCRIPTION },
    servers: [{ url: "/api" }],
    tags: TAGS,
    paths,
    components: {
      schemas,
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
  };
}

function autoParams(path: string) {
  const names = [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
  if (!names.length) return undefined;
  return z.object(Object.fromEntries(names.map((name) => [name, z.string()])));
}

function accessText(access: Access) {
  if (access === "public") return "**Access:** public";
  if (access === "auth") return "**Access:** any authenticated user";
  return `**Access:** ${["Admin", ...access].join(", ")}`;
}

/** GET /products/:id/address -> getProductsByIdAddress */
function operationId(method: string, path: string) {
  const words = path
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith(":") ? `by-${segment.slice(1)}` : segment))
    .join("-")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return method + words.join("");
}

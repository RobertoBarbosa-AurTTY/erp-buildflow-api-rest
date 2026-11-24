# BuildFlow API

REST API for [BuildFlow ERP](https://github.com/RobertoBarbosa-AurTTY/erp_buildflow_nextjs) (POS, stock and finance for building material stores).

**Node.js 22.18+** (runs TypeScript directly, no build step) · **Express 5** · **PostgreSQL** · **zod 4** · **Swagger / OpenAPI 3.1**

## Quick start

```bash
docker compose up -d       # PostgreSQL on localhost:5432 (databases buildflow and buildflow_test)
cp .env.example .env
npm install
npm run seed               # demo data (same data as the front-end demo)
npm run dev                # http://localhost:3333/api
```

- Swagger UI: http://localhost:3333/docs
- OpenAPI JSON: http://localhost:3333/openapi.json
- Logins: `admin@buildflow.com.br / admin123`, `gerente@buildflow.com.br / gerente123`, `caixa@buildflow.com.br / caixa123`

| Script | What it does |
|:--|:--|
| `npm run dev` | Starts with auto reload |
| `npm start` | Starts |
| `npm run seed` | **Erases** the database and loads the demo data |
| `npm run check` | Type check (`tsc --noEmit`) |
| `npm test` | Integration tests on a separate database (`buildflow_test`) |

## Architecture (MVC)

```text
src/
├── controllers/      # C: one file per endpoint. Folder = path, file = HTTP verb
├── models/           # M: SQL access + business rules + input schemas
├── views/            # V: zod schemas of the JSON responses (also the Swagger models)
├── core/             # routing, auth, OpenAPI builder, HttpError
├── lib/              # pure helpers (money, dates, CPF/CNPJ, installments)
├── seed/             # demo data
├── app.ts            # Express app
├── db.ts             # PostgreSQL pool, table helpers and schema
└── server.ts
```

The flow of a request: **controller** validates the input (zod) and checks the role → calls the **model** →
returns an object described by a **view** schema.

### File-based routing

```text
src/controllers/products/get.ts                 GET    /api/products
src/controllers/products/post.ts                POST   /api/products
src/controllers/products/[id]/get.ts            GET    /api/products/:id
src/controllers/products/[id]/patch.ts          PATCH  /api/products/:id
src/controllers/products/[id]/address/put.ts    PUT    /api/products/:id/address
```

- Folder path = endpoint path. A `[name]` folder is a path parameter.
- File name = HTTP verb: `get`, `post`, `put`, `patch`, `delete`. Any other file name inside `controllers/` fails at startup.
- Static segments win over parameters (`/products/stats` before `/products/:id`).

### A controller

```ts
// src/controllers/products/[id]/patch.ts
export default defineRoute({
  summary: "Update product",
  description: "Partial update. `quantity` is ignored: use POST /stock-movements.",
  tags: ["Products"],
  access: "auth",                       // "public" | "auth" | ["Gerente"] (Admin is always allowed)
  params: z.object({ id: z.string() }),
  body: ProductPatch,                   // validated; 400 with details when invalid
  response: Product,                    // documents the 200 response and types the handler return
  errors: [404, 409],                   // 400/401/403 are documented automatically
  handler: ({ params, body }) => updateProduct(params.id, body),
});
```

The handler returns data: the router sends it as JSON (or `204` when it returns nothing).
Errors are thrown as `new HttpError(status, message)`.

### Swagger

The OpenAPI document is generated at startup from the controllers: summary, description, access, params,
query, body, response and error statuses. Schemas with `.meta({ id: "Name" })` become reusable models in
`components.schemas`. Since validation and docs use the same zod schemas, they cannot drift apart.

## Conventions

- JSON in and out, string ids (`_id`), dates in ISO 8601, money as numbers in BRL.
- Day filters (`start`, `end`, `from`, `to`) use `YYYY-MM-DD` in the store time zone (`TZ`, default `America/Maceio`).
- Errors: `{ "error": "message", "details"?: [...] }`. Messages are in Portuguese because the front-end shows them to the user.
- Domain values keep the names the front-end already uses (`"Dinheiro"`, `"ENTRADA"`, `"aberto"`, `entradaRealizada`...).
- Auth: `POST /api/auth/login` returns a JWT; send `Authorization: Bearer <token>`.

## Roles

Same rules as the front-end permissions table. Admin can do everything.

| Area | Roles |
|:--|:--|
| POS, sales, quotes, cash session (open, cash in/out, close) | everyone |
| Products, stock adjustments, goods receipts, warehouse addresses | everyone |
| Create/edit customers | Gerente |
| Payables and receivables (create, edit, pay/receive, cancel, delete) | Gerente |
| Cancel sales, cash audit (`GET /cash-sessions`, `/cash-sessions/:id`) | Gerente |
| Sales report and cash flow | Gerente |
| Preferences (`PATCH /settings`: alerts, default payment) | Gerente |
| Company data (`PATCH /settings`: name, CNPJ, contact), delete customers, export/reset data | Admin |

## Front-end mapping

The front-end screens only talk to `web/src/lib/services/*`. Replacing the mock with this API means rewriting
those functions to call the endpoints below.

| Front-end service | Endpoint |
|:--|:--|
| `auth.login` | `POST /auth/login` |
| `products.listProducts` / `listPosProducts` | `GET /products` |
| `products.getProduct` | `GET /products/:id` |
| `products.getProductByCode` | `GET /products/lookup?code=` (404 = not found) |
| `products.createProduct` | `POST /products` |
| `products.updateProduct` / `setProductActive` | `PATCH /products/:id` |
| `products.getStockStats` | `GET /products/stats` |
| `products.listCategories` / `createCategory` | `GET` / `POST /categories` |
| `products.listStockMovements` / `adjustStock` | `GET` / `POST /stock-movements` |
| `products.listReceivings` / `registerReceiving` | `GET` / `POST /receivings` |
| `products.listAddresses` / `createAddress` | `GET` / `POST /warehouse-addresses` |
| `products.createAddressBatch` | `POST /warehouse-addresses/batch` |
| `products.setAddressActive` / `deleteAddress` | `PATCH` / `DELETE /warehouse-addresses/:id` |
| `products.assignProductAddress` | `PUT /products/:id/address` |
| `products.getLabelSettings`, `sales.getReceiptSettings`, `settings.getSettings` | `GET /settings` |
| `customers.listCustomers` / `sales.listSaleCustomers` | `GET /customers` (`?active=true` for the POS) |
| `customers.getCustomerStats` | `GET /customers/stats` |
| `customers.getCustomerDetail` | `GET /customers/:id` |
| `customers.createCustomer` / `updateCustomer` / `deleteCustomer` | `POST /customers`, `PUT` / `DELETE /customers/:id` |
| `sales.listSales` / `getSale` / `createSale` | `GET /sales`, `GET /sales/:id`, `POST /sales` |
| `sales.convertQuote` / `cancelSale` | `POST /sales/:id/convert`, `POST /sales/:id/cancel` |
| `cash.getOpenSession` | `GET /cash-sessions/current` (`null` when closed) |
| `cash.listSessionSummaries` / `getSessionDetail` | `GET /cash-sessions`, `GET /cash-sessions/:id` |
| `cash.openCashSession` / `addCashMovement` / `closeCashSession` | `POST /cash-sessions`, `POST /cash-sessions/:id/movements`, `POST /cash-sessions/:id/close` |
| `payables.*` | `GET` / `POST /payables`, `PUT` / `DELETE /payables/:id`, `POST /payables/:id/pay`, `POST /payables/:id/cancel`, `DELETE /payables/groups/:groupId` |
| `receivables.*` | same as payables, with `POST /receivables/:id/receive` |
| `analytics.getDashboard` | `GET /dashboard?period=` |
| `analytics.getSalesReport` | `GET /reports/sales?from=&to=` |
| `cash-flow.getCashFlow` / `getCashFlowDay` | `GET /cash-flow`, `GET /cash-flow/:day` |
| `settings.updateSettings` | `PATCH /settings` |
| `settings.exportMockData` / `restoreDemoData` | `GET /data/export`, `POST /data/reset` |

The user name on movements, sales and cash sessions comes from the token, so the front-end no longer sends `userName`.

## Notes

- Each collection is a table `(id text primary key, doc jsonb)`: documents keep the shape the front-end uses and the
  queries filter on `doc`. Tables and indexes are created on start (`ensureSchema`), so there are no migrations to run.
  Text sorts use `COLLATE "C"` (plain byte order, like a string compare).
- A sale writes the sale, the stock movements and the receivable in sequence (no transaction). Stock is checked right
  before writing, and each stock change is a single atomic `UPDATE`.
- `jsonb` stores object keys in its own order (shorter keys first), so the JSON keys may come in a different order
  than they were written. The values are the same.
- Reports load the period's documents and compute in memory (same formulas as the front-end). That is fine for the
  volume of a store; move to SQL aggregations if it grows a lot.
- `POST /data/reset` only works with `ALLOW_DATA_RESET=true`. Keep it `false` in production.

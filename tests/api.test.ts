// Integration tests against a real PostgreSQL (separate database: buildflow_test).
// Run: docker compose up -d && npm test
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/buildflow_test";
process.env.ALLOW_DATA_RESET = "true";

const { createApp } = await import("../src/app.ts");
const db = await import("../src/db.ts");
const { seedDatabase } = await import("../src/seed/run-seed.ts");

let server: Server;
let base = "";
const tokens: Record<string, string> = {};

async function api(method: string, path: string, body?: unknown, as = "admin") {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(tokens[as] ? { authorization: `Bearer ${tokens[as]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

before(async () => {
  assert.equal(await db.connect(), "buildflow_test", "tests must not run on the main database");
  await db.ensureSchema();
  await seedDatabase();
  const { app } = await createApp();
  server = app.listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}/api`;
  for (const [name, email, password] of [
    ["admin", "admin@buildflow.com.br", "admin123"],
    ["manager", "gerente@buildflow.com.br", "gerente123"],
    ["cashier", "caixa@buildflow.com.br", "caixa123"],
  ]) {
    const res = await api("POST", "/auth/login", { email, password }, "none");
    assert.equal(res.status, 200);
    tokens[name] = res.body.token;
  }
});

after(async () => {
  server?.close();
  await db.disconnect();
});

describe("auth", () => {
  test("rejects wrong password and missing token", async () => {
    assert.equal((await api("POST", "/auth/login", { email: "admin@buildflow.com.br", password: "x" }, "none")).status, 401);
    assert.equal((await api("GET", "/products", undefined, "none")).status, 401);
  });

  test("enforces roles", async () => {
    assert.equal((await api("DELETE", "/customers/c1", undefined, "cashier")).status, 403);
    assert.equal((await api("PATCH", "/settings", { companyName: "X" }, "manager")).status, 403);
    assert.equal((await api("PATCH", "/settings", { expiryAlertDays: 15 }, "manager")).status, 200);
  });
});

describe("products and stock", () => {
  test("creates a product with initial stock and blocks duplicate SKU", async () => {
    const input = {
      name: "Produto Teste", sku: "TST-001", category: "Materiais", unit: "UN", quantity: 10,
      minStock: 2, maxStock: 50, price: 10, costPrice: 6, perishable: false, active: true,
    };
    const created = await api("POST", "/products", input);
    assert.equal(created.status, 201);
    assert.equal(created.body.quantity, 10);
    assert.equal((await api("POST", "/products", input)).status, 409);

    const moves = await api("GET", `/stock-movements?productId=${created.body._id}`);
    assert.equal(moves.body[0].type, "ENTRADA");

    const adjust = await api("POST", "/stock-movements", { productId: created.body._id, mode: "set", quantity: 7, reason: "Inventário" });
    assert.equal(adjust.status, 201);
    assert.equal(adjust.body.newQuantity, 7);
    assert.equal((await api("PATCH", `/products/${created.body._id}`, { quantity: 999, price: 12 })).body.quantity, 7);
  });

  test("goods receipt adds stock and creates new products", async () => {
    const before = (await api("GET", "/products/p1")).body.quantity;
    const res = await api("POST", "/receivings", {
      document: "777", supplier: "Votorantim", updateCost: true,
      items: [
        { productId: "p1", quantity: 5, unitCost: 26 },
        { newProduct: { name: "Novo", sku: "NEW-1", category: "Materiais", unit: "UN", quantity: 0, minStock: 0, maxStock: 0, price: 5, costPrice: 0, perishable: false, active: true }, quantity: 3, unitCost: 2 },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.createdProducts, 1);
    const p1 = (await api("GET", "/products/p1")).body;
    assert.equal(p1.quantity, before + 5);
    assert.equal(p1.costPrice, 26);
    assert.equal((await api("GET", "/receivings")).body[0].reference, "NF 777");
  });
});

describe("sales and cash", () => {
  test("cash session, sale on credit, cancellation and quote conversion", async () => {
    // seed leaves cx60 open: close it, then open a new one
    const current = (await api("GET", "/cash-sessions/current")).body;
    const { Crediário: _, ...counted } = current.expectedByMethod;
    const closed = await api("POST", `/cash-sessions/${current.session._id}/close`, { counted });
    assert.equal(closed.body.difference, 0);
    assert.equal((await api("GET", "/cash-sessions/current")).body, null);

    const item = { id: "p2", sku: "MAT-002", name: "Argamassa", unit: "SC", qty: 2, price: 24.9, discount: 0, discountType: "percent" };
    const noCash = await api("POST", "/sales", { items: [item], status: "FINALIZED", payment: { method: "PIX" } });
    assert.equal(noCash.status, 409);

    const session = await api("POST", "/cash-sessions", { openingAmount: 100 }, "cashier");
    assert.equal(session.status, 201);
    assert.equal((await api("POST", "/cash-sessions", { openingAmount: 1 })).status, 409);

    const stockBefore = (await api("GET", "/products/p2")).body.quantity;
    const sale = await api("POST", "/sales", { items: [item], status: "FINALIZED", payment: { method: "Crediário" }, customerId: "c2" }, "cashier");
    assert.equal(sale.status, 201);
    assert.equal(sale.body.total, 49.8);
    assert.equal((await api("GET", "/products/p2")).body.quantity, stockBefore - 2);
    const credit = (await api("GET", "/receivables")).body.find((r: { saleId?: string }) => r.saleId === sale.body._id);
    assert.equal(credit.status, "pending");

    assert.equal((await api("POST", `/sales/${sale.body._id}/cancel`, { reason: "Teste" }, "cashier")).status, 403);
    const cancelled = await api("POST", `/sales/${sale.body._id}/cancel`, { reason: "Cliente desistiu" }, "manager");
    assert.equal(cancelled.body.status, "CANCELLED");
    assert.equal((await api("GET", "/products/p2")).body.quantity, stockBefore);
    const creditAfter = (await api("GET", "/receivables")).body.find((r: { _id: string }) => r._id === credit._id);
    assert.equal(creditAfter.status, "cancelled");

    const cash = await api("POST", "/sales", { items: [item], status: "FINALIZED", payment: { method: "Dinheiro", amountPaid: 60 } });
    assert.equal(cash.body.change, 10.2);
    const tooMuch = await api("POST", "/sales", { items: [{ ...item, qty: 99999 }], status: "FINALIZED", payment: { method: "PIX" } });
    assert.equal(tooMuch.status, 409);

    const quote = await api("POST", "/sales", { items: [item], status: "QUOTE" });
    assert.equal(quote.body.status, "QUOTE");
    const converted = await api("POST", `/sales/${quote.body._id}/convert`, { payment: { method: "PIX" } });
    assert.equal(converted.body.status, "FINALIZED");
    assert.ok(converted.body.saleNumber > sale.body.saleNumber);

    const outflow = await api("POST", `/cash-sessions/${session.body._id}/movements`, { type: "retirada", amount: 999999, reason: "x" });
    assert.equal(outflow.status, 400);
    const summary = (await api("GET", "/cash-sessions/current")).body;
    assert.equal(summary.expectedCash, 100 + 49.8);
  });
});

describe("bills", () => {
  test("installments, recurring payment and group delete", async () => {
    const created = await api("POST", "/payables", { description: "Compra", supplier: "X", amount: 100, dueDate: "2026-01-31T12:00:00.000Z", installments: 3 });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.map((b: { amount: number }) => b.amount), [33.33, 33.33, 33.34]);
    assert.equal(created.body[1].description, "Compra - parcela 2/3");

    const recurring = (await api("POST", "/payables", { description: "Aluguel", amount: 50, dueDate: "2026-01-31T12:00:00.000Z", recurring: true })).body[0];
    const paid = await api("POST", `/payables/${recurring._id}/pay`, { date: new Date().toISOString(), paymentMethod: "PIX" });
    assert.equal(paid.body.paid.status, "paid");
    assert.ok(paid.body.next.dueDate.startsWith("2026-02-28"));

    await api("POST", `/payables/${created.body[0]._id}/pay`, { date: new Date().toISOString(), paymentMethod: "Boleto" });
    const deleted = await api("DELETE", `/payables/groups/${created.body[0].installmentGroupId}`);
    assert.equal(deleted.body.deleted, 2);

    const receivable = await api("POST", "/receivables", { description: "Obra", customerId: "c1", amount: 10, dueDate: new Date().toISOString() });
    assert.equal(receivable.body[0].customerName, "Construtora Horizonte Ltda");
    assert.equal((await api("POST", "/receivables", { description: "Sem cliente", amount: 10, dueDate: "2026-01-01" })).status, 400);
  });
});

describe("customers", () => {
  test("validates document and blocks delete with open bills", async () => {
    assert.equal((await api("POST", "/customers", { name: "Fulano", cpfCnpj: "111.111.111-11" })).status, 400);
    const created = await api("POST", "/customers", { name: "Fulano", cpfCnpj: "529.982.247-25", phone: "(82) 99999-0000" }, "manager");
    assert.equal(created.status, 201);
    assert.equal(created.body.cpfCnpj, "52998224725");
    assert.equal((await api("POST", "/customers", { name: "Outro", cpfCnpj: "52998224725" })).status, 409);
    assert.equal((await api("DELETE", "/customers/c1")).status, 409);
    assert.equal((await api("DELETE", `/customers/${created.body._id}`)).status, 204);
  });
});

describe("docs", () => {
  test("serves an OpenAPI document with every route", async () => {
    const spec = await (await fetch(base.replace("/api", "/openapi.json"))).json();
    assert.equal(spec.openapi, "3.1.0");
    assert.ok(spec.paths["/products/{id}"].patch);
    assert.ok(spec.components.schemas.Product);
  });
});

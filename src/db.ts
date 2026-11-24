// PostgreSQL connection. Each collection is a table `(id text primary key, doc jsonb)`: the document keeps
// the same shape the front-end uses (string `_id`, nested items/location), and the queries filter on `doc`.
// Text comparisons use COLLATE "C" (byte order), so ISO dates and codes sort the same as plain string compare.
import pg from "pg";
import { config } from "./config.ts";

// int8 (count, sum) as number
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const TABLES = [
  "users", "products", "categories", "stock_movements", "warehouse_addresses", "customers", "sales",
  "accounts_payable", "accounts_receivable", "cash_sessions", "cash_movements", "settings",
] as const;
export type Table = (typeof TABLES)[number];

/** Returns the database name (the tests use it to refuse the main database). */
export async function connect() {
  const { rows } = await pool.query<{ name: string }>("SELECT current_database() AS name");
  return rows[0].name;
}

export async function disconnect() {
  await pool.end();
}

export function query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<R>(text, params);
}

/** JSON parameter for a jsonb placeholder (`$1::jsonb`). `undefined` fields are dropped, like in a document. */
export const json = (value: unknown) => JSON.stringify(value);

/** Runs a `SELECT doc ...` and returns the documents. */
export async function docs<T>(text: string, params: unknown[] = []) {
  const { rows } = await pool.query<{ doc: T }>(text, params);
  return rows.map((row) => row.doc);
}

export async function findById<T>(table: Table, id: string) {
  return (await docs<T>(`SELECT doc FROM ${table} WHERE id = $1`, [id]))[0] ?? null;
}

export async function insert<T extends { _id: string }>(table: Table, list: T | T[]) {
  const items = Array.isArray(list) ? list : [list];
  if (!items.length) return;
  await pool.query(
    `INSERT INTO ${table} (id, doc) SELECT d->>'_id', d FROM jsonb_array_elements($1::jsonb) AS d`,
    [json(items)],
  );
}

/** Replaces the whole document. */
export async function replace<T extends { _id: string }>(table: Table, doc: T) {
  await pool.query(`UPDATE ${table} SET doc = $2::jsonb WHERE id = $1`, [doc._id, json(doc)]);
}

/** Merges `fields` into the document (top level) and returns the updated document, or null. */
export async function merge<T>(table: Table, id: string, fields: Record<string, unknown>) {
  return (await docs<T>(`UPDATE ${table} SET doc = doc || $2::jsonb WHERE id = $1 RETURNING doc`, [id, json(fields)]))[0] ?? null;
}

export async function removeById(table: Table, id: string) {
  const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount ?? 0;
}

/** Atomic sequential number (sale number, cash session number). */
export async function nextSequence(name: string) {
  const { rows } = await pool.query<{ seq: number }>(
    `INSERT INTO counters (name, seq) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET seq = counters.seq + 1 RETURNING seq`,
    [name],
  );
  return rows[0].seq;
}

export async function setSequence(name: string, seq: number) {
  await pool.query(
    "INSERT INTO counters (name, seq) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET seq = EXCLUDED.seq",
    [name, seq],
  );
}

/** Creates the tables and indexes when missing (idempotent, runs on every start). */
export async function ensureSchema() {
  const statements = [
    ...TABLES.map((table) => `CREATE TABLE IF NOT EXISTS ${table} (id text PRIMARY KEY, doc jsonb NOT NULL)`),
    "CREATE TABLE IF NOT EXISTS counters (name text PRIMARY KEY, seq integer NOT NULL)",
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users ((doc->>'email'))`,
    `CREATE INDEX IF NOT EXISTS sales_created ON sales ((doc->>'createdAt') COLLATE "C")`,
    `CREATE INDEX IF NOT EXISTS sales_caixa ON sales ((doc->>'caixaId'))`,
    `CREATE INDEX IF NOT EXISTS stock_movements_product ON stock_movements ((doc->>'productId'), (doc->>'timestamp') COLLATE "C")`,
    `CREATE INDEX IF NOT EXISTS cash_movements_caixa ON cash_movements ((doc->>'caixaId'))`,
    `CREATE INDEX IF NOT EXISTS receivable_customer ON accounts_receivable ((doc->>'customerId'))`,
  ];
  for (const sql of statements) await pool.query(sql);
}

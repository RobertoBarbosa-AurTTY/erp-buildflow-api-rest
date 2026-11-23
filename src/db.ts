// MongoDB connection. Documents use string ids (`_id: string`), the same shape the front-end uses.
import { MongoClient, type Db, type Document } from "mongodb";
import { config } from "./config.ts";

const client = new MongoClient(config.mongoUri, { ignoreUndefined: true });
let db: Db | null = null;

export async function connect() {
  await client.connect();
  db = client.db();
  return db;
}

export async function disconnect() {
  await client.close();
  db = null;
}

export function collection<T extends Document>(name: string) {
  if (!db) throw new Error("Database not connected. Call connect() first.");
  return db.collection<T>(name);
}

/** Atomic sequential number (sale number, cash session number). */
export async function nextSequence(name: string) {
  const counter = await collection<{ _id: string; seq: number }>("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return counter!.seq;
}

export async function setSequence(name: string, seq: number) {
  await collection<{ _id: string; seq: number }>("counters").updateOne({ _id: name }, { $set: { seq } }, { upsert: true });
}

export async function ensureIndexes() {
  await collection("users").createIndex({ email: 1 }, { unique: true });
  await collection("products").createIndex({ sku: 1 });
  await collection("sales").createIndex({ createdAt: -1 });
  await collection("sales").createIndex({ caixaId: 1 });
  await collection("stock_movements").createIndex({ productId: 1, timestamp: -1 });
  await collection("cash_movements").createIndex({ caixaId: 1 });
  await collection("accounts_receivable").createIndex({ customerId: 1 });
}

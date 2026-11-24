// Stock movements. Product quantity only changes here, so the history always matches the balance.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, json } from "../db.ts";
import { round2 } from "../lib/calc.ts";
import { normalize } from "../lib/text.ts";
import type { Product } from "../views/product.ts";
import type { StockMovement, StockMovementType } from "../views/stock.ts";

/** Applies `delta` to the product quantity (atomic UPDATE) and stores the movement. */
export async function recordMovement(
  productId: string,
  type: StockMovementType,
  delta: number,
  extra: { reason?: string; reference?: string; userName: string },
) {
  const timestamp = new Date().toISOString();
  // Locks the row, then adds with float8 (the same double arithmetic as JavaScript). Returns the document before.
  const [before] = await docs<Product>(
    `WITH old AS (SELECT id, doc FROM products WHERE id = $1 FOR UPDATE)
     UPDATE products p
     SET doc = p.doc || jsonb_build_object('quantity', (old.doc->>'quantity')::float8 + $2::float8, 'updatedAt', $3::text)
     FROM old WHERE p.id = old.id
     RETURNING old.doc`,
    [productId, delta, timestamp],
  );
  if (!before) throw new HttpError(404, "Produto não encontrado");
  const movement: StockMovement = {
    _id: randomUUID(),
    productId,
    sku: before.sku,
    productName: before.name,
    type,
    quantity: round2(delta),
    previousQuantity: before.quantity,
    newQuantity: round2(before.quantity + delta),
    reason: extra.reason,
    reference: extra.reference,
    userName: extra.userName,
    timestamp,
  };
  await insert("stock_movements", movement);
  return movement;
}

export interface ListMovementsFilters {
  productId?: string;
  type?: StockMovementType;
  search?: string;
  limit?: number;
}

export async function listMovements(filters: ListMovementsFilters) {
  const filter: Record<string, unknown> = {};
  if (filters.productId) filter.productId = filters.productId;
  if (filters.type) filter.type = filters.type;
  const term = normalize(filters.search);
  const list = await docs<StockMovement>(
    `SELECT doc FROM stock_movements WHERE doc @> $1::jsonb ORDER BY doc->>'timestamp' COLLATE "C" DESC`,
    [json(filter)],
  );
  const result = term
    ? list.filter((m) => [m.productName, m.sku, m.reference].some((value) => normalize(value).includes(term)))
    : list;
  return filters.limit ? result.slice(0, filters.limit) : result;
}

export const AdjustStockInput = z
  .object({
    productId: z.string().min(1),
    mode: z.enum(["add", "remove", "set"]).meta({ description: "add: stock in, remove: loss/damage, set: inventory count" }),
    quantity: z.number().min(0).meta({ description: "Units to add/remove, or the counted quantity for `set`" }),
    reason: z.string().trim().min(1, "Informe o motivo do ajuste"),
  })
  .meta({ id: "AdjustStockInput" });
export type AdjustStockInput = z.infer<typeof AdjustStockInput>;

export async function adjustStock(input: AdjustStockInput, userName: string) {
  const product = await findById<Product>("products", input.productId);
  if (!product) throw new HttpError(404, "Produto não encontrado");
  if (input.mode !== "set" && input.quantity === 0) throw new HttpError(400, "Quantidade inválida");
  let delta = input.quantity;
  let type: StockMovementType = "ENTRADA";
  if (input.mode === "remove") {
    if (input.quantity > product.quantity) throw new HttpError(400, `Saldo insuficiente (atual: ${product.quantity})`);
    delta = -input.quantity;
    type = "SAIDA";
  } else if (input.mode === "set") {
    delta = input.quantity - product.quantity;
    type = "AJUSTE";
    if (delta === 0) throw new HttpError(400, "A contagem é igual ao saldo atual");
  }
  return recordMovement(product._id, type, delta, { reason: input.reason, userName });
}

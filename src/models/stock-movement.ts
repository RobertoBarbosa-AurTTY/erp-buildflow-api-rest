// Stock movements. Product quantity only changes here, so the history always matches the balance.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { collection } from "../db.ts";
import { round2 } from "../lib/calc.ts";
import { normalize } from "../lib/text.ts";
import type { Product } from "../views/product.ts";
import type { StockMovement, StockMovementType } from "../views/stock.ts";

const products = () => collection<Product>("products");
export const stockMovements = () => collection<StockMovement>("stock_movements");

/** Applies `delta` to the product quantity and stores the movement. */
export async function recordMovement(
  productId: string,
  type: StockMovementType,
  delta: number,
  extra: { reason?: string; reference?: string; userName: string },
) {
  const timestamp = new Date().toISOString();
  const before = await products().findOneAndUpdate(
    { _id: productId },
    { $inc: { quantity: delta }, $set: { updatedAt: timestamp } },
    { returnDocument: "before" },
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
  await stockMovements().insertOne(movement);
  return movement;
}

export interface ListMovementsFilters {
  productId?: string;
  type?: StockMovementType;
  search?: string;
  limit?: number;
}

export async function listMovements(filters: ListMovementsFilters) {
  const query: Record<string, unknown> = {};
  if (filters.productId) query.productId = filters.productId;
  if (filters.type) query.type = filters.type;
  const term = normalize(filters.search);
  const list = await stockMovements().find(query).sort({ timestamp: -1 }).toArray();
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
  const product = await products().findOne({ _id: input.productId });
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

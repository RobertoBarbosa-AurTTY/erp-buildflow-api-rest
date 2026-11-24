// Products: catalog, stock stats and warehouse location.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, json, merge, query } from "../db.ts";
import { round2, stockStatus } from "../lib/calc.ts";
import { byName, normalize } from "../lib/text.ts";
import { Product, type StockStats, type StockStatus } from "../views/product.ts";
import type { WarehouseAddress } from "../views/stock.ts";
import { recordMovement } from "./stock-movement.ts";

export const ProductInput = Product.omit({ _id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().trim().min(1, "Informe o nome do produto"),
    sku: z.string().trim().min(1, "Informe o SKU"),
    quantity: z.number().min(0).meta({ description: "Initial stock (creates an ENTRADA movement). Ignored on update" }),
  })
  .meta({ id: "ProductInput" });
export type ProductInput = z.infer<typeof ProductInput>;

export const ProductPatch = ProductInput.partial().meta({ id: "ProductPatch" });
export type ProductPatch = z.infer<typeof ProductPatch>;

export interface ListProductsFilters {
  search?: string;
  category?: string;
  status?: StockStatus;
  includeInactive?: boolean;
}

export function matchesSearch(product: Product, search: string) {
  const term = normalize(search);
  if (!term) return true;
  return [product.name, product.sku, product.barcode, product.brand].some((value) => normalize(value).includes(term));
}

export async function listProducts(filters: ListProductsFilters) {
  const filter: Record<string, unknown> = {};
  if (!filters.includeInactive) filter.active = true;
  if (filters.category) filter.category = filters.category;
  const list = await docs<Product>("SELECT doc FROM products WHERE doc @> $1::jsonb", [json(filter)]);
  return list
    .filter((p) => matchesSearch(p, filters.search ?? ""))
    .filter((p) => !filters.status || stockStatus(p) === filters.status)
    .sort(byName);
}

export async function getProduct(id: string) {
  const product = await findById<Product>("products", id);
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return product;
}

/** Exact SKU or barcode match, case/accent insensitive, active products only. */
export async function findProductByCode(code: string) {
  const term = normalize(code);
  const list = await docs<Product>(`SELECT doc FROM products WHERE doc @> '{"active": true}'`);
  const product = list.find((p) => normalize(p.sku) === term || normalize(p.barcode) === term);
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return product;
}

/** SKU and barcode must be unique. */
export async function validateProduct(input: Pick<ProductInput, "sku" | "barcode">, ignoreId?: string) {
  const others = (await docs<Product>("SELECT doc FROM products")).filter(
    (p) => p._id !== ignoreId,
  );
  if (others.some((p) => normalize(p.sku) === normalize(input.sku))) {
    throw new HttpError(409, `Já existe um produto com o SKU ${input.sku}`);
  }
  if (input.barcode && others.some((p) => normalize(p.barcode) === normalize(input.barcode))) {
    throw new HttpError(409, `Código de barras ${input.barcode} já cadastrado`);
  }
}

export async function createProduct(input: ProductInput, userName: string) {
  await validateProduct(input);
  const { quantity, ...data } = input;
  const product: Product = { ...data, _id: randomUUID(), quantity: 0, createdAt: new Date().toISOString() };
  await insert("products", product);
  if (quantity > 0) {
    await recordMovement(product._id, "ENTRADA", quantity, { reason: "Estoque inicial (cadastro)", userName });
  }
  return getProduct(product._id);
}

/** Quantity is ignored: it only changes through stock movements. */
export async function updateProduct(id: string, patch: ProductPatch) {
  const current = await getProduct(id);
  const { quantity: _ignored, ...data } = patch;
  await validateProduct({ ...current, ...data }, id);
  await merge("products", id, { ...data, updatedAt: new Date().toISOString() });
  return getProduct(id);
}

export async function getStockStats(expiryDays: number): Promise<StockStats> {
  const list = await docs<Product>(`SELECT doc FROM products WHERE doc @> '{"active": true}'`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = today.getTime() + expiryDays * 86_400_000;
  return {
    totalItems: list.length,
    totalUnits: round2(list.reduce((s, p) => s + p.quantity, 0)),
    costValue: round2(list.reduce((s, p) => s + p.quantity * p.costPrice, 0)),
    saleValue: round2(list.reduce((s, p) => s + p.quantity * p.price, 0)),
    lowStock: list.filter((p) => stockStatus(p) === "low").length,
    outOfStock: list.filter((p) => stockStatus(p) === "out").length,
    expiringSoon: list.filter((p) => p.perishable && p.expiryDate && new Date(p.expiryDate).getTime() <= limit).length,
  };
}

/** Stores the physical location on the product. `addressId: null` removes it. */
export async function assignProductAddress(productId: string, addressId: string | null) {
  await getProduct(productId);
  const updatedAt = new Date().toISOString();
  if (!addressId) {
    await query("UPDATE products SET doc = (doc - 'location') || $2::jsonb WHERE id = $1", [productId, json({ updatedAt })]);
    return getProduct(productId);
  }
  const address = await findById<WarehouseAddress>("warehouse_addresses", addressId);
  if (!address) throw new HttpError(404, "Endereço não encontrado");
  if (!address.active) throw new HttpError(400, "Endereço inativo");
  const { deposit, aisle, shelf, level, slot } = address;
  await merge("products", productId, { location: { deposit, aisle, shelf, level, slot }, updatedAt });
  return getProduct(productId);
}

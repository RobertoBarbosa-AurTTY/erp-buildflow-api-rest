// Goods receipts: one invoice (NF) adds stock to several products and may create new ones.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { docs, findById, insert, merge } from "../db.ts";
import { round2 } from "../lib/calc.ts";
import type { Product } from "../views/product.ts";
import type { ReceivingSummary, StockMovement } from "../views/stock.ts";
import { ProductInput, validateProduct } from "./product.ts";
import { recordMovement } from "./stock-movement.ts";

const SUPPLIER_PREFIX = "Entrada de mercadoria - ";

export const ReceivingInput = z
  .object({
    document: z.string().trim().min(1, "Informe o número da nota").meta({ examples: ["45871"] }),
    supplier: z.string().trim().min(1, "Informe o fornecedor"),
    issueDate: z.string().optional(),
    updateCost: z.boolean().meta({ description: "Updates the product cost price and supplier" }),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().optional().meta({ description: "Existing product. When missing, `newProduct` is created" }),
          newProduct: ProductInput.optional(),
          quantity: z.number().positive(),
          unitCost: z.number().min(0),
        }),
      )
      .min(1, "Adicione ao menos um item"),
  })
  .meta({ id: "ReceivingInput" });
export type ReceivingInput = z.infer<typeof ReceivingInput>;

export async function registerReceiving(input: ReceivingInput, userName: string) {
  for (const [index, item] of input.items.entries()) {
    if (!item.productId && !item.newProduct) throw new HttpError(400, `Item ${index + 1}: selecione um produto`);
    if (item.productId && !(await findById("products", item.productId))) {
      throw new HttpError(404, `Item ${index + 1}: produto não encontrado`);
    }
    if (item.newProduct) await validateProduct(item.newProduct);
  }

  const reference = `NF ${input.document}`;
  const reason = SUPPLIER_PREFIX + input.supplier;
  const movements: StockMovement[] = [];
  let createdProducts = 0;
  for (const item of input.items) {
    let productId = item.productId;
    if (!productId) {
      const product: Product = {
        ...item.newProduct!,
        _id: randomUUID(),
        quantity: 0,
        costPrice: item.unitCost,
        createdAt: new Date().toISOString(),
      };
      await insert("products", product);
      productId = product._id;
      createdProducts++;
    }
    if (input.updateCost && item.unitCost > 0) {
      await merge("products", productId, { costPrice: round2(item.unitCost), supplier: input.supplier });
    }
    movements.push(await recordMovement(productId, "ENTRADA", item.quantity, { reason, reference, userName }));
  }
  const total = round2(input.items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  return { reference, movements, createdProducts, total };
}

/** Receipts grouped by reference (invoice), newest first. */
export async function listReceivings(limit: number) {
  const entries = await docs<StockMovement>(
    `SELECT doc FROM stock_movements WHERE doc->>'type' = 'ENTRADA' AND doc ? 'reference' AND doc->>'reference' <> ''
     ORDER BY doc->>'timestamp' COLLATE "C" DESC`,
  );
  const groups = new Map<string, ReceivingSummary>();
  for (const m of entries) {
    const group = groups.get(m.reference!);
    if (group) {
      group.items++;
      group.units += m.quantity;
    } else {
      groups.set(m.reference!, {
        reference: m.reference!,
        supplier: m.reason?.replace(SUPPLIER_PREFIX, "") ?? "—",
        timestamp: m.timestamp,
        userName: m.userName,
        items: 1,
        units: m.quantity,
      });
    }
  }
  return [...groups.values()].slice(0, limit);
}

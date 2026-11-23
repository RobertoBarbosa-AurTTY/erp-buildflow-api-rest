// Stock movements, receivings (goods receipts) and warehouse addresses.
import { z } from "zod";
import { Id, IsoDate, Money } from "./common.ts";
import { Product, WarehouseLocation } from "./product.ts";

export const StockMovementType = z
  .enum(["ENTRADA", "SAIDA", "VENDA", "AJUSTE", "ESTORNO"])
  .meta({ id: "StockMovementType", description: "ENTRADA: in, SAIDA: out, VENDA: sale, AJUSTE: count, ESTORNO: sale reversal" });
export type StockMovementType = z.infer<typeof StockMovementType>;

export const StockMovement = z
  .object({
    _id: Id,
    productId: Id,
    sku: z.string(),
    productName: z.string(),
    type: StockMovementType,
    quantity: z.number().meta({ description: "Signed delta (negative = out)" }),
    previousQuantity: z.number(),
    newQuantity: z.number(),
    reason: z.string().optional(),
    reference: z.string().optional().meta({ examples: ["NF 45871", "Venda #1032"] }),
    userName: z.string().optional(),
    timestamp: IsoDate,
  })
  .meta({ id: "StockMovement" });
export type StockMovement = z.infer<typeof StockMovement>;

export const ReceivingResult = z
  .object({
    reference: z.string().meta({ examples: ["NF 45871"] }),
    movements: z.array(StockMovement),
    createdProducts: z.number(),
    total: Money,
  })
  .meta({ id: "ReceivingResult" });

export const ReceivingSummary = z
  .object({
    reference: z.string(),
    supplier: z.string(),
    timestamp: IsoDate,
    userName: z.string().optional(),
    items: z.number(),
    units: z.number(),
  })
  .meta({ id: "ReceivingSummary" });
export type ReceivingSummary = z.infer<typeof ReceivingSummary>;

export const WarehouseAddress = WarehouseLocation.extend({
  _id: Id,
  code: z.string().meta({ examples: ["D01-C-01-01-01"] }),
  description: z.string().optional(),
  capacity: z.number().optional(),
  active: z.boolean(),
  createdAt: IsoDate,
}).meta({ id: "WarehouseAddress" });
export type WarehouseAddress = z.infer<typeof WarehouseAddress>;

export const AddressWithProducts = WarehouseAddress.extend({
  products: z.array(Product.pick({ _id: true, name: true, sku: true, quantity: true, unit: true })),
}).meta({ id: "AddressWithProducts" });

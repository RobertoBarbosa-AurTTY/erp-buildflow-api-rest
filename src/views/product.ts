import { z } from "zod";
import { Id, IsoDate, Money } from "./common.ts";

export const WarehouseLocation = z
  .object({
    deposit: z.string().meta({ examples: ["DEPÓSITO 01"] }),
    aisle: z.string().meta({ examples: ["C"] }),
    shelf: z.string().meta({ examples: ["01"] }),
    level: z.string().meta({ examples: ["01"] }),
    slot: z.string().meta({ examples: ["01"] }),
  })
  .meta({ id: "WarehouseLocation", description: "Physical location inside the warehouse" });
export type WarehouseLocation = z.infer<typeof WarehouseLocation>;

export const ProductUnit = z.enum(["UN", "KG", "M", "M2", "M3", "L", "CX", "SC", "PC"]).meta({ id: "ProductUnit" });

export const StockStatus = z
  .enum(["ok", "low", "out", "over"])
  .meta({ id: "StockStatus", description: "out: quantity <= 0, low: <= minStock, over: > maxStock" });
export type StockStatus = z.infer<typeof StockStatus>;

export const Product = z
  .object({
    _id: Id,
    name: z.string().meta({ examples: ["Cimento CP-II 50kg"] }),
    sku: z.string().meta({ examples: ["MAT-001"] }),
    barcode: z.string().optional().meta({ description: "EAN-13 or any barcode", examples: ["7891234567893"] }),
    category: z.string().meta({ examples: ["Materiais"] }),
    brand: z.string().optional(),
    supplier: z.string().optional(),
    unit: ProductUnit,
    quantity: z.number().meta({ description: "Current stock. Changes only through stock movements" }),
    minStock: z.number(),
    maxStock: z.number().meta({ description: "0 = no maximum" }),
    price: Money.meta({ description: "Sale price" }),
    costPrice: Money.meta({ description: "Cost price" }),
    perishable: z.boolean(),
    expiryDate: IsoDate.optional(),
    location: WarehouseLocation.optional(),
    active: z.boolean(),
    createdAt: IsoDate,
    updatedAt: IsoDate.optional(),
  })
  .meta({ id: "Product" });
export type Product = z.infer<typeof Product>;

export const StockStats = z
  .object({
    totalItems: z.number().meta({ description: "Active products" }),
    totalUnits: z.number(),
    costValue: Money,
    saleValue: Money,
    lowStock: z.number(),
    outOfStock: z.number(),
    expiringSoon: z.number().meta({ description: "Perishables expiring within `expiryDays`" }),
  })
  .meta({ id: "StockStats" });
export type StockStats = z.infer<typeof StockStats>;

export const Category = z
  .object({ _id: Id, name: z.string().meta({ examples: ["Hidráulica"] }), color: z.string().optional() })
  .meta({ id: "Category" });
export type Category = z.infer<typeof Category>;

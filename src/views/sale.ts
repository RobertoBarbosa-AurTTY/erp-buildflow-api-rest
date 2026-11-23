import { z } from "zod";
import { DiscountType, Id, IsoDate, Money, PaymentMethod } from "./common.ts";
import { ProductUnit } from "./product.ts";

export const SaleItem = z
  .object({
    id: z.string().meta({ description: 'Product id, or "custom-*" for an item not in the catalog' }),
    sku: z.string(),
    name: z.string(),
    unit: ProductUnit,
    qty: z.number().positive(),
    price: z.number().min(0),
    discount: z.number().min(0),
    discountType: DiscountType,
  })
  .meta({ id: "SaleItem" });
export type SaleItem = z.infer<typeof SaleItem>;

export const SaleStatus = z
  .enum(["FINALIZED", "QUOTE", "CANCELLED"])
  .meta({ id: "SaleStatus", description: "FINALIZED: paid sale, QUOTE: quote (no stock/cash effect), CANCELLED" });
export type SaleStatus = z.infer<typeof SaleStatus>;

export const SplitPayment = z
  .object({
    cash: Money.meta({ description: "Part paid in cash" }),
    method: PaymentMethod,
    rest: Money.meta({ description: "Part paid with `method`" }),
  })
  .meta({ id: "SplitPayment" });
export type SplitPayment = z.infer<typeof SplitPayment>;

export const Sale = z
  .object({
    _id: Id,
    saleNumber: z.number().meta({ examples: [1032] }),
    items: z.array(SaleItem),
    grossSubtotal: Money,
    itemsDiscountTotal: Money,
    globalDiscount: z.number(),
    globalDiscountType: DiscountType,
    globalDiscountAmount: Money,
    totalDiscount: Money,
    total: Money,
    status: SaleStatus,
    paymentMethod: PaymentMethod,
    splitPayment: SplitPayment.nullable().optional(),
    amountPaid: Money.nullable().optional().meta({ description: "Cash handed by the customer" }),
    change: Money.nullable().optional(),
    customerId: Id.nullable().optional(),
    customerName: z.string().nullable().optional(),
    caixaId: Id.nullable().optional().meta({ description: "Cash session id" }),
    userName: z.string(),
    createdAt: IsoDate,
    cancelledAt: IsoDate.optional(),
    cancelReason: z.string().optional(),
  })
  .meta({ id: "Sale" });
export type Sale = z.infer<typeof Sale>;

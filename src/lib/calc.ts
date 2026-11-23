// Pure business calculations (same formulas as web/src/lib/domain/calc.ts on the front-end).
import type { BillStatus, DiscountType, PaymentMethod } from "../views/common.ts";
import type { Product, StockStatus } from "../views/product.ts";
import type { Sale, SaleItem } from "../views/sale.ts";

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function discountAmount(base: number, discount: number, type: DiscountType) {
  if (!discount || discount <= 0) return 0;
  return type === "value" ? Math.min(discount, base) : base * (Math.min(discount, 100) / 100);
}

export function lineTotals(item: Pick<SaleItem, "qty" | "price" | "discount" | "discountType">) {
  const gross = item.qty * item.price;
  const discount = discountAmount(gross, item.discount, item.discountType);
  return { gross, discount, total: Math.max(0, gross - discount) };
}

export function saleTotals(items: SaleItem[], globalDiscount = 0, globalDiscountType: DiscountType = "percent") {
  const lines = items.map(lineTotals);
  const grossSubtotal = lines.reduce((sum, l) => sum + l.gross, 0);
  const itemsDiscountTotal = lines.reduce((sum, l) => sum + l.discount, 0);
  const subtotal = grossSubtotal - itemsDiscountTotal;
  const globalDiscountAmount = discountAmount(subtotal, globalDiscount, globalDiscountType);
  return {
    grossSubtotal: round2(grossSubtotal),
    itemsDiscountTotal: round2(itemsDiscountTotal),
    subtotal: round2(subtotal),
    globalDiscountAmount: round2(globalDiscountAmount),
    totalDiscount: round2(itemsDiscountTotal + globalDiscountAmount),
    total: round2(Math.max(0, subtotal - globalDiscountAmount)),
  };
}

/** Amount received by each payment method (a split payment counts in both). */
export function saleAmountsByMethod(sale: Pick<Sale, "paymentMethod" | "splitPayment" | "total">) {
  const out: Partial<Record<PaymentMethod, number>> = {};
  if (sale.splitPayment) {
    out.Dinheiro = round2(sale.splitPayment.cash);
    out[sale.splitPayment.method] = round2((out[sale.splitPayment.method] ?? 0) + sale.splitPayment.rest);
  } else {
    out[sale.paymentMethod] = round2(sale.total);
  }
  return out;
}

export function stockStatus(product: Pick<Product, "quantity" | "minStock" | "maxStock">): StockStatus {
  if (product.quantity <= 0) return "out";
  if (product.quantity <= product.minStock) return "low";
  if (product.maxStock > 0 && product.quantity > product.maxStock) return "over";
  return "ok";
}

/** Whole days from today to `date` (negative = past). */
export function daysUntil(date: string | undefined) {
  if (!date) return Infinity;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Effective status: a pending bill past its due date is "overdue". */
export function billStatus(bill: { status: BillStatus; dueDate: string }): BillStatus {
  if (bill.status === "pending" && daysUntil(bill.dueDate) < 0) return "overdue";
  return bill.status;
}

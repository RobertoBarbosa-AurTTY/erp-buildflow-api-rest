// Replaces all data with the demo data. Used by `npm run seed` and POST /data/reset.
import { insert, query, setSequence, type Table } from "../db.ts";
import { hashPassword, type UserDocument } from "../models/user.ts";
import { DEFAULT_SETTINGS } from "../models/settings.ts";
import * as demo from "./data.ts";

const DEMO_USERS = [
  { _id: "u1", name: "Administrador Master", email: "admin@buildflow.com.br", password: "admin123", role: "Admin" },
  { _id: "u2", name: "Gerente da Loja", email: "gerente@buildflow.com.br", password: "gerente123", role: "Gerente" },
  { _id: "u3", name: "Operador de Caixa", email: "caixa@buildflow.com.br", password: "caixa123", role: "Operador" },
] as const;

async function replace(name: Table, docs: { _id: string }[]) {
  await query(`DELETE FROM ${name}`);
  await insert(name, docs);
}

export async function seedDatabase() {
  const users: UserDocument[] = [];
  for (const { password, ...user } of DEMO_USERS) {
    users.push({ ...user, passwordHash: await hashPassword(password), active: true });
  }
  const sales = demo.seedSales();
  const sessions = demo.seedCashSessions();

  await replace("users", users);
  await replace("products", demo.seedProducts());
  await replace("categories", demo.seedCategories());
  await replace("stock_movements", demo.seedStockMovements());
  await replace("warehouse_addresses", demo.seedWarehouseAddresses());
  await replace("customers", demo.seedCustomers());
  await replace("sales", sales);
  await replace("accounts_payable", demo.seedPayables());
  await replace("accounts_receivable", demo.seedReceivables());
  await replace("cash_sessions", sessions);
  await replace("cash_movements", demo.seedCashMovements());
  await replace("settings", [{ _id: "company", ...DEFAULT_SETTINGS }]);
  await setSequence("sales", Math.max(0, ...sales.map((s) => s.saleNumber)));
  await setSequence("cash_sessions", Math.max(0, ...sessions.map((s) => s.number)));

  return { users: users.length, products: demo.seedProducts().length, sales: sales.length };
}

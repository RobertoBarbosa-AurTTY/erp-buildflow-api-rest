// Company settings (single document `_id: "company"`) and demo data utilities.
import { HttpError } from "../core/http-error.ts";
import { collection } from "../db.ts";
import { isValidCnpj, isValidEmail, onlyDigits } from "../lib/text.ts";
import { CompanySettings } from "../views/settings.ts";

const SETTINGS_ID = "company";
const settings = () => collection<CompanySettings & { _id: string }>("settings");

/** Fields only Admin can change. Gerente can change the preferences (alerts, POS). */
export const COMPANY_FIELDS = [
  "companyName", "tradeName", "cnpj", "stateRegistration", "phone", "email", "address", "receiptFooter",
] as const;

export const DEFAULT_SETTINGS: CompanySettings = {
  companyName: "BuildFlow Materiais de Construção Ltda",
  tradeName: "BuildFlow Home",
  cnpj: "11222333000181",
  stateRegistration: "240000000",
  phone: "8232001000",
  email: "contato@buildflow.com.br",
  address: "Av. Durval de Góes Monteiro, 5000 - Tabuleiro, Maceió/AL",
  receiptFooter: "Obrigado pela preferência! Trocas em até 7 dias com o cupom.",
  lowStockAlert: true,
  expiryAlertDays: 30,
  defaultPaymentMethod: "PIX",
};

export const SettingsPatch = CompanySettings.partial().meta({ id: "SettingsPatch" });
export type SettingsPatch = Partial<CompanySettings>;

export async function getSettings(): Promise<CompanySettings> {
  const doc = await settings().findOne({ _id: SETTINGS_ID });
  const { _id: _, ...saved } = doc ?? { _id: SETTINGS_ID };
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function updateSettings(patch: SettingsPatch) {
  const next: CompanySettings = { ...(await getSettings()), ...patch };
  if (!next.companyName.trim()) throw new HttpError(400, "Razão social é obrigatória");
  if (!next.tradeName.trim()) throw new HttpError(400, "Nome fantasia é obrigatório");
  next.cnpj = onlyDigits(next.cnpj);
  if (!isValidCnpj(next.cnpj)) throw new HttpError(400, "CNPJ inválido");
  if (next.phone) next.phone = onlyDigits(next.phone);
  if (next.email && !isValidEmail(next.email)) throw new HttpError(400, "E-mail inválido");
  await settings().replaceOne({ _id: SETTINGS_ID }, next, { upsert: true });
  return next;
}

const EXPORTED_COLLECTIONS = [
  "products", "categories", "stock_movements", "warehouse_addresses", "customers", "sales",
  "accounts_payable", "accounts_receivable", "cash_sessions", "cash_movements", "settings",
];

/** Snapshot of all business collections (users are not exported). */
export async function exportData() {
  const data: Record<string, unknown[]> = {};
  for (const name of EXPORTED_COLLECTIONS) data[name] = await collection(name).find().toArray();
  return { app: "BuildFlow ERP", version: 1, exportedAt: new Date().toISOString(), data };
}

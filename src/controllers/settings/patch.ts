import { defineRoute } from "../../core/route.ts";
import { requireRole } from "../../core/auth.ts";
import { COMPANY_FIELDS, SettingsPatch, updateSettings } from "../../models/settings.ts";
import { CompanySettings } from "../../views/settings.ts";

export default defineRoute({
  summary: "Update company settings",
  description:
    "Partial update. Gerente can change the preferences (alerts, default payment method); " +
    "company data (name, CNPJ, contact, receipt footer) is Admin only.",
  tags: ["Settings"],
  access: ["Gerente"],
  body: SettingsPatch,
  response: CompanySettings,
  handler: ({ body, user }) => {
    if (COMPANY_FIELDS.some((field) => field in body)) requireRole(user, []);
    return updateSettings(body);
  },
});

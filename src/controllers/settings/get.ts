import { defineRoute } from "../../core/route.ts";
import { getSettings } from "../../models/settings.ts";
import { CompanySettings } from "../../views/settings.ts";

export default defineRoute({
  summary: "Get company settings",
  description: "Company data (receipt header, labels) and preferences (alerts, default payment method).",
  tags: ["Settings"],
  access: "auth",
  response: CompanySettings,
  handler: () => getSettings(),
});

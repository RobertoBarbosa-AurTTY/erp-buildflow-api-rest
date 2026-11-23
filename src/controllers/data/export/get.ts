import { defineRoute } from "../../../core/route.ts";
import { exportData } from "../../../models/settings.ts";
import { DataExport } from "../../../views/settings.ts";

export default defineRoute({
  summary: "Export all data",
  description: "JSON backup of every business collection (users are not included).",
  tags: ["Settings"],
  access: [],
  response: DataExport,
  handler: () => exportData(),
});

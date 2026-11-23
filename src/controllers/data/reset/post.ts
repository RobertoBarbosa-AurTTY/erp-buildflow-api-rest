import { z } from "zod";
import { config } from "../../../config.ts";
import { HttpError } from "../../../core/http-error.ts";
import { defineRoute } from "../../../core/route.ts";
import { seedDatabase } from "../../../seed/run-seed.ts";

export default defineRoute({
  summary: "Restore demo data",
  description: "**Erases all data** and loads the demo data. Only works when `ALLOW_DATA_RESET=true`.",
  tags: ["Settings"],
  access: [],
  response: z.object({ users: z.number(), products: z.number(), sales: z.number() }),
  handler: () => {
    if (!config.allowDataReset) throw new HttpError(403, "Restauração de dados desativada neste ambiente");
    return seedDatabase();
  },
});

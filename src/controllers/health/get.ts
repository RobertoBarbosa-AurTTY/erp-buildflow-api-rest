import { z } from "zod";
import { defineRoute } from "../../core/route.ts";

export default defineRoute({
  summary: "Health check",
  tags: ["System"],
  access: "public",
  response: z.object({ status: z.literal("ok"), time: z.string() }),
  handler: () => ({ status: "ok" as const, time: new Date().toISOString() }),
});

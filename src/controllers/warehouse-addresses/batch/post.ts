import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { AddressBatchInput, createAddressBatch } from "../../../models/address.ts";

export default defineRoute({
  summary: "Create warehouse addresses in batch",
  description: "Creates every aisle x shelf x level x slot combination. Existing codes are skipped. Max 2000.",
  tags: ["Warehouse addresses"],
  access: "auth",
  body: AddressBatchInput,
  status: 201,
  response: z.object({ created: z.number(), skipped: z.number() }),
  handler: ({ body }) => createAddressBatch(body),
});

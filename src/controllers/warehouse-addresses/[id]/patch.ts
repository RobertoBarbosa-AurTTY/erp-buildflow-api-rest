import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { setAddressActive } from "../../../models/address.ts";
import { WarehouseAddress } from "../../../views/stock.ts";

export default defineRoute({
  summary: "Activate or deactivate warehouse address",
  tags: ["Warehouse addresses"],
  access: "auth",
  params: z.object({ id: z.string() }),
  body: z.object({ active: z.boolean() }),
  response: WarehouseAddress,
  errors: [404],
  handler: ({ params, body }) => setAddressActive(params.id, body.active),
});

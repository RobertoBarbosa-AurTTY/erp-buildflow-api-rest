import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listAddresses } from "../../models/address.ts";
import { AddressWithProducts } from "../../views/stock.ts";

export default defineRoute({
  summary: "List warehouse addresses",
  description: "Sorted by code, each with the active products stored there.",
  tags: ["Warehouse addresses"],
  access: "auth",
  response: z.array(AddressWithProducts),
  handler: () => listAddresses(),
});

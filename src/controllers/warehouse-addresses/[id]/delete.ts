import { z } from "zod";
import { defineRoute } from "../../../core/route.ts";
import { deleteAddress } from "../../../models/address.ts";

export default defineRoute({
  summary: "Delete warehouse address",
  description: "Refused (409) while there are active products at this address.",
  tags: ["Warehouse addresses"],
  access: "auth",
  params: z.object({ id: z.string() }),
  errors: [404, 409],
  handler: ({ params }) => deleteAddress(params.id),
});

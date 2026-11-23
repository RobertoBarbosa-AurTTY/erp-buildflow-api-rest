import { defineRoute } from "../../core/route.ts";
import { AddressInput, createAddress } from "../../models/address.ts";
import { WarehouseAddress } from "../../views/stock.ts";

export default defineRoute({
  summary: "Create warehouse address",
  description: "Numbers are padded (`1` -> `01`) and the code is built as `D01-<aisle>-<shelf>-<level>-<slot>`.",
  tags: ["Warehouse addresses"],
  access: "auth",
  body: AddressInput,
  status: 201,
  response: WarehouseAddress,
  errors: [409],
  handler: ({ body }) => createAddress(body),
});

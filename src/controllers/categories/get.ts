import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { listCategories } from "../../models/category.ts";
import { Category } from "../../views/product.ts";

export default defineRoute({
  summary: "List categories",
  tags: ["Categories"],
  access: "auth",
  response: z.array(Category),
  handler: () => listCategories(),
});

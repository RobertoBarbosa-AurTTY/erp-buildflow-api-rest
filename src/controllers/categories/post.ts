import { z } from "zod";
import { defineRoute } from "../../core/route.ts";
import { createCategory } from "../../models/category.ts";
import { Category } from "../../views/product.ts";

export default defineRoute({
  summary: "Create category",
  description: "Idempotent: when a category with the same name exists (case/accent insensitive), it is returned.",
  tags: ["Categories"],
  access: "auth",
  body: z.object({ name: z.string().trim().min(1, "Informe o nome da categoria") }),
  status: 201,
  response: Category,
  handler: ({ body }) => createCategory(body.name),
});

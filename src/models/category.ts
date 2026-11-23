import { randomUUID } from "node:crypto";
import { collection } from "../db.ts";
import { byName, normalize } from "../lib/text.ts";
import type { Category } from "../views/product.ts";

const categories = () => collection<Category>("categories");

export async function listCategories() {
  return (await categories().find().toArray()).sort(byName);
}

/** Returns the existing category when the name already exists (case/accent insensitive). */
export async function createCategory(name: string) {
  const existing = (await categories().find().toArray()).find((c) => normalize(c.name) === normalize(name));
  if (existing) return existing;
  const category: Category = { _id: randomUUID(), name };
  await categories().insertOne(category);
  return category;
}

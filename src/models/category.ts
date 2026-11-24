import { randomUUID } from "node:crypto";
import { docs, insert } from "../db.ts";
import { byName, normalize } from "../lib/text.ts";
import type { Category } from "../views/product.ts";

const categories = () => docs<Category>("SELECT doc FROM categories");

export async function listCategories() {
  return (await categories()).sort(byName);
}

/** Returns the existing category when the name already exists (case/accent insensitive). */
export async function createCategory(name: string) {
  const existing = (await categories()).find((c) => normalize(c.name) === normalize(name));
  if (existing) return existing;
  const category: Category = { _id: randomUUID(), name };
  await insert("categories", category);
  return category;
}

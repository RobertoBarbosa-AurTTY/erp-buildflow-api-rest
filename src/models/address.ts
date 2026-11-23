// Warehouse addresses (deposit / aisle / shelf / level / slot).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../core/http-error.ts";
import { collection } from "../db.ts";
import { normalize } from "../lib/text.ts";
import type { WarehouseLocation } from "../views/product.ts";
import type { WarehouseAddress } from "../views/stock.ts";
import { products } from "./product.ts";

const addresses = () => collection<WarehouseAddress>("warehouse_addresses");

export const AddressInput = z
  .object({
    deposit: z.string().meta({ examples: ["DEPÓSITO 01"] }),
    aisle: z.string().meta({ examples: ["C"] }),
    shelf: z.string().meta({ examples: ["1"] }),
    level: z.string().meta({ examples: ["1"] }),
    slot: z.string().meta({ examples: ["1"] }),
    description: z.string().optional(),
    capacity: z.number().min(0).optional(),
  })
  .meta({ id: "AddressInput" });
export type AddressInput = z.infer<typeof AddressInput>;

export const AddressBatchInput = z
  .object({
    deposit: z.string(),
    aisles: z.array(z.string()).min(1, "Informe ao menos um corredor"),
    shelves: z.number().int().min(1),
    levels: z.number().int().min(1),
    slots: z.number().int().min(1),
    capacity: z.number().min(0).optional(),
  })
  .meta({ id: "AddressBatchInput", description: "Creates every combination aisle x shelf x level x slot (max 2000)" });
export type AddressBatchInput = z.infer<typeof AddressBatchInput>;

/** D01-C-01-01-01 */
export function locationCode(location: WarehouseLocation) {
  const deposit = location.deposit.match(/\d+/)?.[0]?.padStart(2, "0") ?? "01";
  return [`D${deposit}`, location.aisle, location.shelf, location.level, location.slot].filter(Boolean).join("-");
}

function sameLocation(a: WarehouseLocation | undefined, b: WarehouseLocation) {
  return (
    !!a &&
    a.aisle === b.aisle &&
    a.shelf === b.shelf &&
    a.level === b.level &&
    a.slot === b.slot &&
    normalize(a.deposit) === normalize(b.deposit)
  );
}

const pad2 = (value: string) => {
  const clean = value.trim().toUpperCase();
  return /^\d+$/.test(clean) ? clean.padStart(2, "0") : clean;
};

function buildAddress(input: AddressInput): WarehouseAddress {
  const location: WarehouseLocation = {
    deposit: input.deposit.trim().toUpperCase() || "DEPÓSITO 01",
    aisle: input.aisle.trim().toUpperCase(),
    shelf: pad2(input.shelf),
    level: pad2(input.level),
    slot: pad2(input.slot),
  };
  if (!location.aisle || !location.shelf || !location.level || !location.slot) {
    throw new HttpError(400, "Preencha corredor, prateleira, nível e posição");
  }
  return {
    ...location,
    _id: randomUUID(),
    code: locationCode(location),
    description: input.description?.trim() || undefined,
    capacity: input.capacity,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

export async function listAddresses() {
  const [list, active] = await Promise.all([
    addresses().find().sort({ code: 1 }).toArray(),
    products().find({ active: true }, { projection: { name: 1, sku: 1, quantity: 1, unit: 1, location: 1 } }).toArray(),
  ]);
  return list.map((address) => ({
    ...address,
    products: active
      .filter((p) => sameLocation(p.location, address))
      .map(({ _id, name, sku, quantity, unit }) => ({ _id, name, sku, quantity, unit })),
  }));
}

export async function createAddress(input: AddressInput) {
  const address = buildAddress(input);
  if (await addresses().findOne({ code: address.code })) throw new HttpError(409, `O endereço ${address.code} já existe`);
  await addresses().insertOne(address);
  return address;
}

export async function createAddressBatch(input: AddressBatchInput) {
  const total = input.aisles.length * input.shelves * input.levels * input.slots;
  if (total > 2000) throw new HttpError(400, "Limite de 2.000 endereços por lote");
  const existing = new Set((await addresses().find({}, { projection: { code: 1 } }).toArray()).map((a) => a.code));
  const created: WarehouseAddress[] = [];
  let skipped = 0;
  for (const aisle of input.aisles) {
    for (let shelf = 1; shelf <= input.shelves; shelf++) {
      for (let level = 1; level <= input.levels; level++) {
        for (let slot = 1; slot <= input.slots; slot++) {
          const address = buildAddress({
            deposit: input.deposit,
            aisle,
            shelf: String(shelf),
            level: String(level),
            slot: String(slot),
            capacity: input.capacity,
          });
          if (existing.has(address.code)) {
            skipped++;
            continue;
          }
          existing.add(address.code);
          created.push(address);
        }
      }
    }
  }
  if (created.length) await addresses().insertMany(created);
  return { created: created.length, skipped };
}

export async function setAddressActive(id: string, active: boolean) {
  const address = await addresses().findOneAndUpdate({ _id: id }, { $set: { active } }, { returnDocument: "after" });
  if (!address) throw new HttpError(404, "Endereço não encontrado");
  return address;
}

export async function deleteAddress(id: string) {
  const address = await addresses().findOne({ _id: id });
  if (!address) throw new HttpError(404, "Endereço não encontrado");
  const stored = await products().find({ active: true, location: { $exists: true } }).toArray();
  if (stored.some((p) => sameLocation(p.location, address))) {
    throw new HttpError(409, "Há produtos neste endereço. Mova-os antes de excluir.");
  }
  await addresses().deleteOne({ _id: id });
}

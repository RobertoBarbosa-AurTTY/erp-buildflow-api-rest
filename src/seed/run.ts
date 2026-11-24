// npm run seed
import "../config.ts";
import { connect, disconnect, ensureSchema } from "../db.ts";
import { seedDatabase } from "./run-seed.ts";

await connect();
await ensureSchema();
const result = await seedDatabase();
console.log("Demo data loaded:", result);
console.log("Logins: admin@buildflow.com.br / admin123, gerente@buildflow.com.br / gerente123, caixa@buildflow.com.br / caixa123");
await disconnect();

import { config } from "./config.ts";
import { createApp } from "./app.ts";
import { connect, disconnect, ensureIndexes } from "./db.ts";

await connect();
await ensureIndexes();
const { app, routes } = await createApp();

const server = app.listen(config.port, () => {
  console.log(`BuildFlow API on http://localhost:${config.port}/api (${routes.length} routes)`);
  console.log(`Swagger UI on http://localhost:${config.port}/docs`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => disconnect().then(() => process.exit(0)));
  });
}

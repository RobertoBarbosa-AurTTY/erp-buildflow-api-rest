// Express application: middlewares, Swagger UI and the file-based routes under /api.
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { config } from "./config.ts";
import { HttpError } from "./core/http-error.ts";
import { buildOpenApi } from "./core/openapi.ts";
import { createRouter, loadRoutes } from "./core/router.ts";

// Validation messages in Portuguese: the front-end shows them to the user.
z.config(z.locales.pt());

const CONTROLLERS_DIR = path.join(import.meta.dirname, "controllers");

export async function createApp() {
  const routes = await loadRoutes(CONTROLLERS_DIR);
  const spec = buildOpenApi(routes);
  const app = express();

  app.use(cors({ origin: config.corsOrigin.includes("*") ? true : config.corsOrigin }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/openapi.json", (_req, res) => {
    res.json(spec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "BuildFlow API" }));
  app.get("/", (_req, res) => res.redirect("/docs"));

  app.use("/api", createRouter(routes));
  app.use(() => {
    throw new HttpError(404, "Rota não encontrada");
  });
  app.use(errorHandler);

  return { app, routes };
}

function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
  } else if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON inválido no corpo da requisição" });
  } else if (err?.code === 11000) {
    res.status(409).json({ error: "Registro duplicado" });
  } else {
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}

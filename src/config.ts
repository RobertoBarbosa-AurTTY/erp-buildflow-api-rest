// Environment configuration. Values come from .env (optional) and the process environment.
try {
  process.loadEnvFile();
} catch {
  // no .env file: use the process environment only
}

process.env.TZ ||= "America/Maceio";

export const config = {
  port: Number(process.env.PORT) || 3333,
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/buildflow",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  corsOrigin: (process.env.CORS_ORIGIN || "*").split(",").map((origin) => origin.trim()),
  allowDataReset: process.env.ALLOW_DATA_RESET === "true",
};

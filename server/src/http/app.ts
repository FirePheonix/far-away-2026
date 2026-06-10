import cors from "cors";
import express from "express";
import { statusResponseSchema } from "../schemas/landing.js";

export function createHttpApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    const payload = statusResponseSchema.parse({
      message: "Express API is healthy",
      version: "0.1.0",
      healthy: true,
    });

    res.json(payload);
  });

  return app;
}

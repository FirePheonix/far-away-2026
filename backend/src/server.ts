import cors from "cors";
import express from "express";
import { serve } from "inngest/express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { assistantRouter } from "./routes/assistant.routes.js";
import { inngest } from "./workflows/inngest.js";
import { inngestFunctions } from "./workflows/assistant.workflow.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  app.use("/api", assistantRouter);

  app.use(
    "/api/inngest",
    serve({
      client: inngest,
      functions: inngestFunctions,
      signingKey: env.INNGEST_SIGNING_KEY,
    }),
  );

  app.use(errorHandler);

  return app;
}

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Assistant backend listening on http://localhost:${env.PORT}`);
  console.log(`  POST /api/assistant`);
  console.log(`  Inngest endpoint: http://localhost:${env.PORT}/api/inngest`);
});

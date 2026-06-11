import { Router } from "express";
import { postAssistant, getTools, getHealth } from "../controllers/assistant.controller.js";
import { validate } from "../middleware/validate.js";
import { assistantRequestSchema } from "../ai/schemas.js";

export const assistantRouter = Router();

assistantRouter.get("/health", getHealth);
assistantRouter.get("/tools", getTools);
assistantRouter.post(
  "/assistant",
  validate(assistantRequestSchema, "body"),
  postAssistant,
);

import { Router } from "express";
import {
  getAssistantRequestStatus,
  getHealth,
  getTools,
  postAssistant,
  getPendingTasks,
  submitPendingTask,
} from "../controllers/assistant.controller.js";
import { validate } from "../middleware/validate.js";
import { assistantRequestSchema } from "../ai/schemas.js";

export const assistantRouter = Router();

assistantRouter.get("/health", getHealth);
assistantRouter.get("/tools", getTools);
assistantRouter.get("/assistant/requests/:requestId", getAssistantRequestStatus);
assistantRouter.get("/assistant/tasks", getPendingTasks);
assistantRouter.post("/assistant/tasks/:taskId/submit", submitPendingTask);
assistantRouter.post(
  "/assistant",
  validate(assistantRequestSchema, "body"),
  postAssistant,
);

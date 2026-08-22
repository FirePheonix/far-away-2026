import { Router } from "express";
import {
  getAssistantRequestStatus,
  getHealth,
  getTools,
  postAssistant,
  getPendingTasks,
  submitPendingTask,
  skipPendingTask,
  abandonPendingTask,
  editPendingTask,
  abandonAssistantRunHandler,
} from "../controllers/assistant.controller.js";
import { validate } from "../middleware/validate.js";
import { assistantRequestSchema } from "../ai/schemas.js";

export const assistantRouter = Router();

assistantRouter.get("/health", getHealth);
assistantRouter.get("/tools", getTools);
assistantRouter.get("/assistant/requests/:requestId", getAssistantRequestStatus);

// Pending task actions
assistantRouter.get("/assistant/tasks", getPendingTasks);
assistantRouter.post("/assistant/tasks/:taskId/submit", submitPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/skip", skipPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/abandon", abandonPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/edit", editPendingTask);

// Run-level abandonment (kills the whole workflow via cancelOn)
assistantRouter.post("/assistant/runs/:runId/abandon", abandonAssistantRunHandler);

assistantRouter.post(
  "/assistant",
  validate(assistantRequestSchema, "body"),
  postAssistant,
);

import { Router } from "express";
import {
  getAssistantRequestStatus,
  getAssistantRequestTrace,
  getClosureReasons,
  getHealth,
  getTools,
  getUnresolved,
  postAssistant,
  getPendingTasks,
  submitPendingTask,
  skipPendingTask,
  abandonPendingTask,
  editPendingTask,
  pausePendingTask,
  decidePendingTask,
  abandonAssistantRunHandler,
  getFailureAdvice,
} from "../controllers/assistant.controller.js";
import { validate } from "../middleware/validate.js";
import { assistantRequestSchema } from "../ai/schemas.js";

export const assistantRouter = Router();

assistantRouter.get("/health", getHealth);
assistantRouter.get("/tools", getTools);
assistantRouter.get("/assistant/requests/:requestId", getAssistantRequestStatus);

// Live agent flow for one request — which tool is running, what failed, why
assistantRouter.get("/assistant/requests/:requestId/trace", getAssistantRequestTrace);

// Handback inbox and the reason vocabulary the desktop renders as chips
assistantRouter.get("/assistant/unresolved", getUnresolved);
assistantRouter.get("/assistant/closure-reasons", getClosureReasons);

// Pending task actions
assistantRouter.get("/assistant/tasks", getPendingTasks);
assistantRouter.post("/assistant/tasks/:taskId/submit", submitPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/skip", skipPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/abandon", abandonPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/edit", editPendingTask);
assistantRouter.post("/assistant/tasks/:taskId/pause", pausePendingTask);
assistantRouter.post("/assistant/tasks/:taskId/decide", decidePendingTask);
assistantRouter.post("/assistant/tasks/:taskId/advice", getFailureAdvice);

// Run-level abandonment (kills the whole workflow via cancelOn)
assistantRouter.post("/assistant/runs/:runId/abandon", abandonAssistantRunHandler);

assistantRouter.post(
  "/assistant",
  validate(assistantRequestSchema, "body"),
  postAssistant,
);

import { Router } from "express";
import { getPendingTasks, resolvePendingTask } from "../controllers/tasks.controller.js";
import { requireClerkAuth } from "../middleware/auth.js";

export const tasksRouter = Router();

tasksRouter.get("/tasks", requireClerkAuth, getPendingTasks);
tasksRouter.post("/tasks/:id/resolve", requireClerkAuth, resolvePendingTask);

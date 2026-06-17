import type { NextFunction, Request, Response } from "express";
import { db } from "../config/db.js";
import { AppError } from "../utils/errors.js";

function requireUserId(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }
  return userId;
}

export async function getPendingTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);

    const tasks = db.prepare(`
      SELECT id, run_id, description, required_fields, status, resolved_data, created_at, updated_at
      FROM pending_tasks
      WHERE clerk_user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    res.json({
      success: true,
      tasks: tasks.map(t => ({
        ...t,
        required_fields: JSON.parse(t.required_fields),
        resolved_data: t.resolved_data ? JSON.parse(t.resolved_data) : null,
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function resolvePendingTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    const taskId = req.params.id;
    const { resolvedData } = req.body;

    const task = db.prepare(`SELECT id, status FROM pending_tasks WHERE id = ? AND clerk_user_id = ?`).get(taskId, userId) as any;
    if (!task) {
      throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
    }

    if (task.status !== "pending") {
      throw new AppError("Task is not pending", 400, "TASK_NOT_PENDING");
    }

    db.prepare(`
      UPDATE pending_tasks
      SET status = 'resolved', resolved_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(resolvedData), taskId);

    // In a real implementation, this would emit an event or resume the workflow
    // For now, we'll just update the status

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

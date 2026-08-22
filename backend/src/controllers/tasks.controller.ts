import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase.js";
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

    const { data: tasks, error } = await supabaseAdmin
      .from("pending_tasks")
      .select("id, run_id, description, required_fields, status, resolved_data, created_at, updated_at")
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError("Failed to load pending tasks", 500, "DB_ERROR", error);
    }

    res.json({ success: true, tasks: tasks ?? [] });
  } catch (err) {
    next(err);
  }
}

export async function resolvePendingTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    const taskId = req.params.id;
    const { resolvedData } = req.body;

    const { data: task, error: loadError } = await supabaseAdmin
      .from("pending_tasks")
      .select("id, status")
      .eq("id", taskId)
      .eq("clerk_user_id", userId)
      .maybeSingle();

    if (loadError) {
      throw new AppError("Failed to load pending task", 500, "DB_ERROR", loadError);
    }

    if (!task) {
      throw new AppError("Task not found", 404, "TASK_NOT_FOUND");
    }

    if (task.status !== "pending") {
      throw new AppError("Task is not pending", 400, "TASK_NOT_PENDING");
    }

    const { error: updateError } = await supabaseAdmin
      .from("pending_tasks")
      .update({
        status: "resolved",
        resolved_data: resolvedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (updateError) {
      throw new AppError("Failed to resolve pending task", 500, "DB_ERROR", updateError);
    }

    // In a real implementation, this would emit an event or resume the workflow
    // For now, we'll just update the status

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

import { Router } from "express";
import {
  getObsidianPending,
  postObsidianResult,
} from "../controllers/obsidian.controller.js";

export const obsidianRouter = Router();

// Desktop app polls for pending Obsidian file operations
obsidianRouter.get("/obsidian/pending", getObsidianPending);

// Desktop app posts the result of a local Obsidian file operation
obsidianRouter.post("/obsidian/:requestId/result", postObsidianResult);

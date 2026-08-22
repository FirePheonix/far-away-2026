import { Router } from "express";
import { listKb, lookupKb, upsertKb, deleteKb } from "../controllers/kb.controller.js";

export const kbRouter = Router();

kbRouter.get("/kb", listKb);
kbRouter.get("/kb/lookup", lookupKb);
kbRouter.post("/kb", upsertKb);
kbRouter.delete("/kb/:id", deleteKb);

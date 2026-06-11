import OpenAI from "openai";
import { env } from "../config/env.js";
import { PlannerError } from "../utils/errors.js";
import {
  buildPlannerUserPrompt,
  PLANNER_EXAMPLES,
  PLANNER_SYSTEM_PROMPT,
} from "./prompts.js";
import { executionPlanSchema, type ExecutionPlanInput } from "./schemas.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? "missing-key",
});

export async function createPlan(transcript: string): Promise<ExecutionPlanInput> {
  if (!env.OPENAI_API_KEY) {
    throw new PlannerError("OPENAI_API_KEY is not configured");
  }
  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      ...PLANNER_EXAMPLES.flatMap((ex) => [
        { role: "user" as const, content: ex.input },
        { role: "assistant" as const, content: JSON.stringify(ex.output) },
      ]),
      { role: "user", content: buildPlannerUserPrompt(transcript) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new PlannerError("Planner returned empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PlannerError("Planner returned invalid JSON", { raw: content });
  }

  const result = executionPlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new PlannerError("Planner output failed schema validation", {
      errors: result.error.flatten(),
      raw: parsed,
    });
  }

  return result.data;
}

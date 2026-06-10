import { z } from "zod";

export const statusResponseSchema = z.object({
  message: z.string(),
  version: z.string(),
  healthy: z.boolean(),
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;

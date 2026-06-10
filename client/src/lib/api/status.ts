import "server-only";

import {
  statusResponseSchema,
  type StatusResponse,
} from "@/lib/schemas/landing";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function fetchLandingStatus(): Promise<StatusResponse> {
  const response = await fetch(`${API_URL}/health`, {
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`API responded with ${response.status}`);
  }

  return statusResponseSchema.parse(await response.json());
}

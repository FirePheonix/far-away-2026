import { z } from "zod";
import { db } from "../config/db.js";
import { decryptSecret } from "../utils/crypto.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";

export const githubTool: AnyToolDefinition = {
  name: "github_create_issue",
  description: "Create an issue in a GitHub repository.",
  paramsSchema: z.object({
    owner: z.string().describe("The account owner of the repository. The name is not case sensitive."),
    repo: z.string().describe("The name of the repository without the .git extension. The name is not case sensitive."),
    title: z.string().describe("The title of the issue."),
    body: z.string().optional().describe("The contents of the issue.")
  }),
  resultSchema: z.object({
    message: z.string(),
    issueUrl: z.string().optional(),
    issueNumber: z.number().optional(),
  }),
  execute: async (params: { owner: string; repo: string; title: string; body?: string }, context: ExecutionContext) => {
    if (!context.user?.clerkUserId) {
      throw new Error("Missing user context");
    }

    const conn = db.prepare(`
      SELECT id FROM oauth_connections 
      WHERE clerk_user_id = ? AND provider = 'github'
    `).get(context.user.clerkUserId) as any;

    if (!conn) {
      throw new Error("GitHub is not connected. User must connect GitHub first.");
    }

    const tokenRow = db.prepare(`
      SELECT access_token_enc FROM oauth_tokens 
      WHERE connection_id = ?
    `).get(conn.id) as any;

    if (!tokenRow?.access_token_enc) {
      throw new Error("GitHub access token missing.");
    }

    const accessToken = decryptSecret(tokenRow.access_token_enc);

    const resp = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body
      })
    });

    const data = await resp.json();
    
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${data.message || JSON.stringify(data)}`);
    }

    return {
      message: "Issue created successfully",
      issueUrl: data.html_url,
      issueNumber: data.number
    };
  },
};

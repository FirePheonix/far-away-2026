import { z } from "zod";
import { db } from "../config/db.js";
import { decryptSecret } from "../utils/crypto.js";
import type { AnyToolDefinition } from "./types.js";
import type { ExecutionContext } from "../types/index.js";

export const notionTool: AnyToolDefinition = {
  name: "notion_create_page",
  description: "Create a page in a Notion database or as a child of another page.",
  paramsSchema: z.object({
    parentId: z.string().describe("The ID of the parent database or page. Note: the assistant may need to ask the user for this ID via pending tasks if it doesn't know it."),
    parentType: z.enum(["database_id", "page_id"]).describe("The type of parent."),
    title: z.string().describe("The title of the new page."),
    content: z.string().optional().describe("The text content to place inside the page.")
  }),
  resultSchema: z.object({
    message: z.string(),
    pageUrl: z.string().optional(),
    pageId: z.string().optional(),
  }),
  execute: async (params: { parentId: string; parentType: "database_id" | "page_id"; title: string; content?: string }, context: ExecutionContext) => {
    if (!context.user?.clerkUserId) {
      throw new Error("Missing user context");
    }

    const conn = db.prepare(`
      SELECT id FROM oauth_connections 
      WHERE clerk_user_id = ? AND provider = 'notion'
    `).get(context.user.clerkUserId) as any;

    if (!conn) {
      throw new Error("Notion is not connected. User must connect Notion first.");
    }

    const tokenRow = db.prepare(`
      SELECT access_token_enc FROM oauth_tokens 
      WHERE connection_id = ?
    `).get(conn.id) as any;

    if (!tokenRow?.access_token_enc) {
      throw new Error("Notion access token missing.");
    }

    const accessToken = decryptSecret(tokenRow.access_token_enc);

    const parent = { [params.parentType]: params.parentId };

    const bodyPayload: any = {
      parent,
      properties: {
        title: {
          title: [
            {
              text: {
                content: params.title
              }
            }
          ]
        }
      }
    };

    if (params.content) {
      bodyPayload.children = [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: params.content
                }
              }
            ]
          }
        }
      ];
    }

    const resp = await fetch(`https://api.notion.com/v1/pages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28"
      },
      body: JSON.stringify(bodyPayload)
    });

    const data = await resp.json();
    
    if (!resp.ok) {
      throw new Error(`Notion API error: ${data.message || JSON.stringify(data)}`);
    }

    return {
      message: "Page created successfully",
      pageUrl: data.url,
      pageId: data.id
    };
  },
};

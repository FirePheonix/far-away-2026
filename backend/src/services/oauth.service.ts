import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export function buildIntegrationAuthUrl(provider: string, state: string): string {
  if (provider === "slack") {
    if (!env.SLACK_CLIENT_ID || !env.SLACK_REDIRECT_URI) {
      throw new AppError("Slack OAuth env incomplete", 500, "OAUTH_CONFIG_ERROR");
    }
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      scope: "chat:write,channels:read",
      user_scope: "search:read",
      redirect_uri: env.SLACK_REDIRECT_URI,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  if (provider === "github") {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_REDIRECT_URI) {
      throw new AppError("GitHub OAuth env incomplete", 500, "OAUTH_CONFIG_ERROR");
    }
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_REDIRECT_URI,
      scope: "repo",
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  if (provider === "notion") {
    if (!env.NOTION_CLIENT_ID || !env.NOTION_REDIRECT_URI) {
      throw new AppError("Notion OAuth env incomplete", 500, "OAUTH_CONFIG_ERROR");
    }
    const params = new URLSearchParams({
      client_id: env.NOTION_CLIENT_ID,
      redirect_uri: env.NOTION_REDIRECT_URI,
      response_type: "code",
      owner: "user",
      state,
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  throw new AppError("Unknown provider", 400, "UNKNOWN_PROVIDER");
}

export async function exchangeIntegrationCode(provider: string, code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  providerUserId: string;
}> {
  if (provider === "slack") {
    const resp = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID!,
        client_secret: env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: env.SLACK_REDIRECT_URI!,
      }),
    });
    const data = await resp.json();
    if (!data.ok) {
      throw new AppError("Slack token exchange failed", 500, "OAUTH_EXCHANGE_ERROR", data);
    }
    return {
      accessToken: data.access_token || data.authed_user?.access_token,
      tokenType: data.token_type,
      providerUserId: data.authed_user?.id || data.team?.id,
    };
  }

  if (provider === "github") {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID!,
        client_secret: env.GITHUB_CLIENT_SECRET!,
        code,
        redirect_uri: env.GITHUB_REDIRECT_URI!,
      }),
    });
    const data = await resp.json();
    if (data.error) {
      throw new AppError("GitHub token exchange failed", 500, "OAUTH_EXCHANGE_ERROR", data);
    }
    
    // Fetch user info to get provider user ID
    const userResp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userData = await userResp.json();

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
      providerUserId: userData.id.toString(),
    };
  }

  if (provider === "notion") {
    const encodedCredentials = Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString("base64");
    const resp = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedCredentials}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.NOTION_REDIRECT_URI!,
      }),
    });
    const data = await resp.json();
    if (data.error) {
      throw new AppError("Notion token exchange failed", 500, "OAUTH_EXCHANGE_ERROR", data);
    }
    
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      providerUserId: data.owner?.user?.id || data.workspace_id,
    };
  }

  throw new AppError("Unknown provider", 400, "UNKNOWN_PROVIDER");
}

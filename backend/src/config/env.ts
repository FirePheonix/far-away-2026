import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().default(4001),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_APP_ID: z.string().default("far-away-assistant"),

  CLERK_SECRET_KEY: z.string().optional(),
  ASSISTANT_DEFAULT_CLERK_USER_ID: z.string().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  FRONTEND_URL: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),

  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),

  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  GMAIL_SENDER_EMAIL: z.string().optional(),

  GOOGLE_MOCK_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validation guidance for missing environment variables
 */
const ENV_GUIDANCE: Record<string, string> = {
  OPENAI_API_KEY:
    "Get from https://platform.openai.com/api-keys\n    Required for AI planning and workflow generation",
  CLERK_SECRET_KEY:
    "Get from https://dashboard.clerk.com\n    Required for user authentication",
  SUPABASE_URL:
    "Get from https://supabase.com - your project dashboard\n    Required for database and user data storage",
  SUPABASE_SERVICE_ROLE_KEY:
    "Get from Supabase project settings > API keys\n    Required for backend database operations",
  TOKEN_ENCRYPTION_KEY:
    "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n    Required for encrypting OAuth tokens",
  GOOGLE_OAUTH_CLIENT_ID:
    "Get from https://console.cloud.google.com\n    Required for user Google Workspace access",
  GOOGLE_OAUTH_CLIENT_SECRET:
    "Get from https://console.cloud.google.com\n    Required for user Google Workspace access",
  GOOGLE_OAUTH_REDIRECT_URI:
    "Set in Google Cloud Console > OAuth consent screen\n    Should match: http://localhost:4001/api/auth/google/callback",
  INNGEST_EVENT_KEY:
    "Get from https://app.inngest.com\n    Required for async workflow queue in production",
  INNGEST_SIGNING_KEY:
    "Get from https://app.inngest.com\n    Required for async workflow queue in production",
};

/**
 * Critical variables that must be present for production
 */
const PRODUCTION_REQUIRED = [
  "OPENAI_API_KEY",
  "CLERK_SECRET_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
];

function formatValidationError(errors: Record<string, unknown>): string {
  const messages: string[] = [];

  for (const [key, value] of Object.entries(errors)) {
    if (Array.isArray(value) && value.length > 0) {
      messages.push(`\n❌ ${key}`);
      const guidance = ENV_GUIDANCE[key];
      if (guidance) {
        messages.push(`   ${guidance}`);
      } else {
        messages.push(`   Please set this environment variable in .env`);
      }
    }
  }

  return messages.join("\n");
}

function validateProductionRequirements(parsed: Env): void {
  const missing: string[] = [];

  if (process.env.NODE_ENV === "production") {
    for (const key of PRODUCTION_REQUIRED) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      console.error(
        `\n⚠️  PRODUCTION MODE: Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n`,
      );
      throw new Error(
        `Production deployment requires: ${missing.join(", ")}\n\nPlease configure these variables before deploying.`,
      );
    }
  }
}

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const formatted = formatValidationError(fieldErrors as Record<string, unknown>);

    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ Environment Configuration Error");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(formatted);
    console.error("\n📖 Setup Guide:");
    console.error("   1. Copy backend/.env.example to backend/.env");
    console.error("   2. Fill in each required variable");
    console.error("   3. For local development, you can use GOOGLE_MOCK_MODE=true");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    throw new Error("Environment validation failed - see details above");
  }

  validateProductionRequirements(result.data);
  return result.data;
}

export const env = parseEnv();

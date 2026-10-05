import "dotenv/config";
import { z } from "zod";

const bool = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8000),
  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: z.string().min(2),
  GROQ_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
  GROQ_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  BACKEND_BASE_URL: z.string().url().default("http://localhost:5000"),
  BACKEND_API_PREFIX: z.string().default("/api/v1"),
  BACKEND_TIMEOUT_MS: z.coerce.number().default(15000),
  AGENT_SERVICE_TOKEN: z.string().min(16),
  SMS_LANGUAGE: z.enum(["en", "ur", "roman_ur"]).default("en"),
  AGENT_EVENTS_ENABLED: bool,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Sirf key ke naam print hote hain, values kabhi nahi.
  const keys = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
  console.error(`Invalid or missing environment variables: ${keys.join(", ")}`);
  process.exit(1);
}

export const config = parsed.data;
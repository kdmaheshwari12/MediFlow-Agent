import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  DATABASE_URL: z.string().url(),
  SMS_PROVIDER: z.string().default('mock'),
  GROQ_API_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  AGENT_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  AGENT_SERVICE_TOKEN: z.string().min(16).default('039d48ab38334f9049d8b76ac5eccb9842eaf1e57186eb597d2c708f2bd0e56c'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missingKeys = [...new Set(parsed.error.issues.map(i => i.path.join('.')))].join(', ');
  console.error(`Missing or invalid environment variables: ${missingKeys}`);
  process.exit(1);
}

export const env = parsed.data;


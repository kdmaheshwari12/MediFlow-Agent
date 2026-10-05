import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import { config } from "../config";
import { AgentError } from "../lib/errors";

let llm: ChatGroq | null = null;

export function getLlm(): ChatGroq {
  llm ??= new ChatGroq({
    apiKey: config.GROQ_API_KEY,
    model: config.GROQ_MODEL,
    temperature: config.GROQ_TEMPERATURE,
    maxTokens: config.GROQ_MAX_TOKENS,
    maxRetries: 2, // 429/5xx par retry
  });
  return llm;
}

// Structured JSON output; zod se validate; ek baar dobara koshish.
export async function structured<T extends z.ZodTypeAny>(
  schema: T,
  name: string,
  system: string,
  user: string,
): Promise<z.infer<T>> {
  const model = getLlm().withStructuredOutput(schema as z.ZodTypeAny, { name });
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await model.invoke([new SystemMessage(system), new HumanMessage(user)]);
      return schema.parse(out) as z.infer<T>;
    } catch (e) {
      lastError = e;
    }
  }
  console.error(JSON.stringify({ event: "llm_failed", name, reason: (lastError as Error)?.name }));
  throw new AgentError("AI_GENERATION_FAILED", "The AI agent could not complete this task.");
}
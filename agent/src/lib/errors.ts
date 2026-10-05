import { BackendError } from "../services/backendClient";

export class AgentError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export function toAgentError(e: unknown): { code: string; message: string } {
  if (e instanceof AgentError) return { code: e.code, message: e.message };
  if (e instanceof BackendError) {
    if (e.status === 404) return { code: "PATIENT_NOT_FOUND", message: "Unable to load patient information." };
    if (e.status === 401 || e.status === 403) return { code: "FORBIDDEN", message: "You are not allowed to access this patient." };
    return { code: e.code, message: "Unable to load patient information." };
  }
  return { code: "AI_GENERATION_FAILED", message: "The AI agent could not complete this task." };
}
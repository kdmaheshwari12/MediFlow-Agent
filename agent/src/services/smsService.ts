import { backend } from "./backendClient";

// Agent SMS khud nahi bhejta. Backend approval, guardrails, consent, idempotency aur provider sambhalta hai.
export async function requestFollowUpSend(followUpId: string, userToken: string) {
  await backend.requestFollowUpSend(followUpId, userToken);
  return { status: "requested" as const };
}
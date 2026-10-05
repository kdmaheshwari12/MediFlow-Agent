import { requestFollowUpSend } from "../services/smsService";
import { ev, withErrorHandling } from "./utils";

// Ye node SMS nahi bhejta; sirf backend se "bhejo" ki darkhwast karta hai, wo bhi tab jab saari shartein poori hon.
export const sendSms = withErrorHandling({ stage: "MESSAGE_SENDING" }, async (state) => {
  if (!state.followUp?.followUpRequired || !state.followUpId) {
    return { sendStatus: "not_applicable" as const, events: [ev("MESSAGE_SENDING", "SKIPPED", "No follow-up message to send")] };
  }

  if (!state.guardrails?.passed) {
    return {
      sendStatus: "needs_review" as const,
      events: [ev("WAITING_FOR_APPROVAL", "COMPLETED", `Doctor review needed: ${state.guardrails?.failures.join(", ") ?? "checks not passed"}`)],
    };
  }

  const mode = state.visitContext?.followUpSendMode ?? "doctor_review"; // default mehfooz raasta
  if (mode !== "auto") {
    return {
      sendStatus: "needs_review" as const,
      events: [ev("WAITING_FOR_APPROVAL", "COMPLETED", "Waiting for doctor approval")],
    };
  }

  await requestFollowUpSend(state.followUpId, state.userToken);
  return {
    sendStatus: "requested" as const,
    events: [ev("MESSAGE_SENDING", "COMPLETED", "Send requested; backend validates and delivers")],
  };
});
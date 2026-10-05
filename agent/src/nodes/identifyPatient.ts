import { backend } from "../services/backendClient";
import { ev, withErrorHandling } from "./utils";

// Purana ya naya patient: faisla database (MRN) karta hai, AI nahi.
export const identifyPatient = withErrorHandling(
  { stage: "PATIENT_LOADED", startMessage: "Identifying patient" },
  async (state) => {
    const status = await backend.getHistoryStatus(state.mrn, state.userToken);
    return {
      isReturning: status.isReturning,
      visitCount: status.visitCount,
      events: [
        ev(
          "PATIENT_LOADED",
          "COMPLETED",
          status.isReturning
            ? `Returning patient with ${status.visitCount} previous visit(s)`
            : "New patient, no previous history",
        ),
      ],
    };
  },
);
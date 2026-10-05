import { AgentError } from "../lib/errors";
import { backend } from "../services/backendClient";
import { ev, withErrorHandling } from "./utils";

export const fetchHistory = withErrorHandling(
  { stage: "HISTORY_RETRIEVING", startMessage: "Retrieving patient records" },
  async (state) => {
    const needsContext = state.mode === "followup";
    if (needsContext && !state.medicalRecordId) {
      throw new AgentError("VISIT_CONTEXT_MISSING", "Unable to load patient information.");
    }

    const [rawHistory, visitContext] = await Promise.all([
      state.isReturning ? backend.getHistory(state.mrn, state.userToken) : Promise.resolve(null),
      needsContext ? backend.getVisitContext(state.medicalRecordId!, state.userToken) : Promise.resolve(null),
    ]);

    // Follow-up mode mein abhi save hui visit ko "purani history" na samjho.
    const history = rawHistory
      ? {
          ...rawHistory,
          visits: rawHistory.visits.filter((v) => v.id !== state.medicalRecordId),
        }
      : null;

    return {
      history,
      visitContext,
      events: [ev("HISTORY_RETRIEVED", "COMPLETED", `Retrieved ${history?.visits.length ?? 0} previous record(s)`)],
    };
  },
);
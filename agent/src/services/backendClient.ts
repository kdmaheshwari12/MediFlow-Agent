import { z } from "zod";
import { config } from "../config";

export class BackendError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// ---- Response shapes jo agent ko chahiye (backend se match karwa lein) ----
const historyStatusSchema = z.object({
  isReturning: z.boolean(),
  visitCount: z.number().int().default(0),
});

const prescriptionItemSchema = z.object({
  medicine: z.string(),
  dosage: z.string().nullish(),
  frequency: z.string().nullish(),
  duration: z.string().nullish(),
  instructions: z.string().nullish(),
});

const visitSchema = z.object({
  id: z.string(),
  date: z.string(),
  chiefComplaint: z.string().nullish(),
  diagnosis: z.string().nullish(),
  notes: z.string().nullish(),
  prescriptions: z.array(prescriptionItemSchema).default([]),
  followUp: z.string().nullish(),
});

const historySchema = z.object({
  allergies: z.array(z.string()).default([]),
  visits: z.array(visitSchema).default([]),
});

const visitContextSchema = z.object({
  recordId: z.string(),
  clinicName: z.string(),
  clinicTimezone: z.string().nullish(),
  followUpSendMode: z.enum(["auto", "doctor_review"]).nullish(),
  chiefComplaint: z.string().nullish(),
  symptoms: z.array(z.string()).default([]),
  diagnosis: z.string().nullish(),
  notes: z.string().nullish(),
  treatmentPlan: z.string().nullish(),
  prescriptionItems: z.array(prescriptionItemSchema).default([]),
  followUp: z
    .object({
      required: z.boolean().nullish(),
      afterDays: z.number().int().nullish(),
      instructions: z.string().nullish(),
    })
    .nullish(),
});

const okSchema = z.object({}).passthrough();

export type HistoryStatus = z.infer<typeof historyStatusSchema>;
export type PatientHistory = z.infer<typeof historySchema>;
export type VisitContext = z.infer<typeof visitContextSchema>;

// ---- HTTP helper: doctor ka token forward hota hai, is liye backend ka RLS lagu rehta hai ----
async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  token: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const url = `${config.BACKEND_BASE_URL}${config.BACKEND_API_PREFIX}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.BACKEND_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }

    if (!res.ok) {
      throw new BackendError(
        res.status,
        json?.error?.code ?? "BACKEND_ERROR",
        json?.error?.message ?? `Backend returned ${res.status}`,
      );
    }
    return schema.parse(json?.data ?? json);
  } catch (e) {
    if (e instanceof BackendError) throw e;
    if (e instanceof z.ZodError) throw new BackendError(502, "BACKEND_BAD_RESPONSE", "Unexpected backend response");
    if ((e as Error).name === "AbortError") throw new BackendError(504, "BACKEND_TIMEOUT", "Backend timed out");
    throw new BackendError(502, "BACKEND_UNREACHABLE", "Cannot reach the backend");
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export const backend = {
  getHistoryStatus: (mrn: string, token: string) =>
    request("GET", `/patients/${enc(mrn)}/history-status`, token, historyStatusSchema),

  getHistory: (mrn: string, token: string) =>
    request("GET", `/patients/${enc(mrn)}/history`, token, historySchema),

  getVisitContext: (recordId: string, token: string) =>
    request("GET", `/records/${enc(recordId)}/agent-context`, token, visitContextSchema),

  saveSummary: (
    mrn: string,
    payload: { summaryText: string; keyPoints: string[]; recordsAnalyzed: number; coveredThroughRecordId: string | null; model: string },
    token: string,
  ) => request("POST", `/patients/${enc(mrn)}/ai-summary`, token, okSchema, payload),

  saveFollowUpDraft: (
    followUpId: string,
    payload: {
      followUpRequired: boolean;
      aiContent: string | null;
      suggestedDate: string | null;
      riskFlags: string[];
      reasoningSummary: string;
      guardrailResult: { passed: boolean; failures: string[] };
      model: string;
    },
    token: string,
  ) => request("POST", `/follow-ups/${enc(followUpId)}/draft`, token, okSchema, payload),

  requestFollowUpSend: (followUpId: string, token: string) =>
    request("POST", `/follow-ups/${enc(followUpId)}/auto-send`, token, okSchema),

  // Best-effort: fail ho to agent ka kaam na ruke.
  postAgentEvent: async (event: Record<string, unknown>, token: string) => {
    try {
      await request("POST", `/agent/events`, token, okSchema, event);
    } catch {
      /* ignore */
    }
  },
};
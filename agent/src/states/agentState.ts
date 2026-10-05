import { Annotation } from "@langchain/langgraph";
import type { PatientHistory, VisitContext } from "../services/backendClient.js";

export type Mode = "summary" | "followup";
export type EventStatus = "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";
export type SendStatus = "not_applicable" | "needs_review" | "requested";

export interface AgentEvent {
  stage: string;
  status: EventStatus;
  message: string;
  timestamp: string;
}

export interface HistoryAnalysis {
  conditions: string[];
  medications: string[];
  allergies: string[];
  trends: string[];
  priorFollowUps: string[];
}

export interface PatientSummary {
  summaryText: string;
  keyPoints: string[];
  recordsAnalyzed: number;
}

export interface FollowUpDraft {
  followUpRequired: boolean;
  draftMessage: string | null;
  followUpDate: string | null;
  reasoningSummary: string;
  riskFlags: string[];
}

export interface GuardrailResult {
  passed: boolean;
  failures: string[];
}

export interface AgentErrorInfo {
  code: string;
  message: string;
}

export const AgentState = Annotation.Root({
  // inputs
  mode: Annotation<Mode>(),
  runId: Annotation<string>(),
  userToken: Annotation<string>(),
  mrn: Annotation<string>(),
  followUpId: Annotation<string | undefined>(),
  medicalRecordId: Annotation<string | undefined>(),

  // working data
  isReturning: Annotation<boolean | undefined>(),
  visitCount: Annotation<number | undefined>(),
  history: Annotation<PatientHistory | null | undefined>(),
  visitContext: Annotation<VisitContext | null | undefined>(),
  analysis: Annotation<HistoryAnalysis | undefined>(),

  // outputs
  summary: Annotation<PatientSummary | null | undefined>(),
  followUp: Annotation<FollowUpDraft | undefined>(),
  guardrails: Annotation<GuardrailResult | undefined>(),
  sendStatus: Annotation<SendStatus | undefined>(),
  error: Annotation<AgentErrorInfo | undefined>(),

  events: Annotation<AgentEvent[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

export type AgentStateType = typeof AgentState.State;
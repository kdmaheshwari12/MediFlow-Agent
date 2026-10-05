import { backend } from "../services/backendClient";
import { config } from "../config";
import { toAgentError } from "../lib/errors";
import type { AgentEvent, AgentStateType, EventStatus } from "../states/agentState";

export const ev = (stage: string, status: EventStatus, message: string): AgentEvent => ({
  stage,
  status,
  message,
  timestamp: new Date().toISOString(),
});

async function emit(state: AgentStateType, event: AgentEvent) {
  if (!config.AGENT_EVENTS_ENABLED) return;
  // Real-time ke liye event backend ko jata hai (MRN ya patient data nahi).
  await backend.postAgentEvent({ runId: state.runId, mode: state.mode, ...event }, state.userToken);
}

interface Options {
  stage: string;
  startMessage?: string; // diya ho to "PROCESSING" event pehle jata hai
}

type NodeFn = (state: AgentStateType) => Promise<Partial<AgentStateType>>;

// Har node ke liye: start event, completion events ki emission, aur error ko state mein rakhna.
export function withErrorHandling(opts: Options, fn: NodeFn): NodeFn {
  return async (state) => {
    try {
      if (opts.startMessage) {
        const start = ev(opts.stage, "PROCESSING", opts.startMessage);
        await emit(state, start);
      }
      const result = await fn(state);
      for (const e of result.events ?? []) await emit(state, e);
      return result;
    } catch (e) {
      const err = toAgentError(e);
      console.error(JSON.stringify({ event: "node_failed", stage: opts.stage, code: err.code }));
      const failed = ev("FAILED", "FAILED", err.message);
      await emit(state, failed);
      return { error: err, events: [failed] };
    }
  };
}
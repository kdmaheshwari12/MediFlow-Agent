import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "../states/agentState";
import { identifyPatient } from "../nodes/identifyPatient";
import { fetchHistory } from "../nodes/fetchHistory";
import { analyzeHistory } from "../nodes/analyzeHistory";
import { generateSummary } from "../nodes/generateSummary";
import { generateMessage } from "../nodes/generateMessage";
import { sendSms } from "../nodes/sendSms";

// Summary mode:  identify -> (naya patient? END) -> fetchHistory -> analyze -> summary
// Follow-up mode: identify -> fetchHistory -> generateMessage -> (follow-up chahiye?) -> sendSms
const afterIdentify = (s: AgentStateType): "fetchHistory" | typeof END => {
  if (s.error) return END;
  if (s.mode === "summary" && !s.isReturning) return END; // naya patient: AI nahi chalta
  return "fetchHistory";
};

const afterFetch = (s: AgentStateType): "analyzeHistory" | "generateMessage" | typeof END => {
  if (s.error) return END;
  if (s.mode === "summary") return s.history?.visits.length ? "analyzeHistory" : END;
  return "generateMessage";
};

const afterAnalyze = (s: AgentStateType): "generateSummary" | typeof END => (s.error ? END : "generateSummary");

const afterMessage = (s: AgentStateType): "sendSms" | typeof END =>
  s.error || !s.followUp?.followUpRequired ? END : "sendSms";

export const patientGraph = new StateGraph(AgentState)
  .addNode("identifyPatient", identifyPatient)
  .addNode("fetchHistory", fetchHistory)
  .addNode("analyzeHistory", analyzeHistory)
  .addNode("generateSummary", generateSummary)
  .addNode("generateMessage", generateMessage)
  .addNode("sendSms", sendSms)
  .addEdge(START, "identifyPatient")
  .addConditionalEdges("identifyPatient", afterIdentify, ["fetchHistory", END])
  .addConditionalEdges("fetchHistory", afterFetch, ["analyzeHistory", "generateMessage", END])
  .addConditionalEdges("analyzeHistory", afterAnalyze, ["generateSummary", END])
  .addEdge("generateSummary", END)
  .addConditionalEdges("generateMessage", afterMessage, ["sendSms", END])
  .addEdge("sendSms", END)
  .compile();
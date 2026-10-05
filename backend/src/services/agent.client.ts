import { env } from '../config/env';

export class AgentError extends Error {
  constructor(
    public code: 'AI_GENERATION_FAILED' | 'AI_TIMEOUT' | 'AGENT_UNAVAILABLE',
    message: string,
    public status: number = 502
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export interface HistorySummaryResponse {
  runId: string;
  isReturning: boolean;
  visitCount: number;
  summary: {
    summaryText: string;
    keyPoints: string[];
    recordsAnalyzed: number;
    coveredThroughRecordId?: string | null;
  } | null;
  events?: any[];
}

export interface FollowupDraftResponse {
  runId: string;
  followUp: any | null;
  guardrails: any | null;
  sendStatus: string;
  events?: any[];
}

export async function callAgent<T>(
  path: string,
  body: unknown,
  doctorJwt: string,
  timeoutMs: number = 60000
): Promise<T> {
  const rawAgentUrl = process.env.AGENT_SERVICE_URL || process.env.AGENT_URL || env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000';
  const baseUrl = rawAgentUrl.replace(/\/+$/, '');
  const url = `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AGENT_SERVICE_TOKEN}`,
        'X-User-Token': doctorJwt,
      },
      body: JSON.stringify(body),
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
      if (res.status === 401) {
        throw new AgentError('AI_GENERATION_FAILED', 'Agent rejected request authentication', 502);
      }
      const message = json?.error?.message || `Agent returned status ${res.status}`;
      throw new AgentError('AI_GENERATION_FAILED', message, 502);
    }

    return json as T;
  } catch (err: any) {
    if (err instanceof AgentError) {
      throw err;
    }
    if (err?.name === 'AbortError') {
      throw new AgentError('AI_TIMEOUT', 'Agent request timed out', 504);
    }
    throw new AgentError('AGENT_UNAVAILABLE', 'Failed to connect to agent service', 502);
  } finally {
    clearTimeout(timer);
  }
}

export const AgentClient = {
  requestHistorySummary: (mrn: string, doctorJwt: string, timeoutMs: number = 60000) => {
    return callAgent<HistorySummaryResponse>('/v1/history-summary', { mrn }, doctorJwt, timeoutMs);
  },

  requestFollowupDraft: (
    payload: { mrn: string; followUpId: string; medicalRecordId: string },
    doctorJwt: string,
    timeoutMs: number = 60000
  ) => {
    return callAgent<FollowupDraftResponse>('/v1/followup-draft', payload, doctorJwt, timeoutMs);
  },
};

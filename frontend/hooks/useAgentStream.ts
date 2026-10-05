'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

export type AgentStep = 'searching_mrn' | 'generating_report' | 'drafting_message' | 'saving_prescription' | 'storing_draft' | 'sending_sms' | 'done' | 'idle';

export interface AgentStreamState {
  currentStep: AgentStep;
  stepMessage: string;
  tokens: string;
  isDone: boolean;
  error: string | null;
  isLoading: boolean;
  isReturning?: boolean;
  visitCount?: number;
  summary?: string;
  draft?: string;
  keyPoints?: string[];
}

interface UseAgentStreamOptions {
  mrn?: string;
  appointmentId?: string;
  mode: 'history' | 'draft';
  body?: any;
  enabled?: boolean;
}

export function useAgentStream({ mrn, appointmentId, mode, body, enabled = true }: UseAgentStreamOptions) {
  const [state, setState] = useState<AgentStreamState>({
    currentStep: 'idle',
    stepMessage: '',
    tokens: '',
    isDone: false,
    error: null,
    isLoading: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);

  const startStream = useCallback(async () => {
    if (!enabled) return;
    if (mode === 'history' && !mrn) return;
    if (mode === 'draft' && !appointmentId) return;

    // Abort existing stream if running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isRunningRef.current = true;

    setState({
      currentStep: mode === 'history' ? 'searching_mrn' : 'drafting_message',
      stepMessage: mode === 'history' ? 'Searching MRN in records...' : 'Drafting patient message...',
      tokens: '',
      isDone: false,
      error: null,
      isLoading: true,
    });

    const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

    if (useMocks) {
      // Mock SSE simulation
      try {
        if (mode === 'history') {
          await new Promise((r) => setTimeout(r, 400));
          if (controller.signal.aborted) return;

          setState((prev) => ({
            ...prev,
            currentStep: 'generating_report',
            stepMessage: 'Analyzing history...',
          }));

          const mockSummary = 'Patient has 2 previous visits for Hypertension and Chest Pain. Prescribed Amlodipine 5mg with 14-day follow-up.';
          const words = mockSummary.split(' ');

          for (const word of words) {
            if (controller.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 30));
            setState((prev) => ({ ...prev, tokens: prev.tokens + word + ' ' }));
          }

          if (controller.signal.aborted) return;
          setState((prev) => ({
            ...prev,
            currentStep: 'done',
            stepMessage: 'Done',
            isDone: true,
            isLoading: false,
            isReturning: true,
            visitCount: 2,
            summary: mockSummary,
          }));
        } else {
          await new Promise((r) => setTimeout(r, 300));
          if (controller.signal.aborted) return;

          const mockDraft = `Dear Patient, Dr. Harrison prescribed: ${body?.medicines?.map((m: any) => m.name).join(', ') || 'Medication'}. Diagnosis: ${body?.diagnosis || 'Consultation'}. Follow up in ${body?.followUpPeriod || '7 days'}.`;
          const words = mockDraft.split(' ');

          for (const word of words) {
            if (controller.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 25));
            setState((prev) => ({ ...prev, tokens: prev.tokens + word + ' ' }));
          }

          if (controller.signal.aborted) return;
          setState((prev) => ({
            ...prev,
            currentStep: 'done',
            stepMessage: 'Draft ready',
            isDone: true,
            isLoading: false,
            draft: mockDraft,
          }));
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            error: err?.message || 'Mock stream error',
            isLoading: false,
          }));
        }
      } finally {
        isRunningRef.current = false;
      }
      return;
    }

    // Real Backend SSE Stream
    try {
      const supabase = getSupabaseClient();
      const sessionRes = await supabase?.auth.getSession();
      const token = sessionRes?.data.session?.access_token || '';

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000/api/v1';
      const endpoint = mode === 'history'
        ? `${backendUrl}/checkup/history-stream/${mrn}`
        : `${backendUrl}/checkup/${appointmentId}/draft-sms-stream`;

      const response = await fetch(endpoint, {
        method: mode === 'history' ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: mode === 'draft' ? JSON.stringify(body || {}) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const eventMatch = line.match(/^event:\s*(.+)$/m);
          const dataMatch = line.match(/^data:\s*(.+)$/m);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1].trim();
            const data = JSON.parse(dataMatch[1].trim());

            if (eventType === 'step') {
              setState((prev) => ({
                ...prev,
                currentStep: data.step as AgentStep,
                stepMessage: data.message || '',
              }));
            } else if (eventType === 'token') {
              setState((prev) => ({
                ...prev,
                tokens: prev.tokens + (data.token || ''),
              }));
            } else if (eventType === 'done') {
              setState((prev) => ({
                ...prev,
                currentStep: 'done',
                stepMessage: 'Done',
                isDone: true,
                isLoading: false,
                isReturning: data.isReturning,
                visitCount: data.visitCount,
                summary: data.summary,
                draft: data.draft,
                keyPoints: data.keyPoints,
              }));
            } else if (eventType === 'error') {
              setState((prev) => ({
                ...prev,
                error: data.message || 'Stream error',
                isLoading: false,
              }));
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setState((prev) => ({
          ...prev,
          error: err.message || 'Stream connection error',
          isLoading: false,
        }));
      }
    } finally {
      isRunningRef.current = false;
    }
  }, [enabled, mrn, appointmentId, mode, body]);

  useEffect(() => {
    startStream();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [mrn, appointmentId, mode]);

  return {
    ...state,
    retry: startStream,
  };
}

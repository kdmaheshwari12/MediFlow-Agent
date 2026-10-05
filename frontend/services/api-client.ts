import { getSupabaseClient } from '@/lib/supabase/client';

export class AppError extends Error {
  public code: string;
  public userMessage: string;
  public details?: any;

  constructor(code: string, userMessage: string, details?: any) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;

    if (process.env.NODE_ENV === 'development' && details) {
      console.warn(`[AppError ${code}]:`, details);
    }
  }
}

export const simulateDelay = (ms: number = 400) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const supabase = getSupabaseClient();
  let token = null;
  if (supabase) {
    const session = await supabase.auth.getSession();
    token = session.data.session?.access_token;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Ensure cookies are sent for things like pending_signup_id
  options.credentials = 'include';
  options.headers = headers;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, options);
  } catch (err: any) {
    // This catches network errors, CORS failures, or server down
    throw new AppError('NETWORK_ERROR', 'Cannot reach the server. Please try again.');
  }
  
  // If it's a 204 or empty response
  if (response.status === 204) return null;

  let data;
  try {
    data = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new AppError('NETWORK_ERROR', 'Failed to connect to the server.');
    }
    return null;
  }

  if (!response.ok) {
    const errorCode = data?.error?.code || data?.code || 'API_ERROR';
    let message = data?.error?.message || data?.message;
    const details = data?.error?.details || data?.details || (data?.error?.affectedAppointments ? data.error : undefined);

    if (Array.isArray(details) && details.length > 0) {
      const detailMsgs = details
        .map((d: any) => (typeof d === 'string' ? d : d?.message))
        .filter(Boolean);
      if (detailMsgs.length > 0) {
        message = detailMsgs.join(' | ');
      }
    }

    if (!message) {
      message = 'An unexpected error occurred.';
    }

    // For 401 Unauthorized, we might want to clear state and redirect to login
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('unauthorized'));
      }
    }

    throw new AppError(errorCode, message, details);
  }

  return data;
}

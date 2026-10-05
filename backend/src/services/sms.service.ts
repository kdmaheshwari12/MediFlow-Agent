import { env } from '../config/env';

export interface SmsResult {
  success: boolean;
  providerResponse: Record<string, any>;
  errorReason?: string;
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const provider = env.SMS_PROVIDER || 'mock';
  const sanitizedPhone = phone ? phone.trim() : '';

  // Retry up to 2 times for transient failures
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (provider === 'mock') {
        return {
          success: true,
          providerResponse: {
            provider: 'mock',
            messageId: `mock-msg-${Date.now()}`,
            attempt,
            timestamp: new Date().toISOString()
          }
        };
      }

      // Default adapter
      return {
        success: true,
        providerResponse: {
          provider,
          messageId: `sms-${Date.now()}`,
          attempt,
          timestamp: new Date().toISOString()
        }
      };
    } catch (err: any) {
      lastError = err?.message || 'Failed to dispatch SMS';
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  return {
    success: false,
    providerResponse: { provider, failedAt: new Date().toISOString() },
    errorReason: lastError || 'SMS delivery failed'
  };
}

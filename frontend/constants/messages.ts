export const MESSAGES = {
  MRN_NOT_FOUND: 'Patient with this Medical Record Number could not be found.',
  SLOT_CONFLICT: 'This time slot is already booked.',
  NETWORK_ERROR: 'Something went wrong. Please try again.',
  AI_FAILURE: 'Follow-up message could not be generated. Please try again.',
  SMS_FAILURE: 'The message could not be delivered.',
  UNAUTHORIZED: 'You do not have permission to access this clinical area.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  PATIENT_REGISTERED: 'Patient registered successfully.',
  RECORD_SAVED: 'Medical record and checkup saved successfully.',
  FOLLOWUP_SENT: 'AI follow-up message sent automatically.',
} as const;

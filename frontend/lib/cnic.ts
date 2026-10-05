export const CNIC_REGEX = /^\d{5}-\d{7}-\d$/;

/**
 * Formats user input as XXXXX-XXXXXXX-X dynamically while typing.
 * Accepts up to 13 digits total, ignoring non-digit characters.
 */
export function formatCnicInput(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * Validates whether the CNIC string conforms strictly to XXXXX-XXXXXXX-X format (13 digits).
 */
export function validateCnicPattern(cnic: string): boolean {
  if (!cnic) return false;
  return CNIC_REGEX.test(cnic.trim());
}

/**
 * Masks CNIC for display back to doctor (e.g. 42101-*******-1).
 */
export function maskCnicDisplay(cnic: string): string {
  if (!cnic) return '';
  const trimmed = cnic.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 13) return trimmed || '*****';
  return `${digits.slice(0, 5)}-*******-${digits.slice(12)}`;
}

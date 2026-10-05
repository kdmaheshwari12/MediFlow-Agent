export const CNIC_REGEX = /^\d{5}-\d{7}-\d$/;

/**
 * Validates if the CNIC matches Pakistani CNIC format: XXXXX-XXXXXXX-X
 */
export function validateCnicFormat(cnic: string): boolean {
  if (!cnic) return false;
  return CNIC_REGEX.test(cnic.trim());
}

/**
 * Normalizes input CNIC (e.g. 4210112345671 or 42101-1234567-1) into standard XXXXX-XXXXXXX-X format.
 */
export function normalizeCnic(cnic: string): string {
  if (!cnic) return '';
  const digitsOnly = cnic.replace(/\D/g, '');
  if (digitsOnly.length === 13) {
    return `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5, 12)}-${digitsOnly.slice(12)}`;
  }
  return cnic.trim();
}

/**
 * Masks CNIC for display, e.g., 42101-*******-1
 */
export function maskCnic(cnic: string): string {
  const normalized = normalizeCnic(cnic);
  if (!validateCnicFormat(normalized)) return '*****';
  const parts = normalized.split('-');
  return `${parts[0]}-*******-${parts[2]}`;
}

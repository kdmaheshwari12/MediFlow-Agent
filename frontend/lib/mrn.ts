let currentMrnCounter = 10042;

export function generateMrn(): string {
  currentMrnCounter += 1;
  return `MRN-${currentMrnCounter}`;
}

export function isValidMrnFormat(mrn: string): boolean {
  return /^MRN-\d{5}$/i.test(mrn.trim());
}

export function formatMrn(input: string): string {
  const cleaned = input.toUpperCase().trim();
  if (!cleaned.startsWith('MRN-') && cleaned.length > 0 && !cleaned.startsWith('M')) {
    return `MRN-${cleaned}`;
  }
  return cleaned;
}

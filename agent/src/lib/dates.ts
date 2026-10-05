// Clinic ke timezone mein "aaj + N din" ki tareekh (YYYY-MM-DD). Tareekh LLM nahi, code banata hai.
export function addDaysISO(days: number, timeZone: string, from: Date = new Date()): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatDateHuman(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`)); // e.g. "17 Oct 2026"
}
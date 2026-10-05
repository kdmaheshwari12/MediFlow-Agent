// Model ko jaane se pehle identifiers hata do aur patient text ko "data" bana do.
export function sanitizeText(input: string | null | undefined, max = 1500): string {
  if (!input) return "";
  return input
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{5}-\d{7}-\d\b/g, "[id]")
    .replace(/(\+?\d[\d\s().-]{8,}\d)/g, "[phone]")
    .replace(/<\/?[a-z_]+>/gi, "") // pseudo tags hata do (prompt-injection se bachao)
    .slice(0, max);
}

export const wrapData = (label: string, body: string) => `<${label}>\n${body}\n</${label}>`;
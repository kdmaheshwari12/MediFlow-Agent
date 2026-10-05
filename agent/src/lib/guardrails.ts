import type { GuardrailResult } from "../states/agentState";

interface Ctx {
  clinicName: string;
  dateText: string;
  medicineNames: string[];
  diagnosis?: string | null;
}

const DOSE = /\b\d+(\.\d+)?\s?(mg|mcg|g|ml|iu|units?)\b/i;
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const CHANGES_TREATMENT =
  /\b(stop|skip|double|increase|reduce|discontinue|quit)\b.{0,40}\b(medicine|medication|dose|tablet|pill|course)\b/i;

export function checkMessage(message: string, ctx: Ctx): GuardrailResult {
  const failures: string[] = [];
  const lower = message.toLowerCase();

  if (message.length > 320) failures.push("TOO_LONG");
  if (!lower.includes(ctx.clinicName.toLowerCase())) failures.push("MISSING_CLINIC_NAME");
  if (!message.includes(ctx.dateText)) failures.push("MISSING_DATE");
  if (DOSE.test(message)) failures.push("CONTAINS_DOSAGE");
  if (URL_RE.test(message)) failures.push("CONTAINS_URL");
  if (CHANGES_TREATMENT.test(message)) failures.push("CHANGES_TREATMENT");
  if (ctx.medicineNames.some((m) => m.trim().length >= 3 && lower.includes(m.trim().toLowerCase())))
    failures.push("CONTAINS_MEDICINE_NAME");
  if (ctx.diagnosis && ctx.diagnosis.trim().length >= 4 && lower.includes(ctx.diagnosis.trim().toLowerCase()))
    failures.push("CONTAINS_DIAGNOSIS");

  return { passed: failures.length === 0, failures };
}
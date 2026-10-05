import { z } from 'zod';

export const licenseRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/i;
export const cnicRegex = /^\d{5}-\d{7}-\d$/;

// Doctor Step Schemas
export const doctorInfoSchema = z.object({
  qualification: z.string().trim().min(2, 'Enter your qualification (e.g. MBBS).'),
  license_number: z.string().trim().regex(licenseRegex, 'Enter a valid license number like XXX-YYY.'),
  clinic_name: z.string().trim().min(2, 'Enter the clinic or hospital name.').optional(),
});

export const doctorSpecializationSchema = z.object({
  specializations: z.array(z.object({
    name: z.string().trim().min(2, 'Must be at least 2 characters').max(60).regex(/^[a-zA-Z0-9\s&\-/\(\)\.,]+$/, 'Special characters not allowed'),
    experience_years: z.number().min(0).max(70, 'Must be between 0 and 70'),
    is_primary: z.boolean().default(false)
  })).min(1, 'Please add at least one specialization.')
});

const timeRegex = /^\d{2}:\d{2}$/;
const parseMins = (t: string | null | undefined): number | null => {
  if (!t || typeof t !== 'string') return null;
  const tr = t.trim();
  if (tr === '' || tr === '00:00' || tr === '00:00:00') return null;
  const p = tr.split(':');
  if (p.length < 2) return null;
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

export const doctorAvailabilitySchema = z.object({
  daily_patient_limit: z.number().min(1).max(100).default(30),
  availability: z.array(z.object({
    weekday: z.number().min(0).max(6),
    start_time: z.string().regex(timeRegex, "Required"),
    end_time: z.string().regex(timeRegex, "Required"),
    break_start: z.string().regex(timeRegex, "Invalid time").or(z.literal('')).optional().nullable(),
    break_end: z.string().regex(timeRegex, "Invalid time").or(z.literal('')).optional().nullable(),
    slot_minutes: z.number().min(5).max(120).default(15)
  })).min(1, "Please configure at least one working day.")
}).superRefine((val, ctx) => {
  val.availability.forEach((day, idx) => {
    const sM = parseMins(day.start_time);
    const eM = parseMins(day.end_time);
    if (sM !== null && eM !== null && eM <= sM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ['availability', idx, 'end_time']
      });
    }

    const bStart = (day.break_start && day.break_start.trim() !== '' && day.break_start !== '00:00') ? day.break_start.trim() : null;
    const bEnd = (day.break_end && day.break_end.trim() !== '' && day.break_end !== '00:00') ? day.break_end.trim() : null;

    if (bStart && !bEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Break end time required when break start is provided",
        path: ['availability', idx, 'break_end']
      });
    } else if (!bStart && bEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Break start time required when break end is provided",
        path: ['availability', idx, 'break_start']
      });
    } else if (bStart && bEnd) {
      const bsM = parseMins(bStart);
      const beM = parseMins(bEnd);
      if (bsM !== null && beM !== null) {
        if (beM <= bsM) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Break end must be after break start",
            path: ['availability', idx, 'break_end']
          });
        }
        if (sM !== null && bsM < sM) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Break start cannot be before shift start",
            path: ['availability', idx, 'break_start']
          });
        }
        if (eM !== null && beM > eM) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Break end cannot be after shift end",
            path: ['availability', idx, 'break_end']
          });
        }
      }
    }
  });
});

// Staff Step Schemas
export const staffStep1Schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name (at least 2 characters).'),
  email: z.string().trim().email('Enter a valid email address (e.g. staff@clinic.com).'),
  phone: z.string().trim().min(10, 'Enter a valid phone number (e.g. +92 300 1234567).'),
});

export const staffStep2Schema = z.object({
  cnic: z.string().trim().regex(cnicRegex, 'Enter a valid CNIC like 12345-1234567-1.'),
  clinicName: z.string().trim().min(2, 'Enter the clinic or hospital name.'),
});

export const DOCTOR_ONBOARDING_STEPS = [
  {
    step: 1,
    id: 'info',
    title: 'Additional Information',
    subtitle: 'Provide your basic qualifications and clinic details.',
    schema: doctorInfoSchema,
  },
  {
    step: 2,
    id: 'specialization',
    title: 'Specialization and Experience',
    subtitle: 'Select your primary medical specialization.',
    schema: doctorSpecializationSchema,
  },
  {
    step: 3,
    id: 'availability',
    title: 'Availability Config',
    subtitle: 'Set up your weekly clinic schedule and slot duration.',
    schema: doctorAvailabilitySchema,
  }
];

export const STAFF_ONBOARDING_STEPS = [
  {
    step: 1,
    id: 'profile',
    title: 'Personal & Contact Details',
    subtitle: 'Review your receptionist details',
    schema: staffStep1Schema,
  },
  {
    step: 2,
    id: 'verification',
    title: 'National Identity & Clinic',
    subtitle: 'Verify your CNIC and assigned medical facility',
    schema: staffStep2Schema,
  },
];

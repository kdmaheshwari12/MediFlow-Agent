import { describe, it, expect } from 'vitest';
import { timeToMinutes, minutesToTimeStr, getDoctorDaySchedule } from '../src/services/slot.service';

describe('Slot Service Utility Functions', () => {
  it('correctly converts time strings to minutes', () => {
    expect(timeToMinutes('09:00')).toBe(540);
    expect(timeToMinutes('13:30')).toBe(810);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('correctly converts minutes to 12-hour formatted time strings', () => {
    expect(minutesToTimeStr(540)).toBe('09:00 AM');
    expect(minutesToTimeStr(720)).toBe('12:00 PM');
    expect(minutesToTimeStr(810)).toBe('01:30 PM');
    expect(minutesToTimeStr(1020)).toBe('05:00 PM');
  });
});

describe('Slot Calculation & Session State Rules', () => {
  // Mock Supabase client for unit testing logic
  const createMockClient = (mockData: {
    doctorProfile?: any;
    anyAvail?: any[];
    timeOff?: any[];
    override?: any;
    weekly?: any;
    appointments?: any[];
  }) => {
    return {
      from: (table: string) => {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({
              eq: (col2: string, val2: any) => ({
                eq: (col3: string, val3: any) => ({
                  maybeSingle: async () => ({ data: mockData.weekly, error: null }),
                  single: async () => ({ data: mockData.weekly, error: null }),
                }),
                maybeSingle: async () => ({ data: mockData.override, error: null }),
                single: async () => ({ data: mockData.override, error: null }),
                limit: async () => ({ data: mockData.anyAvail || [{ id: '1' }], error: null }),
              }),
              limit: async () => ({ data: mockData.anyAvail || [{ id: '1' }], error: null }),
              maybeSingle: async () => ({ data: mockData.doctorProfile || { daily_patient_limit: 30 }, error: null }),
              single: async () => ({ data: mockData.doctorProfile || { daily_patient_limit: 30 }, error: null }),
              lte: (c: string, v: any) => ({
                gte: async () => ({ data: mockData.timeOff || [], error: null })
              }),
              neq: (c: string, v: any) => ({
                gte: (c2: string, v2: any) => ({
                  lt: async () => ({ data: mockData.appointments || [], error: null })
                })
              })
            }),
            lte: (col: string, val: any) => ({
              gte: async () => ({ data: mockData.timeOff || [], error: null })
            })
          })
        };
      }
    } as any;
  };

  it('evaluates UPCOMING state when clock is before working window', async () => {
    const mockClient = createMockClient({
      weekly: { weekday: 1, start_time: '09:00', end_time: '17:00', slot_minutes: 15, is_active: true }
    });

    const nowFake = new Date('2026-10-05T08:00:00+05:00'); // 8:00 AM PKT on Monday Oct 5
    const res = await getDoctorDaySchedule({
      client: mockClient,
      doctorId: 'doc-123',
      dateStr: '2026-10-05',
      timezone: 'Asia/Karachi',
      nowOverride: nowFake,
    });

    expect(res.sessionState).toBe('UPCOMING');
    expect(res.slots.length).toBe(32); // 8 hours * 4 slots/hr
    expect(res.slots[0].state).toBe('available');
  });

  it('evaluates IN_SESSION state when clock is inside working window', async () => {
    const mockClient = createMockClient({
      weekly: { weekday: 1, start_time: '09:00', end_time: '17:00', slot_minutes: 15, is_active: true }
    });

    const nowFake = new Date('2026-10-05T10:30:00+05:00'); // 10:30 AM PKT
    const res = await getDoctorDaySchedule({
      client: mockClient,
      doctorId: 'doc-123',
      dateStr: '2026-10-05',
      timezone: 'Asia/Karachi',
      nowOverride: nowFake,
    });

    expect(res.sessionState).toBe('IN_SESSION');
    const pastSlots = res.slots.filter(s => s.state === 'past');
    expect(pastSlots.length).toBeGreaterThan(0);
  });

  it('evaluates ENDED state when clock is past end time', async () => {
    const mockClient = createMockClient({
      weekly: { weekday: 1, start_time: '09:00', end_time: '17:00', slot_minutes: 15, is_active: true }
    });

    const nowFake = new Date('2026-10-05T17:30:00+05:00'); // 5:30 PM PKT
    const res = await getDoctorDaySchedule({
      client: mockClient,
      doctorId: 'doc-123',
      dateStr: '2026-10-05',
      timezone: 'Asia/Karachi',
      nowOverride: nowFake,
    });

    expect(res.sessionState).toBe('ENDED');
    expect(res.disabledReason).toBe('Session ended');
  });

  it('honors doctor_time_off override', async () => {
    const mockClient = createMockClient({
      timeOff: [{ reason: 'Medical Leave' }]
    });

    const nowFake = new Date('2026-10-05T08:00:00+05:00');
    const res = await getDoctorDaySchedule({
      client: mockClient,
      doctorId: 'doc-123',
      dateStr: '2026-10-05',
      timezone: 'Asia/Karachi',
      nowOverride: nowFake,
    });

    expect(res.sessionState).toBe('NOT_SCHEDULED');
    expect(res.disabledReason).toContain('On leave');
  });
});

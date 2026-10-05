'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/lib/supabase/client';

export function useSupabaseRealtime() {
  const queryClient = useQueryClient();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['availability-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
    };

    let channel: any = null;

    if (supabase) {
      try {
        channel = supabase
          .channel('mediflow_realtime_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, invalidateAll)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_availability' }, invalidateAll)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_availability_overrides' }, invalidateAll)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_time_off' }, invalidateAll)
          .subscribe((status) => {
            if (status !== 'SUBSCRIBED') {
              if (!pollingRef.current) {
                pollingRef.current = setInterval(invalidateAll, 10000);
              }
            } else if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          });
      } catch {
        pollingRef.current = setInterval(invalidateAll, 10000);
      }
    } else {
      pollingRef.current = setInterval(invalidateAll, 10000);
    }

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [queryClient]);
}

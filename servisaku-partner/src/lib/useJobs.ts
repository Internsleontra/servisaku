import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Booking } from '@/api/client';
import { nextAction } from './jobActions';
import { useToast } from '@/components/toast';

// Shared job-advance: claim from the pool or push the assigned job to its next status.
export function useAdvanceJob() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function advance(b: Booking) {
    const act = nextAction(b.status);
    if (!act) return;
    setBusyId(b.id);
    try {
      if (act.claim) await api.claim(b.id);
      else await api.setBookingStatus(b.id, act.next);
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      await qc.invalidateQueries({ queryKey: ['available-jobs'] });
      toast.show(act.claim ? 'Job accepted' : `Marked ${act.next.replace('_', ' ')}`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not update the job', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return { advance, busyId };
}

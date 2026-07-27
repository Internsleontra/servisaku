// The next lifecycle action a partner can take, per current status.
export interface JobAction { label: string; next: string; claim?: boolean }

export function nextAction(status: string): JobAction | null {
  switch (status) {
    case 'pending': return { label: 'Accept job', next: 'accepted', claim: true };
    case 'assigned': return { label: 'Accept job', next: 'accepted' };
    case 'accepted': return { label: 'Start journey', next: 'en_route' };
    case 'en_route': return { label: "I've arrived", next: 'arrived' };
    case 'arrived': return { label: 'Start job', next: 'started' };
    case 'started': return { label: 'Complete job', next: 'completed' };
    default: return null;
  }
}

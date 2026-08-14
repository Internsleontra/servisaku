import { STATUS_META } from '@/lib/bookingEngine';
import { statusIconFor } from '@/lib/statusIcons';
import moment from 'moment';

// Renders the server-recorded lifecycle (timestamped status transitions) as a
// vertical timeline. `lifecycle` = [{ status, at, by }].
export function ExecutionTimeline({ lifecycle = [] }) {
  if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
    return <p className="text-xs text-ink-tertiary">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative ml-1 space-y-4 border-l border-hairline/20 pl-5">
      {lifecycle.map((e, i) => {
        const meta = STATUS_META[e.status];
        const last = i === lifecycle.length - 1;
        return (
          <li key={i} className="relative">
            <span className={`absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${last ? 'bg-brand text-white' : 'bg-raised'}`}>
              {(() => { const I = statusIconFor(e.status); return I ? <I className="size-3" /> : <span>•</span>; })()}
            </span>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-ink">{meta?.label || e.status}</p>
              <span className="text-[10px] text-ink-tertiary">{moment(e.at).format('D MMM · h:mm A')}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

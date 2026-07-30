import { cn } from '@/lib/utils';

// Base pulse block
function Bone({ className }) {
  return <div className={cn('bg-muted rounded-xl animate-pulse', className)} />;
}

// ── Skeleton variants ──────────────────────────────────────────────────────

export function CardSkeleton({ lines = 2 }) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-4 space-y-2.5">
      <div className="flex items-center gap-3">
        <Bone className="w-11 h-11 rounded-xl shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Bone className="h-3.5 w-2/3" />
          <Bone className="h-3 w-1/2" />
        </div>
      </div>
      {[...Array(lines)].map((_, i) => (
        <Bone key={i} className={`h-3 ${i === lines - 1 ? 'w-1/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-surface rounded-2xl border border-border p-4 space-y-2">
          <Bone className="w-9 h-9 rounded-xl" />
          <Bone className="h-5 w-1/2" />
          <Bone className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2.5 flex gap-4">
        {[40, 30, 20, 10].map((w, i) => <Bone key={i} className={`h-3 w-${w} max-w-[${w}%]`} style={{ width: `${w}%` }} />)}
      </div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-border/50 flex gap-4 items-center last:border-0">
          {[35, 25, 20, 20].map((w, j) => <Bone key={j} className="h-3 rounded" style={{ width: `${w}%` }} />)}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 160 }) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {[60, 80, 45, 90, 70, 55, 85, 40, 75, 95].map((h, i) => (
          <Bone key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center pt-8 pb-4 gap-3">
        <Bone className="w-20 h-20 rounded-full" />
        <Bone className="h-4 w-32" />
        <Bone className="h-3 w-24" />
      </div>
      <ListSkeleton count={3} />
    </div>
  );
}

// Full-page loading with header
export default function PageSkeleton({ type = 'list' }) {
  return (
    <div className="min-h-screen bg-background px-5 pt-16 space-y-4 page-enter">
      <div className="space-y-1.5 mb-4">
        <Bone className="h-5 w-40" />
        <Bone className="h-3 w-28" />
      </div>
      {type === 'kpi' && <KPISkeleton />}
      {type === 'list' && <ListSkeleton />}
      {type === 'table' && <TableSkeleton />}
      {type === 'chart' && (
        <div className="space-y-4">
          <KPISkeleton />
          <ChartSkeleton />
          <ListSkeleton count={2} />
        </div>
      )}
      {type === 'profile' && <ProfileSkeleton />}
    </div>
  );
}
import { cn } from '@/lib/utils';

export function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse bg-muted rounded-2xl", className)} />
  );
}

export function ServiceCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Skeleton className="w-16 h-16 rounded-2xl" />
      <Skeleton className="w-14 h-2.5 rounded-full" />
    </div>
  );
}

export function BookingCardSkeleton() {
  return (
    <div className="bg-surface rounded-3xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-2.5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-2.5 w-16 rounded-full" />
        <Skeleton className="h-2.5 w-16 rounded-full" />
        <Skeleton className="h-2.5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <div className="px-5 pt-16 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-full" />
        </div>
        <Skeleton className="w-10 h-10 rounded-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24 rounded-full" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <ServiceCardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}
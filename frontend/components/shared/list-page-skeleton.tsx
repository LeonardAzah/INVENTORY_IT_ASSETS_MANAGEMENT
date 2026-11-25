import { Skeleton } from '@/components/ui/skeleton';

export function ListPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48 max-w-full" />
      <Skeleton className="h-9 w-full sm:max-w-xs" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

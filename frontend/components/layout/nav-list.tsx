'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isActive, type NavGroup } from '@/lib/permissions/navigation';
import { cn } from '@/lib/utils';

type NavListProps = {
  groups: NavGroup[];
  compact?: boolean;
  onNavigate?: () => void;
};

const ROW =
  'flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium pointer-coarse:min-h-11';

/** The navigation links. The desktop sidebar and the mobile drawer both render this. */
export function NavList({ groups, compact = false, onNavigate }: NavListProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label ?? 'top'} className="flex flex-col gap-1">
          {group.label ? (
            <p
              className={cn(
                'px-3 text-xs font-semibold tracking-wide text-neutral-600 uppercase',
                compact && 'sr-only',
              )}
            >
              {group.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const label = (
                <span className={cn('min-w-0 truncate', compact && 'sr-only')}>
                  {item.label}
                </span>
              );
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    title={compact ? item.label : undefined}
                    className={cn(
                      ROW,
                      'hover:text-foreground focus-visible:ring-ring relative text-neutral-700 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none',
                      active &&
                        'bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full',
                      compact && 'justify-center px-0',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

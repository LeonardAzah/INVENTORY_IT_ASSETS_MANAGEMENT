'use client';

import { Boxes, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import type { NavGroup } from '@/lib/permissions/navigation';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';

import { NavList } from './nav-list';

/** Tailwind's `lg` breakpoint, where the desktop sidebar appears. */
const DESKTOP_QUERY = '(min-width: 64rem)';

function Brand({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className="focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-md font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none pointer-coarse:min-h-11"
    >
      <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
        <Boxes className="size-4" aria-hidden />
      </span>
      <span className={cn('truncate', compact && 'sr-only')}>
        Inventory &amp; IT Assets
      </span>
    </Link>
  );
}

/** The sidebar on large screens. It can be narrowed to icons; the choice is remembered. */
export function DesktopSidebar({ groups }: { groups: NavGroup[] }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  return (
    <aside
      className={cn(
        'bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 motion-reduce:transition-none lg:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <Brand compact={collapsed} />
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto p-3',
          collapsed && 'px-2',
        )}
      >
        <NavList groups={groups} compact={collapsed} />
      </div>
    </aside>
  );
}

/**
 * The same navigation as a drawer on small screens. The sheet traps focus, locks the page
 * behind it, and closes on Escape or a tap on the backdrop; following a link closes it too.
 */
export function MobileSidebar({ groups }: { groups: NavGroup[] }) {
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);
  const close = () => setOpen(false);

  // The drawer belongs to small screens only. If the window grows past the breakpoint
  // while it is open, close it: the desktop sidebar has taken over.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (desktop.matches) {
        setOpen(false);
      }
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, [setOpen]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="bg-sidebar w-72 max-w-[85vw] gap-0 p-0 sm:max-w-[85vw]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
          <SheetTitle asChild>
            <div className="min-w-0">
              <Brand onNavigate={close} />
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation
          </SheetDescription>
          <SheetClose>
            <Button variant="ghost" size="icon" aria-label="Close navigation">
              <X aria-hidden />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <NavList groups={groups} onNavigate={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

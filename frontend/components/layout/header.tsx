'use client';

import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser, useLogout } from '@/features/auth/session';
import { roleLabel } from '@/features/auth/types';
import { useUiStore } from '@/stores/ui-store';

const MENU_ITEM = 'cursor-pointer pointer-coarse:min-h-11';

function AccountMenu() {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          className="max-w-full min-w-0 gap-2 px-2"
          aria-label={`Account menu for ${user.name}`}
        >
          <span className="bg-primary-50 text-primary-700 flex size-7 shrink-0 items-center justify-center rounded-full">
            <UserRound className="size-4" aria-hidden />
          </span>
          <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
            <span className="max-w-40 truncate text-sm font-medium">
              {user.name}
            </span>
            <span className="max-w-40 truncate text-xs font-normal text-neutral-600">
              {roleLabel(user)}
            </span>
          </span>
          <ChevronDown
            className="hidden size-4 shrink-0 text-neutral-500 sm:block"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs font-normal text-neutral-600">
            {user.email}
          </span>
          <span className="truncate text-xs font-normal text-neutral-600">
            {roleLabel(user)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={MENU_ITEM}>
          <Link href="/account">
            <UserRound aria-hidden />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={MENU_ITEM}
          disabled={logout.isPending}
          onSelect={(event) => {
            event.preventDefault();
            logout.mutate();
          }}
        >
          <LogOut aria-hidden />
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The bar above the content: navigation toggle on the left, account menu on the right. */
export function Header() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <header className="bg-card sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={collapsed}
        onClick={toggleSidebar}
      >
        <CollapseIcon aria-hidden />
      </Button>
      <div className="ml-auto flex min-w-0 items-center">
        <AccountMenu />
      </div>
    </header>
  );
}

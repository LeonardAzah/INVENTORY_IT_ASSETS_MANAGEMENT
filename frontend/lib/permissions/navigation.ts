import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Building,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FolderTree,
  History,
  LayoutDashboard,
  Mail,
  MapPin,
  MapPinned,
  MonitorSmartphone,
  PackagePlus,
  ListChecks,
  Ruler,
  ScanBarcode,
  ScrollText,
  SlidersHorizontal,
  Tags,
  Undo2,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

import { canAny, type PermissionCode } from './codes';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  show: 'authenticated' | readonly PermissionCode[];
};

export type NavGroup = {
  label: string | null;
  items: NavItem[];
};

export const GENERAL_STOCK_DOCUMENTS: readonly PermissionCode[] = [
  'INVENTORY_ISSUE',
  'INVENTORY_RETURN',
  'INVENTORY_ADJUST',
  'INVENTORY_STOCK_TAKE',
  'REPORT_VIEW_INVENTORY',
];

export const NAVIGATION: readonly NavGroup[] = [
  {
    label: null,
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        show: 'authenticated',
      },
    ],
  },
  {
    label: 'Organization',
    items: [
      {
        label: 'Regions',
        href: '/organization/regions',
        icon: MapPinned,
        show: 'authenticated',
      },
      {
        label: 'Offices',
        href: '/organization/offices',
        icon: Building2,
        show: 'authenticated',
      },
      {
        label: 'Departments',
        href: '/organization/departments',
        icon: Building,
        show: 'authenticated',
      },
      {
        label: 'Locations',
        href: '/organization/locations',
        icon: MapPin,
        show: 'authenticated',
      },
      {
        // Not to holders of INVENTORY_VIEW alone: a Viewer sees no employee register.
        label: 'Employees',
        href: '/employees',
        icon: Users,
        show: [
          'EMPLOYEE_MANAGE',
          'USER_MANAGE',
          'USER_VIEW',
          'INVENTORY_ISSUE',
          'IT_ASSET_VIEW',
        ],
      },
      // Managers and Chiefs of Service see their jurisdiction's accounts, read-only.
      {
        label: 'Users',
        href: '/users',
        icon: UserCog,
        show: ['USER_MANAGE', 'USER_VIEW'],
      },
      {
        label: 'Warehouses',
        href: '/warehouses',
        icon: Warehouse,
        show: ['WAREHOUSE_MANAGE', 'INVENTORY_VIEW'],
      },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      {
        label: 'Items',
        href: '/catalogue/items',
        icon: Boxes,
        show: 'authenticated',
      },
      {
        label: 'Categories',
        href: '/catalogue/categories',
        icon: Tags,
        show: 'authenticated',
      },
      {
        label: 'Units',
        href: '/catalogue/units',
        icon: Ruler,
        show: 'authenticated',
      },
      {
        label: 'Specifications',
        href: '/catalogue/specifications',
        icon: ListChecks,
        show: 'authenticated',
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      {
        label: 'Stock balances',
        href: '/inventory/balances',
        icon: ClipboardList,
        show: ['INVENTORY_VIEW'],
      },
      {
        label: 'Serial numbers',
        href: '/inventory/units',
        icon: ScanBarcode,
        show: ['INVENTORY_VIEW'],
      },
      {
        label: 'Receipts',
        href: '/inventory/receipts',
        icon: ArrowDownToLine,
        show: ['INVENTORY_VIEW'],
      },
      {
        label: 'Issues',
        href: '/inventory/issues',
        icon: ArrowUpFromLine,
        show: GENERAL_STOCK_DOCUMENTS,
      },
      {
        label: 'Returns',
        href: '/inventory/returns',
        icon: Undo2,
        show: GENERAL_STOCK_DOCUMENTS,
      },
      {
        label: 'Adjustments',
        href: '/inventory/adjustments',
        icon: SlidersHorizontal,
        show: GENERAL_STOCK_DOCUMENTS,
      },
      {
        label: 'Stock-takes',
        href: '/inventory/stock-takes',
        icon: ClipboardCheck,
        show: GENERAL_STOCK_DOCUMENTS,
      },
      {
        label: 'Ledger',
        href: '/inventory/transactions',
        icon: History,
        show: ['INVENTORY_VIEW'],
      },
    ],
  },
  {
    label: 'IT assets',
    items: [
      {
        label: 'Asset register',
        href: '/it/assets',
        icon: MonitorSmartphone,
        show: ['IT_ASSET_VIEW'],
      },
      {
        label: 'Pending registration',
        href: '/it/pending-registration',
        icon: PackagePlus,
        show: ['IT_ASSET_REGISTER'],
      },
      {
        label: 'Acquisitions',
        href: '/it/acquisitions',
        icon: FolderTree,
        show: ['IT_ACQUISITION_RECORD'],
      },
    ],
  },
  {
    label: 'Oversight',
    items: [
      {
        label: 'Reports',
        href: '/reports',
        icon: FileBarChart,
        show: ['REPORT_VIEW_INVENTORY', 'REPORT_VIEW_ASSETS', 'AUDIT_VIEW'],
      },
      {
        label: 'Audit log',
        href: '/admin/audit',
        icon: ScrollText,
        show: ['AUDIT_VIEW'],
      },
      {
        label: 'Email log',
        href: '/admin/email-log',
        icon: Mail,
        show: ['AUDIT_VIEW'],
      },
    ],
  },
];

type Holder =
  { permission_codes?: readonly string[] | null } | null | undefined;

/**
 * The navigation a user is offered. Without a user there is none, and a user whose codes
 * are missing or empty gets only what every signed-in person may see.
 */
export function navigationFor(user: Holder): NavGroup[] {
  if (!user) {
    return [];
  }
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.show === 'authenticated' || canAny(user, item.show),
    ),
  })).filter((group) => group.items.length > 0);
}

/** True when `pathname` is the item's page or a page beneath it. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

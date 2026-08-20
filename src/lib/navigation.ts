import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  Gauge,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  ShieldCheck,
  Timer,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Role } from './types';

export type ViewId =
  | 'dashboard'
  | 'decisions'
  | 'directives'
  | 'resolutions'
  | 'incoming'
  | 'my-tasks'
  | 'pending-actions'
  | 'overdue'
  | 'escalated'
  | 'implementation'
  | 'overview'
  | 'sla'
  | 'audit'
  | 'reports'
  | 'users'
  | 'settings'
  | 'matter-detail';

export interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  /** Page title and subtitle shown in the header and page heading. */
  title: string;
  description: string;
  /** Which counter from the derived nav counts to show as a badge. */
  badge?: 'incoming' | 'myTasks' | 'overdue' | 'pendingActions' | 'decisions';
  /** When set, only these roles see the item. The API is authoritative regardless. */
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Sidebar navigation.
 *
 * Hiding an item is a convenience, never a control: every endpoint behind these
 * views authorizes independently, so a user who guesses at a view still gets
 * only the records their role and organizational scope permit.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        title: 'Board Governance Dashboard',
        description:
          'Overview of Board decisions, directives, resolutions and implementation status.',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      {
        id: 'decisions',
        label: 'Board Decisions',
        icon: ClipboardList,
        badge: 'decisions',
        title: 'Board Decisions',
        description: 'Manage and monitor Board decisions and their implementation.',
      },
      {
        id: 'directives',
        label: 'Directives',
        icon: FileText,
        title: 'Directives',
        description: 'Board directives issued to management and their execution status.',
      },
      {
        id: 'resolutions',
        label: 'Resolutions',
        icon: ScrollText,
        title: 'Resolutions',
        description: 'Formal Board resolutions and the actions taken against them.',
      },
      {
        id: 'incoming',
        label: 'Incoming Matters',
        icon: Inbox,
        badge: 'incoming',
        title: 'Incoming Matters',
        description: 'Board matters routed to you and awaiting acceptance of ownership.',
      },
    ],
  },
  {
    label: 'Work Queue',
    items: [
      {
        id: 'my-tasks',
        label: 'My Tasks',
        icon: ListChecks,
        badge: 'myTasks',
        title: 'My Tasks',
        description: 'Board matters you currently own, grouped by how soon they are due.',
      },
      {
        id: 'pending-actions',
        label: 'Pending Actions',
        icon: ClipboardCheck,
        badge: 'pendingActions',
        title: 'Pending Actions',
        description: 'Matters waiting on a specific action from you before they can move on.',
      },
      {
        id: 'overdue',
        label: 'Overdue Matters',
        icon: AlertTriangle,
        badge: 'overdue',
        title: 'Overdue Matters',
        description: 'Board matters past their deadline, grouped by how long they have been late.',
      },
      {
        id: 'escalated',
        label: 'Escalated Matters',
        icon: TrendingUp,
        title: 'Escalated Matters',
        description: 'Matters formally escalated for management attention.',
      },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      {
        id: 'implementation',
        label: 'Implementation Tracking',
        icon: FileCheck2,
        title: 'Implementation Tracking',
        description: 'Execution progress and supporting evidence for each Board matter.',
      },
      {
        id: 'overview',
        label: 'Decision Overview',
        icon: Gauge,
        title: 'Decision Overview',
        description: 'Distribution of Board matters by type, status, priority and business area.',
      },
      {
        id: 'sla',
        label: 'SLA & Aging',
        icon: Timer,
        title: 'SLA & Aging',
        description: 'How long matters have been open and how they sit against their deadlines.',
      },
    ],
  },
  {
    label: 'Audit & Reporting',
    items: [
      {
        id: 'audit',
        label: 'Audit Trail',
        icon: ShieldCheck,
        title: 'Audit Trail',
        description: 'Complete, immutable history of every action taken on a Board matter.',
      },
      {
        id: 'reports',
        label: 'Reports',
        icon: BarChart3,
        title: 'Reports',
        description: 'Management and Board Secretariat reporting across all governance activity.',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        id: 'users',
        label: 'Users & Roles',
        icon: Users,
        title: 'Users & Roles',
        description: 'Officers holding roles in the Board governance workflow.',
        roles: ['BOARD_SECRETARIAT', 'ADMIN'],
      },
      {
        id: 'settings',
        label: 'Governance Settings',
        icon: Settings,
        title: 'Governance Settings',
        description: 'Configuration governing how Board matters are classified and tracked.',
        roles: ['BOARD_SECRETARIAT', 'ADMIN'],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function navItem(id: ViewId): NavItem | undefined {
  return ALL_NAV_ITEMS.find((i) => i.id === id);
}

export function visibleGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}

export function canSeeView(role: Role, id: ViewId): boolean {
  const item = navItem(id);
  if (!item) return true;
  return !item.roles || item.roles.includes(role);
}

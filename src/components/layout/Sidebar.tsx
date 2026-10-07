'use client';

import React, { useEffect } from 'react';
import { NibLogoImage } from '@/components/ui/NibLogoImage';
import { ChevronLeft, X } from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import { RailRelief } from '@/components/layout/HexRelief';
import { Role } from '@/lib/types';
import { NavItem, ViewId, visibleGroups } from '@/lib/navigation';

export interface NavCounts {
  incoming: number;
  myTasks: number;
  overdue: number;
  pendingActions: number;
  decisions: number;
  closed?: number;
  /** Unread announcements addressed to this user. */
  announcements?: number;
  /** Matters in the reminder queue that are already past their deadline. */
  reminders?: number;
  /** Open matters with an open escalation. */
  escalated?: number;
}

interface SidebarProps {
  role: Role;
  /** What the user's role is permitted to do; gates the permission-based items. */
  permissions: readonly string[];
  active: ViewId;
  onNavigate: (id: ViewId) => void;
  counts: NavCounts;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/** The institution's lockup. The name drops away when the rail shows icons only. */
const Brand: React.FC<{ showName: boolean; size: number }> = ({ showName, size }) => (
  <div className="flex items-center gap-3 min-w-0">
    <NibLogoImage size={size} className="rounded-lg object-contain shrink-0" />
    {showName && (
      <div className="min-w-0 leading-tight">
        <p className="text-[12px] font-bold tracking-tight text-ink truncate">
          NIB INTERNATIONAL BANK S.C.
        </p>
        <p className="text-[10px] font-semibold tracking-wider uppercase text-nib-gold-600 dark:text-nib-gold-400 truncate">
          Board Governance
        </p>
      </div>
    )}
  </div>
);

/**
 * The navigation rail, from the NIB design kit.
 *
 * A light rail over the hexagon relief: gold marks the active item and the
 * collapse control and nothing else, which keeps "where am I" unambiguous on a
 * screen with a lot of status colour. On the desktop it collapses to icons; below
 * `lg` it becomes a drawer over the page.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  role,
  permissions,
  active,
  onNavigate,
  counts,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}) => {
  const groups = visibleGroups(role, permissions);

  // Escape closes the drawer, and a locked body stops the page scrolling
  // underneath it.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, onCloseMobile]);

  const badgeFor = (item: NavItem): number | null => {
    if (!item.badge) return null;
    const value = counts[item.badge];
    return value && value > 0 ? value : null;
  };

  const NavButton: React.FC<{ item: NavItem; compact: boolean }> = ({ item, compact }) => {
    const Icon = item.icon;
    const on = active === item.id;
    const badge = badgeFor(item);
    const urgent =
      item.badge === 'overdue' || item.badge === 'reminders' || item.badge === 'escalated';

    return (
      <button
        type="button"
        onClick={() => {
          onNavigate(item.id);
          onCloseMobile();
        }}
        aria-current={on ? 'page' : undefined}
        title={compact ? item.label : undefined}
        className={cn(
          'group relative flex w-full h-10 items-center rounded-(--radius-control) text-[14px]',
          'transition-colors duration-150',
          compact ? 'justify-center px-0' : 'gap-3 px-3.5',
          on
            ? 'bg-nib-gold-500/15 font-semibold text-nib-gold-800 dark:bg-nib-gold-500/12 dark:text-nib-gold-400'
            : 'text-sidebar-ink hover:bg-sidebar-2'
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'w-5 h-5 shrink-0 transition-colors',
            on
              ? 'text-nib-gold-700 dark:text-nib-gold-400'
              : 'text-sidebar-ink-2 group-hover:text-sidebar-ink'
          )}
        />

        {!compact && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}

        {badge !== null && (
          <span
            className={cn(
              'tabular shrink-0 rounded-full text-[10.5px] font-bold leading-none',
              urgent
                ? 'bg-st-late text-on-late'
                : 'bg-nib-gold-500 text-nib-brown-900',
              compact
                ? 'absolute right-1.5 top-1 h-4 min-w-4 px-1 py-0.5 ring-2 ring-sidebar'
                : 'px-2 py-1'
            )}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}

        {/* The rail's edge marker: it sits in the nav's gutter, flush with the
            rail's right edge, so the active page is found by scanning one line. */}
        {on && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-0 w-1 rounded-l-md bg-nib-gold-500',
              compact ? '-right-2' : '-right-3'
            )}
          />
        )}

        {/* The label must still reach a screen reader when the rail shows icons. */}
        {compact && <span className="sr-only">{item.label}</span>}
      </button>
    );
  };

  const nav = (compact: boolean) => (
    <nav
      aria-label="Primary"
      className={cn(
        'scroll-quiet flex flex-1 flex-col gap-5 overflow-y-auto pb-6 pt-2',
        compact ? 'px-2' : 'px-3'
      )}
    >
      {groups.map((group) => (
        <div key={group.label}>
          {compact ? (
            <div className="mx-auto mb-2 h-px w-6 bg-sidebar-line" aria-hidden="true" />
          ) : (
            <h2 className="mb-1.5 px-3.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-sidebar-ink-2">
              {group.label}
            </h2>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <NavButton item={item} compact={compact} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop rail. Raised above the content column so the collapse toggle,
          which straddles the rail's edge, stays clickable over the header band. */}
      <aside
        className={cn(
          'no-print relative z-40 hidden lg:flex flex-col shrink-0 bg-sidebar shadow-rail',
          // A hairline in both themes: with the honeycomb on both sides of the
          // edge, the shadow alone no longer says where the rail ends.
          'border-r border-sidebar-line',
          'transition-[width] duration-200 ease-out',
          collapsed ? 'w-[4.5rem]' : 'w-[17rem]'
        )}
      >
        <RailRelief />

        <div
          className={cn(
            'flex h-[4.5rem] shrink-0 items-center',
            collapsed ? 'justify-center px-2' : 'px-5'
          )}
        >
          <Brand showName={!collapsed} size={collapsed ? 32 : 36} />
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={cn(
            'absolute -right-3.5 top-[1.375rem] flex h-7 w-7 items-center justify-center rounded-full',
            'bg-nib-gold-500 text-nib-brown-900 shadow-brand ring-[5px] ring-app',
            'transition-[background-color,transform] duration-150 hover:bg-nib-gold-400 active:scale-95'
          )}
        >
          <ChevronLeft
            aria-hidden="true"
            className={cn('h-4 w-4 shrink-0 transition-transform duration-200', collapsed && 'rotate-180')}
          />
          <span className="sr-only">{collapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
        </button>

        {nav(collapsed)}
      </aside>

      {/* Mobile drawer. The collapsed setting does not apply: it always shows labels. */}
      {mobileOpen && (
        <div className="no-print lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-scrim backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col bg-sidebar shadow-overlay dark:border-r dark:border-sidebar-line"
          >
            <RailRelief />
            <div className="flex h-[4.5rem] shrink-0 items-center justify-between gap-2 px-5">
              <Brand showName size={34} />
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-control) text-sidebar-ink-2 transition-colors hover:bg-sidebar-2 hover:text-sidebar-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}
    </>
  );
};

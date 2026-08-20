'use client';

import React from 'react';
import Image from 'next/image';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import { Role } from '@/lib/types';
import { NavItem, ViewId, visibleGroups } from '@/lib/navigation';

export interface NavCounts {
  incoming: number;
  myTasks: number;
  overdue: number;
  pendingActions: number;
  decisions: number;
}

interface SidebarProps {
  role: Role;
  active: ViewId;
  onNavigate: (id: ViewId) => void;
  counts: NavCounts;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * Fixed navigation rail.
 *
 * Dark NIB brown so the working area stays the warm neutral the records are read
 * against; gold marks the active item and nothing else, which keeps "where am I"
 * unambiguous on a screen with a lot of status colour.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  role,
  active,
  onNavigate,
  counts,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}) => {
  const groups = visibleGroups(role);

  const badgeFor = (item: NavItem): number | null => {
    if (!item.badge) return null;
    const value = counts[item.badge];
    return value > 0 ? value : null;
  };

  const NavButton: React.FC<{ item: NavItem }> = ({ item }) => {
    const Icon = item.icon;
    const on = active === item.id;
    const badge = badgeFor(item);
    const urgent = item.badge === 'overdue';

    return (
      <button
        onClick={() => {
          onNavigate(item.id);
          onCloseMobile();
        }}
        aria-current={on ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-lg transition-colors group relative',
          collapsed ? 'px-0 justify-center h-9' : 'px-2.5 h-9',
          on
            ? 'bg-nib-gold-500 text-nib-brown-900 font-semibold shadow-card'
            : 'text-sidebar-ink/85 hover:bg-white/8 hover:text-sidebar-ink font-medium'
        )}
      >
        <Icon className={cn('w-4 h-4 shrink-0', on ? 'text-nib-brown-800' : 'text-sidebar-ink-2 group-hover:text-sidebar-ink')} />
        {!collapsed && <span className="text-[13px] truncate flex-1 text-left">{item.label}</span>}
        {badge !== null &&
          (collapsed ? (
            <span
              className={cn(
                'absolute top-1 right-1 w-1.5 h-1.5 rounded-full',
                urgent ? 'bg-st-late' : 'bg-nib-gold-400'
              )}
            />
          ) : (
            <span
              className={cn(
                'text-[11px] font-bold tabular px-1.5 py-0.5 rounded shrink-0',
                on
                  ? 'bg-nib-brown-800/15 text-nib-brown-900'
                  : urgent
                    ? 'bg-st-late/20 text-st-late'
                    : 'bg-white/10 text-sidebar-ink'
              )}
            >
              {badge}
            </span>
          ))}
      </button>
    );
  };

  const content = (
    <>
      {/* Branding */}
      <div
        className={cn(
          'flex items-center gap-2.5 border-b border-sidebar-line shrink-0',
          collapsed ? 'px-3 justify-center h-14' : 'px-4 h-14'
        )}
      >
        <Image
          src="/nib-logo.png"
          alt=""
          width={32}
          height={32}
          priority
          className="w-8 h-8 rounded-md object-contain shrink-0"
        />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-sidebar-ink leading-tight truncate">
              NIB INTERNATIONAL BANK S.C.
            </p>
            <p className="text-[10px] text-nib-gold-400 font-semibold tracking-wide leading-tight">
              BOARD GOVERNANCE
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        aria-label="Primary"
        className={cn('flex-1 overflow-y-auto py-3 space-y-4', collapsed ? 'px-2' : 'px-3')}
      >
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-ink-2">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mx-2 mb-2 border-t border-sidebar-line" />}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavButton key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle — desktop only */}
      <div className="hidden lg:block border-t border-sidebar-line p-2 shrink-0">
        <button
          onClick={onToggleCollapsed}
          className={cn(
            'w-full flex items-center gap-2 h-8 rounded-lg text-sidebar-ink-2 hover:bg-white/8 hover:text-sidebar-ink transition-colors',
            collapsed ? 'justify-center' : 'px-2.5'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span className="text-[12px] font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-sidebar border-r border-sidebar-line shrink-0',
          'transition-[width] duration-200',
          collapsed ? 'w-[4.5rem]' : 'w-[17rem]'
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-nib-brown-900/60 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative flex flex-col w-[17rem] max-w-[85vw] bg-sidebar border-r border-sidebar-line shadow-overlay">
            <button
              onClick={onCloseMobile}
              className="absolute top-3.5 right-3 text-sidebar-ink-2 hover:text-sidebar-ink"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
};

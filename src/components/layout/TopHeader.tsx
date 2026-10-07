'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { useTheme, ThemePreference } from '@/context/ThemeContext';
import { cn, StatusBadge, TypeChip } from '@/components/ui/primitives';
import { BODMatter } from '@/lib/types';
import { ViewId } from '@/lib/navigation';
import { PERMISSIONS } from '@/lib/permissions';

const ROLE_LABEL: Record<string, string> = {
  BOARD_SECRETARIAT: 'Board Secretariat',
  CEO: 'Chief Executive Officer',
  CHIEF: 'Chief Officer',
  DEPUTY_CHIEF: 'Deputy Chief',
  DIRECTOR: 'Director',
  ADMIN: 'Administrator',
};

interface TopHeaderProps {
  onOpenMobileNav: () => void;
  onSelectMatter: (m: BODMatter) => void;
  onNavigate: (v: ViewId) => void;
}

/** The account's initials on the brand gradient, with a presence dot. */
const Avatar: React.FC<{ initials: string; size?: 'md' | 'lg' }> = ({ initials, size = 'md' }) => (
  <span className="relative shrink-0">
    <span
      className={cn(
        'flex items-center justify-center rounded-full bg-gradient-to-br from-nib-brown-700 to-nib-brown-900 font-bold text-nib-gold-200',
        size === 'lg' ? 'h-11 w-11 text-[13px]' : 'h-10 w-10 text-[12px]'
      )}
    >
      {initials}
    </span>
    <span
      aria-hidden="true"
      className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-st-done ring-2 ring-surface"
    />
  </span>
);

/** Closes a popover when focus or a click leaves it. */
function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return ref;
}

/** A round icon button, the shape every header control shares. */
const HEADER_BUTTON =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink';

/** Every header popover: a panel floating below its trigger. */
const POPOVER =
  'absolute right-0 top-full z-50 mt-3 overflow-hidden rounded-(--radius-card) border border-transparent bg-surface shadow-overlay dark:border-line';

/**
 * The application header, from the NIB design kit: a card floating above the
 * page, with the menu trigger and global search on the left, and appearance,
 * notifications and the account menu pinned to the right.
 *
 * It carries no page title. Every view states its own in its page heading, so a
 * title here named each screen twice, a few pixels apart.
 */
export const TopHeader: React.FC<TopHeaderProps> = ({
  onOpenMobileNav,
  onSelectMatter,
  onNavigate,
}) => {
  const { matters, notifications, markNotificationRead, markAllNotificationsRead, logout, can } =
    useAuth();
  const currentUser = useAuthenticatedUser();
  const { preference, setPreference } = useTheme();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const searchRef = useDismiss(() => setSearchOpen(false));
  const themeRef = useDismiss(() => setThemeOpen(false));
  const notifRef = useDismiss(() => setNotifOpen(false));
  const menuRef = useDismiss(() => setMenuOpen(false));

  const unread = notifications.filter((n) => !n.isRead);
  const initials = currentUser.name.split(' ').map((p) => p[0]).slice(0, 2).join('');

  /**
   * Global search runs over the matters already loaded for this user, which the
   * API has scoped — so it can never surface a record the user cannot open.
   */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return matters
      .filter((m) =>
        [
          m.id,
          m.resolutionNumber,
          m.title,
          m.matterType,
          m.status,
          m.businessArea,
          m.currentOwnerName,
          m.responsibleDirectorName,
        ]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [query, matters]);

  // Ctrl/Cmd-K focuses search, as in the rest of the bank's internal tools.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const THEMES: Array<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];
  const currentTheme = THEMES.find((t) => t.id === preference) ?? THEMES[2];
  const ThemeIcon = currentTheme.icon;

  return (
    <header className="flex h-16 items-center gap-2 rounded-(--radius-card) bg-surface px-3 shadow-card sm:px-5 dark:border dark:border-line">
      <button type="button" onClick={onOpenMobileNav} className={cn(HEADER_BUTTON, 'lg:hidden')}>
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </button>

      {/* Global search */}
      <div ref={searchRef} role="search" className="relative min-w-0 max-w-md flex-1">
        <div className="relative rounded-(--radius-control) transition-[background-color,box-shadow] duration-150 focus-within:bg-surface-2 focus-within:ring-2 focus-within:ring-nib-gold-500/30">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-2"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search decisions, directives, references…"
            aria-label="Search Board matters"
            className="h-10 w-full bg-transparent pl-10 pr-2 sm:pr-12 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 text-[12px] font-medium text-ink-3 sm:block">
            ⌘K
          </kbd>
        </div>

        {searchOpen && query.trim().length >= 2 && (
          <div className={cn(POPOVER, 'left-0')}>
            {results.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-ink-3 text-center">
                No Board matters match “{query}”.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-line">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        onSelectMatter(m);
                        setSearchOpen(false);
                        setQuery('');
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-bold text-ink tabular">{m.id}</span>
                        <TypeChip type={m.matterType} />
                        <StatusBadge status={m.status} className="ml-auto" />
                      </div>
                      <p className="text-[12px] text-ink-2 truncate">{m.title}</p>
                      <p className="text-[11px] text-ink-3 truncate">
                        {m.currentOwnerName} · {m.businessArea}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Appearance */}
        <div ref={themeRef} className="relative">
          <button
            type="button"
            onClick={() => setThemeOpen((o) => !o)}
            aria-expanded={themeOpen}
            aria-haspopup="menu"
            aria-label={`Appearance: ${currentTheme.label}`}
            title="Appearance"
            className={cn(HEADER_BUTTON, themeOpen && 'bg-surface-2 text-ink')}
          >
            <ThemeIcon className="h-5 w-5" aria-hidden="true" />
          </button>

          {themeOpen && (
            <div role="menu" aria-label="Appearance" className={cn(POPOVER, 'w-44 p-1.5')}>
              {THEMES.map((t) => {
                const on = t.id === preference;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      setPreference(t.id);
                      setThemeOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-left text-[13px] transition-colors',
                      on
                        ? 'bg-nib-gold-500/15 font-semibold text-nib-gold-800 dark:text-nib-gold-400'
                        : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{t.label}</span>
                    {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            aria-expanded={notifOpen}
            className={cn(HEADER_BUTTON, notifOpen && 'bg-surface-2 text-ink')}
            aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unread.length > 0 && (
              <span className="tabular absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-st-late px-1 text-[10px] font-bold text-on-late ring-2 ring-surface">
                {unread.length > 9 ? '9+' : unread.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className={cn(POPOVER, 'w-[22rem] max-w-[calc(100vw-2rem)]')}>
              <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-3">
                <h3 className="text-[13px] font-bold text-ink">Notifications</h3>
                {unread.length > 0 && (
                  <button
                    onClick={() => markAllNotificationsRead()}
                    className="text-[11px] font-semibold text-nib-gold-700 dark:text-nib-gold-400 hover:underline inline-flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="px-3 py-8 text-[12px] text-ink-3 text-center">
                  You have no notifications.
                </p>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-line">
                  {notifications.slice(0, 15).map((n) => {
                    // A notification points at a matter or at an announcement.
                    // Whichever it is, clicking it opens that thing — an entry
                    // that goes nowhere is worse than no entry at all.
                    const targetMatter = n.matterId
                      ? matters.find((m) => m.id === n.matterId)
                      : undefined;
                    const opens = Boolean(targetMatter) || Boolean(n.announcementId);
                    return (
                      <li
                        key={n.id}
                        onClick={() => {
                          if (!n.isRead) {
                            markNotificationRead(n.id);
                          }
                          if (targetMatter) {
                            onSelectMatter(targetMatter);
                            setNotifOpen(false);
                          } else if (n.announcementId) {
                            onNavigate('announcements');
                            setNotifOpen(false);
                          }
                        }}
                        className={cn(
                          'px-3 py-2.5 transition-colors cursor-pointer group border-l-2',
                          n.priority === 'Urgent'
                            ? 'border-st-late'
                            : !n.isRead
                              ? 'border-nib-gold-500'
                              : 'border-transparent',
                          !n.isRead
                            ? 'bg-nib-gold-100/40 dark:bg-nib-brown-900/30 hover:bg-nib-gold-100/70 dark:hover:bg-nib-brown-900/50'
                            : 'hover:bg-surface-2 opacity-85 hover:opacity-100'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {!n.isRead && (
                                <span className="w-1.5 h-1.5 rounded-full bg-nib-gold-600 shrink-0" />
                              )}
                              <p className="text-[12px] font-semibold text-ink leading-snug group-hover:text-nib-gold-700 dark:group-hover:text-nib-gold-300 transition-colors">
                                {n.title}
                              </p>
                            </div>
                            <p className="text-[11px] text-ink-2 mt-0.5 leading-snug">{n.message}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-ink-3 tabular">
                                {new Date(n.timestamp).toLocaleString()}
                              </span>
                              {opens && (
                                <span className="text-[10px] font-medium text-nib-gold-700 dark:text-nib-gold-400 group-hover:underline">
                                  {targetMatter ? 'View matter →' : 'View announcement →'}
                                </span>
                              )}
                            </div>
                          </div>
                          {!n.isRead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotificationRead(n.id);
                              }}
                              className="p-1 rounded text-ink-3 hover:text-st-done hover:bg-surface-3 shrink-0 transition"
                              title="Mark this notification as read"
                              aria-label="Mark as read"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Account */}
        <div ref={menuRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex rounded-full transition-shadow hover:ring-4 hover:ring-nib-gold-500/20"
            aria-label={`Account menu for ${currentUser.name}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title={currentUser.name}
          >
            <Avatar initials={initials} />
          </button>

          {menuOpen && (
            <div className={cn(POPOVER, 'w-72')}>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line">
                <Avatar initials={initials} size="lg" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink truncate">{currentUser.name}</p>
                  <p className="text-[12px] text-ink-2 truncate">
                    {ROLE_LABEL[currentUser.role] ?? currentUser.role}
                    {currentUser.title ? ` · ${currentUser.title}` : ''}
                  </p>
                  <p className="text-[11px] text-ink-3 truncate mt-0.5">{currentUser.email}</p>
                </div>
              </div>

              <div className="px-4 py-3 border-b border-line">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
                  Organizational scope
                </p>
                <p className="text-[13px] text-ink mt-1">{currentUser.businessArea}</p>
              </div>

              {can(PERMISSIONS.CONFIGURE_SETTINGS) && (
                <button
                  onClick={() => {
                    onNavigate('settings');
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-ink hover:bg-surface-2 transition-colors"
                >
                  <UserIcon className="h-4 w-4 text-ink-3" aria-hidden="true" /> Governance settings
                </button>
              )}

              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-st-late hover:bg-st-late-bg transition-colors border-t border-line"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

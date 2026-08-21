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
import { cn, StatusBadge, TypeChip, inputClass } from '@/components/ui/primitives';
import { BODMatter } from '@/lib/types';
import { ViewId, navItem } from '@/lib/navigation';

const ROLE_LABEL: Record<string, string> = {
  BOARD_SECRETARIAT: 'Board Secretariat',
  CEO: 'Chief Executive Officer',
  CHIEF: 'Chief Officer',
  DEPUTY_CHIEF: 'Deputy Chief',
  DIRECTOR: 'Director',
  ADMIN: 'Administrator',
};

interface TopHeaderProps {
  view: ViewId;
  onOpenMobileNav: () => void;
  onSelectMatter: (m: BODMatter) => void;
  onNavigate: (v: ViewId) => void;
}

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

export const TopHeader: React.FC<TopHeaderProps> = ({
  view,
  onOpenMobileNav,
  onSelectMatter,
  onNavigate,
}) => {
  const { matters, notifications, markNotificationRead, markAllNotificationsRead, logout } =
    useAuth();
  const currentUser = useAuthenticatedUser();
  const { preference, setPreference } = useTheme();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const searchRef = useDismiss(() => setSearchOpen(false));
  const notifRef = useDismiss(() => setNotifOpen(false));
  const menuRef = useDismiss(() => setMenuOpen(false));

  const item = navItem(view);
  const unread = notifications.filter((n) => !n.isRead);

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

  const THEMES: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
    { id: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5" /> },
    { id: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="h-14 shrink-0 bg-surface border-b border-line flex items-center gap-3 px-3 sm:px-4 sticky top-0 z-30">
      <button
        onClick={onOpenMobileNav}
        className="lg:hidden p-2 -ml-1 rounded-lg text-ink-2 hover:bg-surface-2"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page identity */}
      <div className="min-w-0 hidden sm:block">
        <h2 className="text-[13px] font-semibold text-ink leading-tight truncate">
          {item?.title ?? 'Board Governance'}
        </h2>
        <p className="text-[11px] text-ink-3 leading-tight truncate">
          Decision &amp; Implementation Management
        </p>
      </div>

      {/* Global search */}
      <div ref={searchRef} className="relative flex-1 max-w-md mx-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
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
          className={cn(inputClass, 'h-8 pl-8 pr-12 text-[12px] bg-surface-2')}
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:block text-[10px] text-ink-3 border border-line rounded px-1 py-0.5 pointer-events-none">
          ⌘K
        </kbd>

        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface border border-line rounded-[--radius-card] shadow-overlay overflow-hidden z-50">
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

      {/* Notifications */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen((o) => !o)}
          className="relative p-2 rounded-lg text-ink-2 hover:bg-surface-2 transition-colors"
          aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {unread.length > 0 && (
            <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-st-late text-white text-[9px] font-bold flex items-center justify-center tabular">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 mt-1.5 w-[21rem] max-w-[92vw] bg-surface border border-line rounded-[--radius-card] shadow-overlay overflow-hidden z-50">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-line">
              <h3 className="text-[13px] font-semibold text-ink">Notifications</h3>
              {unread.length > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-[11px] font-medium text-nib-gold-700 hover:underline inline-flex items-center gap-1"
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
                  const targetMatter = matters.find((m) => m.id === n.matterId);
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
                        }
                      }}
                      className={cn(
                        'px-3 py-2.5 transition-colors cursor-pointer group',
                        !n.isRead
                          ? 'bg-nib-gold-100/40 dark:bg-nib-brown-900/30 border-l-2 border-nib-gold-500 hover:bg-nib-gold-100/70 dark:hover:bg-nib-brown-900/50'
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
                            {targetMatter && (
                              <span className="text-[10px] font-medium text-nib-gold-700 dark:text-nib-gold-400 group-hover:underline">
                                View matter →
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

      {/* Profile + theme */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 pl-1.5 pr-2 h-9 rounded-lg hover:bg-surface-2 transition-colors"
          aria-label="Account menu"
          aria-expanded={menuOpen}
        >
          <span className="w-7 h-7 rounded-full bg-nib-brown-700 text-nib-gold-200 text-[11px] font-bold flex items-center justify-center shrink-0">
            {currentUser.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </span>
          <span className="hidden md:block text-left min-w-0">
            <span className="block text-[12px] font-semibold text-ink leading-tight truncate max-w-[10rem]">
              {currentUser.name}
            </span>
            <span className="block text-[10px] text-ink-3 leading-tight truncate max-w-[10rem]">
              {ROLE_LABEL[currentUser.role] ?? currentUser.role}
            </span>
          </span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-1.5 w-64 bg-surface border border-line rounded-[--radius-card] shadow-overlay overflow-hidden z-50">
            <div className="px-3 py-3 border-b border-line">
              <p className="text-[13px] font-semibold text-ink truncate">{currentUser.name}</p>
              <p className="text-[11px] text-ink-2 truncate">{currentUser.title}</p>
              <p className="text-[11px] text-ink-3 truncate mt-0.5">{currentUser.email}</p>
            </div>

            <div className="px-3 py-2.5 border-b border-line">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-1.5">
                Organizational scope
              </p>
              <p className="text-[12px] text-ink-2">{currentUser.businessArea}</p>
            </div>

            <div className="px-3 py-2.5 border-b border-line">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-1.5">
                Appearance
              </p>
              <div className="grid grid-cols-3 gap-1" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPreference(t.id)}
                    aria-pressed={preference === t.id}
                    className={cn(
                      'flex flex-col items-center gap-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors',
                      preference === t.id
                        ? 'bg-nib-gold-100 border-nib-gold-500 text-nib-brown-800 dark:bg-nib-brown-700/30 dark:text-nib-gold-200'
                        : 'border-line text-ink-3 hover:bg-surface-2'
                    )}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {(currentUser.role === 'BOARD_SECRETARIAT' || currentUser.role === 'ADMIN') && (
              <button
                onClick={() => {
                  onNavigate('settings');
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-ink-2 hover:bg-surface-2 transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5" /> Governance settings
              </button>
            )}

            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-st-late hover:bg-st-late-bg transition-colors border-t border-line"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

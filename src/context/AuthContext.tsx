'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, BODMatter, AppNotification, DashboardMetrics } from '@/lib/types';

interface AuthContextType {
  currentUser: User | null;
  allUsers: User[];
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  mustChangePassword: boolean;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  matters: BODMatter[];
  notifications: AppNotification[];
  metrics: DashboardMetrics | null;
  matterTypes: string[];
  isLoading: boolean;
  error: string | null;
  serverDown: boolean;
  retryConnection: () => void;
  refreshUsers: () => Promise<void>;
  refreshMatters: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshMatterTypes: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addMatterType: (name: string) => Promise<void>;
  removeMatterType: (name: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Identity lives in an httpOnly session cookie set by /api/auth/session, so the
 * browser cannot read or forge it and every request is authorized server-side.
 * Nothing here is trusted for access control — the client only mirrors what the
 * server already decided it may see.
 */
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setUser] = useState<User | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [matters, setMatters] = useState<BODMatter[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [matterTypes, setMatterTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [serverDown, setServerDown] = useState(false);

  const isAuthenticated = currentUser !== null;

  const refreshUsers = useCallback(async () => {
    const res = await fetch('/api/users');
    if (res.ok) setAllUsers(await res.json());
  }, []);

  const refreshMatters = useCallback(async () => {
    try {
      const res = await fetch('/api/matters');
      if (res.ok) setMatters(await res.json());
      else if (res.status === 401) setUser(null);
    } catch {
      setError('Unable to load BOD matters.');
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    const res = await fetch('/api/notifications');
    if (res.ok) setNotifications(await res.json());
  }, []);

  const refreshMetrics = useCallback(async () => {
    const res = await fetch('/api/metrics');
    if (res.ok) setMetrics(await res.json());
  }, []);

  const refreshMatterTypes = useCallback(async () => {
    const res = await fetch('/api/matter-types');
    if (res.ok) setMatterTypes(await res.json());
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      refreshUsers(),
      refreshMatters(),
      refreshNotifications(),
      refreshMetrics(),
      refreshMatterTypes(),
    ]);
    setIsLoading(false);
  }, [refreshUsers, refreshMatters, refreshNotifications, refreshMetrics, refreshMatterTypes]);

  // Restore any existing session. The officer directory is no longer public,
  // so it is loaded with the rest of the data once the account is usable.
  const attemptSessionRestore = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const { user, mustChangePassword: mustChange } = await res.json();
        if (user) {
          setUser(user);
          setMustChangePassword(Boolean(mustChange));
          setServerDown(false);
          return;
        }
      }
      // Any HTTP response means the server is up, even 401.
      setServerDown(false);
    } catch {
      setServerDown(true);
      setError('Unable to reach the server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void attemptSessionRestore();
  }, [attemptSessionRestore]);

  // Data is only loaded once the account is fully usable. While a forced
  // password change is outstanding the API refuses everything else anyway.
  useEffect(() => {
    if (currentUser && !mustChangePassword) void refreshAll();
  }, [currentUser, mustChangePassword, refreshAll]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const payload = await res.json().catch(() => ({ error: 'Sign-in failed' }));
    if (!res.ok) {
      return { success: false as const, error: payload.error as string };
    }
    setUser(payload.user);
    setMustChangePassword(Boolean(payload.mustChangePassword));
    return { success: true as const };
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const payload = await res.json().catch(() => ({ error: 'Could not change password' }));
    if (!res.ok) {
      return { success: false as const, error: payload.error as string };
    }
    setMustChangePassword(false);
    return { success: true as const };
  };

  const logout = () => {
    void fetch('/api/auth/session', { method: 'DELETE' }).then(() => {
      setUser(null);
      setMustChangePassword(false);
      setAllUsers([]);
      setMatters([]);
      setNotifications([]);
      setMetrics(null);
    });
  };

  const markNotificationRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/mark-read`, { method: 'POST' });
    await refreshNotifications();
  };

  const markAllNotificationsRead = async () => {
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    await refreshNotifications();
  };

  const addMatterType = async (name: string) => {
    const res = await fetch('/api/matter-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const { matterTypes: types } = await res.json();
      setMatterTypes(types);
    }
  };

  const removeMatterType = async (name: string) => {
    try {
      const res = await fetch('/api/matter-types', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to remove matter type' };
      }
      if (data.matterTypes) {
        setMatterTypes(data.matterTypes);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Could not reach the server' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        allUsers,
        isAuthenticated,
        login,
        logout,
        mustChangePassword,
        changePassword,
        matters,
        notifications,
        metrics,
        matterTypes,
        isLoading,
        error,
        serverDown,
        retryConnection: attemptSessionRestore,
        refreshUsers,
        refreshMatters,
        refreshNotifications,
        refreshMetrics,
        refreshMatterTypes,
        markNotificationRead,
        markAllNotificationsRead,
        addMatterType,
        removeMatterType,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

/**
 * The signed-in user, narrowed to non-null.
 *
 * Everything inside the authenticated shell renders only once a session exists,
 * so those components can treat the user as present. This keeps `currentUser`
 * honestly nullable on the context — the login portal genuinely has no user —
 * without forcing a null check into every consumer.
 */
export const useAuthenticatedUser = (): User => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    throw new Error('useAuthenticatedUser was called outside an authenticated session');
  }
  return currentUser;
};

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = 'nib-theme';

/**
 * Light / Dark / System.
 *
 * "System" stores no class and follows the OS, so a user who changes their
 * desktop theme mid-session sees the application follow without reloading.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  const apply = useCallback((pref: ThemePreference) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.style.colorScheme = next;
    setResolved(next);
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system';
    setPreferenceState(stored);
    apply(stored);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as ThemePreference | null) === 'light') return;
      if ((localStorage.getItem(STORAGE_KEY) as ThemePreference | null) === 'dark') return;
      apply('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [apply]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      localStorage.setItem(STORAGE_KEY, p);
      setPreferenceState(p);
      apply(p);
    },
    [apply]
  );

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

/**
 * Applies the stored theme before first paint. Without this the page renders
 * light and then flips, which is very visible on a dark-themed desktop.
 */
export const themeBootstrapScript = `
(function(){try{
  var p = localStorage.getItem('${STORAGE_KEY}') || 'system';
  var d = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', d);
  document.documentElement.style.colorScheme = d ? 'dark' : 'light';
}catch(e){}})();
`;

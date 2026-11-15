"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
interface Appearance {
  theme: Theme;
  tint: number;
  setTheme: (theme: Theme) => void;
  setTint: (tint: number) => void;
}

const KEY = "muzikku.appearance";
const AppearanceContext = createContext<Appearance | null>(null);

export function glassAlpha(tint: number): string {
  return (0.4 + (tint / 100) * 0.48).toFixed(3);
}

export function applyAppearance(theme: Theme, tint: number) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty("--glass-alpha", glassAlpha(tint));
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [tint, setTintState] = useState(48);
  const tintTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null") as { theme?: Theme; tint?: number } | null;
      const nextTheme = saved?.theme === "dark" ? "dark" : "light";
      const nextTint = typeof saved?.tint === "number" ? saved.tint : 48;
      setThemeState(nextTheme);
      setTintState(nextTint);
      applyAppearance(nextTheme, nextTint);
    } catch {
      applyAppearance("light", 48);
    }
  }, []);

  const value = useMemo<Appearance>(
    () => ({
      theme,
      tint,
      setTheme: (next) => {
        setThemeState(next);
        applyAppearance(next, tint);
        localStorage.setItem(KEY, JSON.stringify({ theme: next, tint }));
      },
      setTint: (next) => {
        const clamped = Math.min(100, Math.max(0, next));
        applyAppearance(theme, clamped);
        setTintState(clamped);
        if (tintTimer.current) window.clearTimeout(tintTimer.current);
        tintTimer.current = window.setTimeout(() => {
          localStorage.setItem(KEY, JSON.stringify({ theme, tint: clamped }));
        }, 150);
      },
    }),
    [theme, tint],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("Appearance missing");
  return value;
}

// CREATED: 2026-03-17 IST (Jerusalem)
// useThemeStore - Theme state with localStorage persistence
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'sky' | 'dark' | 'blue';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'sky',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
    }),
    {
      name: 'lexdoc-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);

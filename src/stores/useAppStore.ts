// CREATED: 2026-03-17 IST (Jerusalem)
// useAppStore - UI state: sidebar, navigation
import { create } from 'zustand';

interface AppStore {
  sidebarOpen: boolean;
  activeSection: string;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveSection: (section: string) => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  sidebarOpen: true,
  activeSection: 'dashboard',
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveSection: (section) => set({ activeSection: section }),
}));

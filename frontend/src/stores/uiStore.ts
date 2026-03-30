import { create } from "zustand";

interface UIState {
  selectedTableId: number | null;
  setSelectedTableId: (id: number | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTableId: null,
  setSelectedTableId: (id) => set({ selectedTableId: id }),
  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  chatOpen: false,
  setChatOpen: (v) => set({ chatOpen: v }),
}));

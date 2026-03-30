import { create } from "zustand";

export interface User {
  id: number;
  username: string;
  email: string;
  name?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (u: User | null) => void;
  clearUser: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (u) => set({ user: u }),
  clearUser: () => set({ user: null }),
  setLoading: (v) => set({ isLoading: v }),
}));

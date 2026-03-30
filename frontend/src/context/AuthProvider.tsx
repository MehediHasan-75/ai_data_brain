// context/AuthProvider.tsx
"use client";
import React, {
  createContext,
  useContext,
  ReactNode,
  useCallback,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

export interface User {
  id: number;
  username: string;
  email: string;
  name?: string;
}

export interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;
  const data = await res.json();
  // Django /auth/me/ returns the user object directly
  return data?.id ? (data as User) : null;
}

async function callLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading: loading } = useQuery<User | null>({
    queryKey: ["user"],
    queryFn: fetchCurrentUser,
    staleTime: 4 * 60 * 1000, // 4 minutes — aligns with Django token TTL
    refetchInterval: 4 * 60 * 1000,
    retry: 1,
  });

  const refreshUser = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["user"] });
  }, [queryClient]);

  const setUser = useCallback(
    (u: User | null) => {
      queryClient.setQueryData(["user"], u);
    },
    [queryClient]
  );

  const signOut = useCallback(async () => {
    try {
      await callLogout();
    } catch {
      // best-effort
    } finally {
      queryClient.setQueryData(["user"], null);
      queryClient.clear();
      router.push("/signin");
    }
  }, [queryClient, router]);

  return (
    <UserContext.Provider
      value={{ user: user ?? null, setUser, refreshUser, loading, signOut }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

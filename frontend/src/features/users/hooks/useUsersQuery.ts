import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@/types";

async function fetchUsers(): Promise<User[]> {
  const res = await fetch("/api/users", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch users");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

async function fetchFriends(): Promise<User[]> {
  const res = await fetch("/api/users/friends", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch friends");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.friends ?? []);
}

export function useUsersQuery() {
  return useQuery<User[]>({
    queryKey: ["users"],
    queryFn: fetchUsers,
    staleTime: 60_000,
  });
}

export function useFriendsQuery() {
  return useQuery<User[]>({
    queryKey: ["users", "friends"],
    queryFn: fetchFriends,
    staleTime: 60_000,
  });
}

interface ManageFriendInput {
  friend_id: number;
  action: "add" | "remove";
}

export function useManageFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManageFriendInput) => {
      const res = await fetch("/api/users/friends", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to manage friend");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["users", "friends"] });
    },
  });
}

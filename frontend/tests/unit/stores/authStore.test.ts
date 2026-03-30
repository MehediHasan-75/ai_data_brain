import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/authStore";

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: true });
});

describe("authStore", () => {
  it("initialises with no user", () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("setUser stores a user", () => {
    const user = { id: 1, username: "alice", email: "alice@example.com" };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("clearUser removes user", () => {
    useAuthStore.getState().setUser({ id: 1, username: "alice", email: "alice@example.com" });
    useAuthStore.getState().clearUser();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("setLoading updates isLoading", () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/stores/uiStore";

// Reset store between tests
beforeEach(() => {
  useUIStore.setState({
    selectedTableId: null,
    sidebarOpen: false,
    chatOpen: false,
  });
});

describe("uiStore", () => {
  it("initialises with null selectedTableId", () => {
    expect(useUIStore.getState().selectedTableId).toBeNull();
  });

  it("sets selectedTableId", () => {
    useUIStore.getState().setSelectedTableId(42);
    expect(useUIStore.getState().selectedTableId).toBe(42);
  });

  it("clears selectedTableId", () => {
    useUIStore.getState().setSelectedTableId(42);
    useUIStore.getState().setSelectedTableId(null);
    expect(useUIStore.getState().selectedTableId).toBeNull();
  });

  it("toggles sidebarOpen", () => {
    useUIStore.getState().setSidebarOpen(true);
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    useUIStore.getState().setSidebarOpen(false);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("toggles chatOpen", () => {
    useUIStore.getState().setChatOpen(true);
    expect(useUIStore.getState().chatOpen).toBe(true);
  });
});

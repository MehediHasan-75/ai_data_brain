"use client";
import { useState, useRef, useEffect } from "react";
import { SlOptionsVertical } from "react-icons/sl";
import { useTheme } from "@/context/ThemeProvider";
import { useUIStore } from "@/stores/uiStore";
import { useDeleteTable, useShareTable } from "@/features/tables/hooks/useTableMutations";
import { useFriendsQuery } from "@/features/users/hooks/useUsersQuery";
import { createPortal } from "react-dom";
import type { TableDataType } from "@/types";

interface Props {
  table: TableDataType;
}

export default function SideBarEntry({ table }: Props) {
  const { theme } = useTheme();
  const { selectedTableId, setSelectedTableId } = useUIStore();
  const deleteTable = useDeleteTable();
  const shareTable = useShareTable();
  const { data: friends = [] } = useFriendsQuery();

  const [showMenu, setShowMenu] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<number[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const isSelected = selectedTableId === table.id;
  const isDark = theme === "dark";

  // Close menus on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (!buttonRef.current?.contains(e.target as Node)) {
        setShowMenu(false);
        setShowShare(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setShowMenu((v) => !v);
    setShowShare(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (isSelected) setSelectedTableId(null);
    await deleteTable.mutateAsync(table.id);
  };

  const handleShare = async () => {
    if (!selectedFriends.length) return;
    await shareTable.mutateAsync({
      tableId: table.id,
      friend_ids: selectedFriends,
      action: "share",
    });
    setShowShare(false);
    setShowMenu(false);
  };

  const toggleFriend = (id: number) =>
    setSelectedFriends((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );

  return (
    <div
      className={`group flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer mb-1 transition-colors ${
        isSelected
          ? isDark
            ? "bg-blue-600/30 border border-blue-500"
            : "bg-blue-50 border border-blue-300"
          : isDark
          ? "hover:bg-gray-700"
          : "hover:bg-gray-100"
      }`}
      onClick={() => setSelectedTableId(table.id)}
    >
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            isDark ? "text-gray-100" : "text-gray-900"
          }`}
        >
          {table.table_name}
        </p>
        {table.is_shared && (
          <span className="text-xs text-blue-400">shared</span>
        )}
      </div>

      <button
        ref={buttonRef}
        onClick={openMenu}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-opacity"
      >
        <SlOptionsVertical size={12} />
      </button>

      {/* Dropdown menu portal */}
      {showMenu &&
        createPortal(
          <div
            className={`fixed z-50 rounded-lg shadow-xl border py-1 w-40 ${
              isDark
                ? "bg-gray-800 border-gray-700 text-gray-100"
                : "bg-white border-gray-200 text-gray-800"
            }`}
            style={{ top: menuPos.top, left: menuPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                setShowShare(true);
                setShowMenu(false);
              }}
            >
              Share
            </button>
            <button
              className="w-full text-left px-4 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {/* Share panel */}
      {showShare &&
        createPortal(
          <div
            className={`fixed z-50 rounded-lg shadow-xl border p-4 w-56 ${
              isDark
                ? "bg-gray-800 border-gray-700 text-gray-100"
                : "bg-white border-gray-200 text-gray-800"
            }`}
            style={{ top: menuPos.top, left: menuPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="font-semibold mb-2 text-sm">Share with friends</p>
            {friends.length === 0 ? (
              <p className="text-xs text-gray-400">No friends to share with</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto mb-3">
                {friends.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedFriends.includes(f.id)}
                      onChange={() => toggleFriend(f.id)}
                      className="rounded"
                    />
                    {f.username}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleShare}
                disabled={shareTable.isPending || !selectedFriends.length}
                className="flex-1 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                Share
              </button>
              <button
                onClick={() => setShowShare(false)}
                className="flex-1 py-1 rounded bg-gray-200 dark:bg-gray-700 text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

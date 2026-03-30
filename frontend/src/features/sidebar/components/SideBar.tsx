"use client";
import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeProvider";
import { useTablesQuery } from "@/features/tables/hooks/useTableQuery";
import SideBarEntry from "./SideBarEntry";
import CreateTableModal from "./CreateTableModal";

interface SideBarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

export default function SideBar({ isOpen, setIsOpen }: SideBarProps) {
  const { theme } = useTheme();
  const { data: tables = [], isLoading } = useTablesQuery();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Responsive: close on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setIsOpen(false);
      else setIsOpen(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setIsOpen]);

  const isDark = theme === "dark";

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`
          ${isOpen ? "left-0" : "hidden"}
          fixed lg:relative z-40
          h-screen pt-18 lg:pt-[10vh]
          px-3 sm:px-4 lg:pl-[1.5vw] lg:pr-0
          w-[280px] sm:w-[320px] lg:w-[20vw] xl:w-[18vw] 2xl:w-[16vw]
          flex flex-col
          ${isDark ? "bg-gray-900" : "bg-gray-50"}
          transition-all duration-500 ease-in-out
          border-r ${isDark ? "border-gray-800" : "border-gray-200"}
          overflow-y-auto
        `}
      >
        <div
          className={`text-center text-xs sm:text-sm italic mb-4 px-2 py-2 border-b transition-colors duration-500 ease-in-out ${
            isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"
          }`}
        >
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            + New Table
          </button>
        </div>

        <div className="relative flex-1 h-full max-h-screen">
          <div className="h-full pr-2 pb-20 overflow-y-auto">
            {isLoading ? (
              <div className="text-center text-xs text-gray-400 py-4">Loading…</div>
            ) : tables.length === 0 ? (
              <div className="text-center text-xs text-gray-400 py-4">No tables yet</div>
            ) : (
              tables.map((table) => (
                <SideBarEntry key={`table-${table.id}`} table={table} />
              ))
            )}
          </div>

          {/* Bottom fade */}
          <div
            className={`sticky bottom-0 left-0 right-0 h-6 pointer-events-none ${
              isDark
                ? "bg-gradient-to-t from-gray-900 to-transparent"
                : "bg-gradient-to-t from-gray-50 to-transparent"
            }`}
          />
        </div>
      </div>

      {showCreateModal && (
        <CreateTableModal onCloseModal={() => setShowCreateModal(false)} />
      )}
    </>
  );
}

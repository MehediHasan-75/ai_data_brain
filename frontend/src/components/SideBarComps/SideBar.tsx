// SideBar.jsx
import React, { useEffect } from "react";
import SideBarEntries from "./SideBarEntries";
import { useTheme } from "@/context/ThemeProvider";
import { useTablesData } from "@/context/DataProviderReal";
import CreateTableButton from "./CreateTableButton";
import { handleTableOperation } from "@/api/TableDataApi";

interface SideBarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const SideBar = ({ isOpen, setIsOpen }: SideBarProps) => {
  const { tablesData, dispatchTablesData } = useTablesData();
  const { theme } = useTheme();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // lg breakpoint
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };

    handleResize(); // Initial check
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setIsOpen]);

  const handleTableEdit = async (id: number, name: string) => {
    await handleTableOperation(
      {
        type: "EDIT",
        payload: {
          id: id,
          table_name: name,
        },
      },
      dispatchTablesData
    );
    // dispatchTablesData({
    //   type: "EDIT",
    //   payload: {
    //     id: id,
    //     table_name: name,
    //   },
    // });
  };
  const handleTableDelete = async (id: number) => {
    await handleTableOperation(
      {
        type: "DELETE",
        payload: {
          id: id,
        },
      },
      dispatchTablesData
    );
    // dispatchTablesData({
    //   type: "DELETE",
    //   payload: {
    //     id: id,
    //   },
    // });
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          ${isOpen ? "left-0" : "hidden"}
          fixed lg:relative z-40
          h-screen pt-18 lg:pt-[10vh] 
          px-3 sm:px-4 lg:pl-[1.5vw] lg:pr-0
          w-[280px] sm:w-[320px] lg:w-[20vw] xl:w-[18vw] 2xl:w-[16vw]
          flex flex-col
          ${theme === "dark" ? "bg-gray-900" : "bg-gray-50"} 
          transition-all duration-500 ease-in-out
          border-r ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          } overflow-y-auto
        `}
      >
        <h1
          className={`text-center text-xs sm:text-sm italic mb-4 sm:mb-6 px-2 py-2 border-b transition-colors duration-500 ease-in-out ${
            theme === "dark"
              ? "text-gray-300 border-gray-700"
              : "text-gray-700 border-gray-200"
          }`}
        >
          <CreateTableButton />
          {/* Manage YourSelf */}
        </h1>

        <div className="relative flex-1 h-full max-h-screen">
          <div
            className={`h-full pr-2 sm:pr-4 lg:pr-[1vw] scrollbar-custom pb-20`}
          >
            {tablesData.map((table) => (
              <SideBarEntries
                key={`table-${table.id}-${table.table_name}`}
                table={table}
                onEdit={handleTableEdit}
                onDelete={handleTableDelete}
              />
            ))}
          </div>

          {/* Bottom fade effect */}
          <div
            className={`sticky bottom-0 left-0 right-0 h-4 sm:h-6 transition-colors duration-500 ease-in-out ${
              theme === "dark"
                ? "bg-gradient-to-t from-gray-900 to-transparent"
                : "bg-gradient-to-t from-gray-50 to-transparent"
            } pointer-events-none`}
          />
        </div>
      </div>
    </>
  );
};

export default SideBar;

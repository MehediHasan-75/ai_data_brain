"use client";
import React, { useState } from "react";
import Image from "next/image";
import { LuSunDim } from "react-icons/lu";
import { HiMoon, HiMenu, HiX, HiLogout, HiUser, HiCog, HiUserGroup, HiChat } from "react-icons/hi";
import { useTheme } from "@/context/ThemeProvider";
import { useUser } from "@/context/AuthProvider";
import { useRouter, usePathname } from "next/navigation";
import SettingsModal from "./SettingsModal";
import { createPortal } from "react-dom";

interface SideBarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Navbar = ({ isOpen, setIsOpen }: SideBarProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useUser();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = () => {
    signOut();
    setShowUserMenu(false);
  };

  const iconBtnClass = `p-2 rounded-md transition-colors ${
    theme === "dark"
      ? "text-gray-300 hover:bg-gray-800 hover:text-white"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
  }`;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 w-full flex justify-between items-center h-16 px-4 sm:px-6 lg:px-8 z-[1010] border-b ${
          theme === "dark"
            ? "bg-gray-900 border-gray-800"
            : "bg-white border-gray-200"
        }`}
      >
        {isOpen ? (
          <div className="flex items-center gap-3">
            <div
              onClick={() => router.push("/")}
              className="flex items-center cursor-pointer"
            >
              <div className="relative h-8 w-8 shrink-0">
                <Image
                  src={theme === "dark" ? "/databrain_logo.png" : "/databrain_log.png"}
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span
                className={`ml-2 hidden md:inline-block text-base font-semibold ${
                  theme === "dark" ? "text-white" : "text-gray-900"
                }`}
              >
                {process.env.NEXT_PUBLIC_APP_NAME || "DataBrain.AI"}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`${iconBtnClass} lg:hidden`}
              aria-label="Close menu"
            >
              <HiX size={20} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`${iconBtnClass} lg:hidden`}
              aria-label="Open menu"
            >
              <HiMenu size={20} />
            </button>
            <div
              onClick={() => router.push("/")}
              className="flex items-center cursor-pointer"
            >
              <div className="relative h-8 w-8 shrink-0">
                <Image
                  src={theme === "dark" ? "/databrain_logo.png" : "/databrain_log.png"}
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span
                className={`ml-2 hidden md:inline-block text-base font-semibold ${
                  theme === "dark" ? "text-white" : "text-gray-900"
                }`}
              >
                {process.env.NEXT_PUBLIC_APP_NAME || "DataBrain.AI"}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          {pathname !== "/chat" && (
            <button
              onClick={() => router.push("/chat")}
              className={iconBtnClass}
              aria-label="Chat"
            >
              <HiChat size={18} />
            </button>
          )}

          {pathname !== "/users" && (
            <button
              onClick={() => router.push("/users")}
              className={iconBtnClass}
              aria-label="Friends"
            >
              <HiUserGroup size={18} />
            </button>
          )}

          <button
            onClick={() => toggleTheme()}
            className={iconBtnClass}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <LuSunDim size={18} />
            ) : (
              <HiMoon size={18} />
            )}
          </button>

          {user && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  theme === "dark"
                    ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
                aria-label="User menu"
              >
                <HiUser size={16} />
                <span className="hidden sm:block font-medium">
                  {user.name || user.username}
                </span>
              </button>

              {showUserMenu && (
                <div
                  className={`absolute right-0 mt-1 w-48 rounded-md shadow-lg border py-1 z-50 ${
                    theme === "dark"
                      ? "bg-gray-900 border-gray-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div
                    className={`px-4 py-2.5 border-b ${
                      theme === "dark" ? "border-gray-700" : "border-gray-100"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        theme === "dark" ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {user.name || user.username}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${
                        theme === "dark" ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {user.email}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowSettingsModal(true);
                      setShowUserMenu(false);
                    }}
                    className={`w-full flex items-center px-4 py-2 text-sm transition-colors ${
                      theme === "dark"
                        ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <HiCog className="mr-3 h-4 w-4" />
                    Settings
                  </button>

                  <button
                    onClick={handleSignOut}
                    className={`w-full flex items-center px-4 py-2 text-sm transition-colors ${
                      theme === "dark"
                        ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <HiLogout className="mr-3 h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {showUserMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowUserMenu(false)}
          />
        )}
      </nav>

      {typeof window !== "undefined" &&
        createPortal(
          <SettingsModal
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
          />,
          document.body
        )}
    </>
  );
};

export default Navbar;

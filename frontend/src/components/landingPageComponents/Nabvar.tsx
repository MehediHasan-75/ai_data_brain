"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeProvider";
import {
  FiMenu,
  FiX,
  FiSun,
  FiMoon,
  FiSettings,
  FiUsers,
  FiMessageSquare,
  FiLogOut,
} from "react-icons/fi";
import clsx from "clsx";

import { useRouter, usePathname } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";
import { useUser } from "@/context/AuthProvider";
import Image from "next/image";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<{ name?: string; username?: string } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useUser();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
      setIsLoggedIn(true);
    }
  }, []);

  const toggleMobileMenu = () => setIsMobileMenuOpen((prev) => !prev);

  const handleChatClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(isLoggedIn ? "/chat" : "/signin");
  };

  const handleFriendsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(isLoggedIn ? "/users" : "/signin");
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (pathname !== "/") router.push("/");
  };

  const handleSignOut = () => {
    signOut();
    setShowUserMenu(false);
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    router.push("/");
  };

  const linkClass = clsx(
    "text-sm font-medium transition-colors",
    theme === "dark"
      ? "text-gray-300 hover:text-white"
      : "text-gray-600 hover:text-gray-900"
  );

  const dropdownItemClass = clsx(
    "flex items-center w-full px-4 py-2 text-sm transition-colors",
    theme === "dark"
      ? "text-gray-300 hover:bg-gray-700 hover:text-white"
      : "text-gray-700 hover:bg-gray-50"
  );

  return (
    <nav
      className={clsx(
        "w-full fixed top-0 z-50 border-b transition-colors",
        theme === "dark"
          ? "bg-gray-900 border-gray-800"
          : "bg-white border-gray-200"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button
            onClick={handleLogoClick}
            className={clsx(
              "flex items-center gap-2",
              pathname === "/" ? "cursor-default" : "cursor-pointer"
            )}
          >
            <Image
              src="/databrain_log.png"
              alt="Logo"
              width={32}
              height={32}
              className="shrink-0"
            />
            <span
              className={clsx(
                "hidden md:inline-block text-base font-semibold",
                theme === "dark" ? "text-white" : "text-gray-900"
              )}
            >
              {process.env.NEXT_PUBLIC_APP_NAME || "DataBrain.AI"}
            </span>
          </button>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-5">
            {!isLoggedIn ? (
              <>
                <a href="#features" className={linkClass}>
                  Features
                </a>
                <a href="#why-us" className={linkClass}>
                  Why Us
                </a>
                <button
                  onClick={() => router.push("/signin")}
                  className="px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                {pathname !== "/users" && (
                  <button
                    onClick={handleFriendsClick}
                    className={clsx("flex items-center gap-1.5", linkClass)}
                  >
                    <FiUsers size={16} />
                    <span>Friends</span>
                  </button>
                )}

                {pathname !== "/chat" && (
                  <button
                    onClick={handleChatClick}
                    className={clsx("flex items-center gap-1.5", linkClass)}
                  >
                    <FiMessageSquare size={16} />
                    <span>Chat</span>
                  </button>
                )}

                <button
                  onClick={toggleTheme}
                  className={clsx(
                    "p-1.5 rounded-md transition-colors",
                    theme === "dark"
                      ? "text-gray-300 hover:bg-gray-800"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                  aria-label="Toggle Theme"
                >
                  {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                      theme === "dark"
                        ? "text-gray-300 hover:bg-gray-800"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <span className="font-medium">
                      {user?.name || user?.username}
                    </span>
                  </button>

                  {showUserMenu && (
                    <div
                      className={clsx(
                        "absolute right-0 mt-1 w-48 rounded-md shadow-lg border py-1 z-50",
                        theme === "dark"
                          ? "bg-gray-800 border-gray-700"
                          : "bg-white border-gray-200"
                      )}
                    >
                      <button
                        onClick={() => {
                          setIsSettingsOpen(true);
                          setShowUserMenu(false);
                        }}
                        className={dropdownItemClass}
                      >
                        <FiSettings className="mr-3 h-4 w-4" />
                        Settings
                      </button>
                      <button onClick={handleChatClick} className={dropdownItemClass}>
                        <FiMessageSquare className="mr-3 h-4 w-4" />
                        Chat
                      </button>
                      <button onClick={handleFriendsClick} className={dropdownItemClass}>
                        <FiUsers className="mr-3 h-4 w-4" />
                        Friends
                      </button>
                      <button onClick={handleSignOut} className={dropdownItemClass}>
                        <FiLogOut className="mr-3 h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile Controls */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={clsx(
                "p-1.5 rounded-md transition-colors",
                theme === "dark"
                  ? "text-gray-300 hover:bg-gray-800"
                  : "text-gray-600 hover:bg-gray-100"
              )}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
            </button>

            {isLoggedIn && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className={clsx(
                    "flex items-center px-2 py-1.5 rounded-md text-sm",
                    theme === "dark"
                      ? "text-gray-300 hover:bg-gray-800"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <span className="font-medium">
                    {user?.name || user?.username}
                  </span>
                </button>

                {showUserMenu && (
                  <div
                    className={clsx(
                      "absolute right-0 mt-1 w-48 rounded-md shadow-lg border py-1 z-50",
                      theme === "dark"
                        ? "bg-gray-800 border-gray-700"
                        : "bg-white border-gray-200"
                    )}
                  >
                    <button
                      onClick={() => {
                        setIsSettingsOpen(true);
                        setShowUserMenu(false);
                      }}
                      className={dropdownItemClass}
                    >
                      <FiSettings className="mr-3 h-4 w-4" />
                      Settings
                    </button>
                    <button onClick={handleChatClick} className={dropdownItemClass}>
                      <FiMessageSquare className="mr-3 h-4 w-4" />
                      Chat
                    </button>
                    <button onClick={handleFriendsClick} className={dropdownItemClass}>
                      <FiUsers className="mr-3 h-4 w-4" />
                      Friends
                    </button>
                    <button onClick={handleSignOut} className={dropdownItemClass}>
                      <FiLogOut className="mr-3 h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={toggleMobileMenu}
              className={clsx(
                "p-1.5 rounded-md",
                theme === "dark"
                  ? "text-gray-300 hover:bg-gray-800"
                  : "text-gray-600 hover:bg-gray-100"
              )}
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div
          className={clsx(
            "md:hidden border-t px-4 pb-4 pt-2 space-y-1",
            theme === "dark"
              ? "bg-gray-900 border-gray-800 text-gray-300"
              : "bg-white border-gray-200 text-gray-700"
          )}
        >
          {!isLoggedIn ? (
            <>
              <a href="#features" className="block py-2 text-sm">
                Features
              </a>
              <a href="#why-us" className="block py-2 text-sm">
                Why Us
              </a>
              <button
                onClick={() => router.push("/signin")}
                className="block w-full text-left px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 mt-1"
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              {pathname !== "/users" && (
                <button
                  onClick={handleFriendsClick}
                  className="flex items-center gap-2 py-2 text-sm w-full"
                >
                  <FiUsers size={16} />
                  <span>Friends</span>
                </button>
              )}
              {pathname !== "/chat" && (
                <button
                  onClick={handleChatClick}
                  className="flex items-center gap-2 py-2 text-sm w-full"
                >
                  <FiMessageSquare size={16} />
                  <span>Chat</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </nav>
  );
};

export default Navbar;

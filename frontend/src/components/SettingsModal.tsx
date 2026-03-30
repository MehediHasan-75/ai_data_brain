"use client";
import React, { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeProvider";
import { useUser } from "@/context/AuthProvider";
import { HiX, HiUser, HiMail, HiKey, HiSun, HiMoon } from "react-icons/hi";
import {
  getUserDetail,
  updateUserPassword,
  updateUserProfile,
  getSelfDetail,
} from "@/api/AuthApi";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const { theme, toggleTheme } = useTheme();
  const { user, setUser } = useUser();
  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const isLoggedIn = () => localStorage.getItem("user") !== null;

  useEffect(() => {
    const fetchUserDetails = async () => {
      if (isOpen && user?.id) {
        setIsLoading(true);
        try {
          const response = await getUserDetail(user.id);
          if (response.success && response.data) {
            setFormData((prev) => ({
              ...prev,
              username: response.data.username || "",
              email: response.data.email || "",
            }));
          } else {
            setMessage({
              type: "error",
              text: response.error || "Failed to fetch user details",
            });
          }
        } catch (error) {
          setMessage({
            type: "error",
            text: `An error occurred while fetching user details: ${error}`,
          });
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchUserDetails();
  }, [isOpen, user?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: "", text: "" });

    if (!formData.currentPassword) {
      setMessage({
        type: "error",
        text: "Current password is required to update profile",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await updateUserProfile({
        email: formData.email,
        username: formData.username,
        password: formData.currentPassword,
      });

      if (response.success) {
        const userData = await getSelfDetail();
        if (userData.success && userData.data) {
          localStorage.setItem("user", JSON.stringify(userData.data));
          setUser(userData.data);
        }

        setMessage({
          type: "success",
          text: response.data.message || "Profile updated successfully",
        });
        setFormData((prev) => ({ ...prev, currentPassword: "" }));
      } else {
        setMessage({
          type: "error",
          text: response.error || "Failed to update profile",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `An error occurred while updating profile: ${error}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ type: "error", text: "New passwords do not match" });
      return;
    }
    setIsLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await updateUserPassword({
        email: formData.email,
        username: formData.username,
        password: formData.currentPassword,
        newpassword: formData.newPassword,
        newpassword2: formData.confirmPassword,
      });

      if (response.success) {
        setMessage({
          type: "success",
          text: response.data.message || "Password updated successfully",
        });
        setFormData((prev) => ({
          ...prev,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));
      } else {
        setMessage({
          type: "error",
          text: response.error || "Failed to update password",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: `An error occurred while updating password: ${error}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = `w-full pl-10 pr-4 py-2 rounded-md border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    theme === "dark"
      ? "bg-gray-800 border-gray-700 text-white"
      : "bg-white border-gray-300 text-gray-900"
  }`;

  const labelClass = `block text-xs font-medium mb-1.5 ${
    theme === "dark" ? "text-gray-400" : "text-gray-600"
  }`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative w-full max-w-lg mx-4 rounded-xl shadow-xl ${
          theme === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"
        }`}
      >
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            theme === "dark" ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-md transition-colors ${
              theme === "dark"
                ? "text-gray-400 hover:bg-gray-800 hover:text-white"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <HiX size={20} />
          </button>
        </div>

        <div className="p-6">
          {message.text && (
            <div
              className={`mb-4 p-3 rounded-md text-sm border ${
                message.type === "error"
                  ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                  : "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
              }`}
            >
              {message.text}
            </div>
          )}

          {isLoggedIn() ? (
            <>
              <div
                className={`flex border-b mb-6 ${
                  theme === "dark" ? "border-gray-800" : "border-gray-200"
                }`}
              >
                {(["profile", "security"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                      activeTab === tab
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : `border-transparent ${
                            theme === "dark"
                              ? "text-gray-400 hover:text-gray-200"
                              : "text-gray-500 hover:text-gray-700"
                          }`
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === "profile" ? (
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div>
                    <label className={labelClass}>Username</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <HiUser size={16} />
                      </div>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Email</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <HiMail size={16} />
                      </div>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Current Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <HiKey size={16} />
                      </div>
                      <input
                        type="password"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleInputChange}
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Theme</label>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                        theme === "dark"
                          ? "bg-gray-800 text-gray-200 hover:bg-gray-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {theme === "dark" ? (
                        <>
                          <HiSun size={16} className="text-amber-400" />
                          <span>Switch to Light Mode</span>
                        </>
                      ) : (
                        <>
                          <HiMoon size={16} className="text-gray-600" />
                          <span>Switch to Dark Mode</span>
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-4 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Updating..." : "Update Profile"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  {["currentPassword", "newPassword", "confirmPassword"].map(
                    (field) => (
                      <div key={field}>
                        <label className={labelClass}>
                          {field === "currentPassword"
                            ? "Current Password"
                            : field === "newPassword"
                            ? "New Password"
                            : "Confirm New Password"}
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <HiKey size={16} />
                          </div>
                          <input
                            type="password"
                            name={field}
                            value={formData[field as keyof typeof formData] as string}
                            onChange={handleInputChange}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    )
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-4 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Updating..." : "Update Password"}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div>
              <label className={labelClass}>Theme</label>
              <button
                type="button"
                onClick={toggleTheme}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  theme === "dark"
                    ? "bg-gray-800 text-gray-200 hover:bg-gray-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {theme === "dark" ? (
                  <>
                    <HiSun size={16} className="text-amber-400" />
                    <span>Switch to Light Mode</span>
                  </>
                ) : (
                  <>
                    <HiMoon size={16} className="text-gray-600" />
                    <span>Switch to Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

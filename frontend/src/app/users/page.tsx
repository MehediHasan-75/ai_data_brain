"use client";

import { useState, useEffect } from "react";
import {
  getUsersList,
  getFriendsList,
  manageFriend,
  getSelfDetail,
} from "@/api/AuthApi";
import Navbar from "@/components/Navbar";

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface Friend extends User {
  isFriend: boolean;
  added_by_me?: boolean;
  isMe?: boolean;
}

export default function UsersPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "friends">("all");
  const [showDummySidebar, setShowDummySidebar] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const response = await getSelfDetail();
      if (response.success && response.data) {
        setCurrentUser(response.data);
      }
    };
    fetchCurrentUser();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const usersResponse = await getUsersList();
      if (usersResponse.success && usersResponse.data) {
        const usersData = usersResponse.data;

        const friendsResponse = await getFriendsList();
        if (friendsResponse.success && friendsResponse.data) {
          const friendsList = friendsResponse.data.data || [];

          const usersWithFriendStatus = usersData.map((user: User) => {
            const friendInfo = friendsList.find(
              (friend: Friend) => friend.id === user.id
            );
            return {
              ...user,
              isFriend: !!friendInfo,
              added_by_me: friendInfo?.added_by_me,
              isMe: currentUser ? user.id === currentUser.id : false,
            };
          });

          setFriends(usersWithFriendStatus);
        } else {
          setError(friendsResponse.error || "Failed to fetch friends");
        }
      } else {
        setError(usersResponse.error || "Failed to fetch users");
      }
    } catch (err) {
      setError("Failed to fetch data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleFriendAction = async (
    userId: number,
    action: "add" | "remove"
  ) => {
    try {
      const response = await manageFriend({
        friend_id: userId,
        action: action,
      });

      if (response.success) {
        setFriends((prevFriends) =>
          prevFriends.map((friend) =>
            friend.id === userId
              ? { ...friend, isFriend: action === "add" }
              : friend
          )
        );
      } else {
        setError(response.error || `Failed to ${action} friend`);
      }
    } catch (err) {
      setError(`Failed to ${action} friend`);
      console.error(err);
    }
  };

  const filteredUsers =
    activeTab === "friends" ? friends.filter((user) => user.isFriend) : friends;

  if (loading) {
    return (
      <>
        <Navbar isOpen={showDummySidebar} setIsOpen={setShowDummySidebar} />
        <div className="min-h-screen bg-white dark:bg-gray-950 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-[60vh]">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar isOpen={showDummySidebar} setIsOpen={setShowDummySidebar} />
      <div className="min-h-screen bg-white dark:bg-gray-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Users &amp; Friends
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {activeTab === "friends"
                  ? "Your connections"
                  : "All users"}
              </p>
            </div>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === "all"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                All Users
              </button>
              <button
                onClick={() => setActiveTab("friends")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === "friends"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                My Friends
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-md mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {activeTab === "friends" ? "No friends yet" : "No users found"}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeTab === "friends"
                    ? "Add friends to see them here"
                    : "Check back later"}
                </p>
                {activeTab === "all" && (
                  <button
                    onClick={fetchData}
                    className="mt-3 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Refresh
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredUsers.map((user) => (
                  <li
                    key={user.id}
                    className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.username}
                            </span>
                            {user.isMe && (
                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs rounded">
                                you
                              </span>
                            )}
                            {user.isFriend && !user.isMe && (
                              <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs rounded">
                                {user.added_by_me ? "Friend" : "Added you"}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      {!user.isMe && (
                        <button
                          onClick={() =>
                            handleFriendAction(
                              user.id,
                              user.isFriend ? "remove" : "add"
                            )
                          }
                          disabled={user.isFriend && !user.added_by_me}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            user.isFriend
                              ? user.added_by_me
                                ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                                : "text-gray-400 dark:text-gray-600 cursor-not-allowed"
                              : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                          }`}
                        >
                          {user.isFriend
                            ? user.added_by_me
                              ? "Remove"
                              : "Added you"
                            : "Add"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

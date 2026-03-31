"use client";
import MainContent from "@/components/MainContent";
import Navbar from "@/components/Navbar";
import SideBar from "@/features/sidebar/components/SideBar";
import ToggleChat from "@/components/ToggleChat";
import { useUser } from "@/context/AuthProvider";
import { useUIStore } from "@/stores/uiStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const Page = () => {
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const { user, loading } = useUser();
  const { chatOpen, setChatOpen, sidebarOpen, setSidebarOpen } = useUIStore();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!loading && user === null) {
      router.push("/signin");
    }
  }, [user, loading, router]);

  if (!isClient || loading) return null;
  if (!user) return null;

  return (
    <div className="flex overflow-hidden transition-all duration-500 ease-in-out">
      <Navbar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      {!chatOpen && <ToggleChat onToggle={() => setChatOpen(true)} />}
      <SideBar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 overflow-x-auto">
        <MainContent showChat={chatOpen} />
      </div>
    </div>
  );
};

export default Page;

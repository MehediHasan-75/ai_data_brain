"use client";
import React from "react";
import Navbar from "@/components/landingPageComponents/Nabvar";
import Hero from "@/components/landingPageComponents/Hero";
import Features from "@/components/landingPageComponents/Features";
import Benefits from "@/components/landingPageComponents/Benefits";
import CTA from "@/components/landingPageComponents/CTA";
import Footer from "@/components/landingPageComponents/Footer";
import { useTheme } from "@/context/ThemeProvider";

const HomePage = () => {
  const { theme } = useTheme();

  return (
    <main
      className={`min-h-screen font-sans antialiased ${
        theme === "dark"
          ? "bg-gray-900 text-gray-100"
          : "bg-white text-gray-800"
      }`}
    >
      <Navbar />
      <Hero />
      <Features />
      <Benefits />
      <CTA />
      <Footer />
    </main>
  );
};

export default HomePage;

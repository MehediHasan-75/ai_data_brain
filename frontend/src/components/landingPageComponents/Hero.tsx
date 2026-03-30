"use client";
import React, { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeProvider";
import clsx from "clsx";
import Image from "next/image";

const images = [
  "hero_data_dashboard.jpg",
  "hero_laptop_data.jpg",
  "hero_analytics.jpg",
  "hero_collaboration.jpg",
  "hero_ai_tech.jpg",
  "hero_voice_tech.jpg",
];

export default function Hero() {
  const { theme } = useTheme();
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * images.length);
    setImageUrl(`/${images[randomIndex]}`);
  }, []);

  return (
    <section
      className={clsx(
        "pt-32 pb-16 md:pt-40 md:pb-24",
        theme === "dark" ? "bg-gray-900" : "bg-gray-50"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
        <div className="text-center md:text-left">
          <h1
            className={clsx(
              "text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight tracking-tight",
              theme === "dark" ? "text-white" : "text-gray-900"
            )}
          >
            Manage any data with{" "}
            <span className="text-blue-600 dark:text-blue-400">
              voice & AI
            </span>
          </h1>
          <p
            className={clsx(
              "text-lg md:text-xl mb-6 max-w-xl mx-auto md:mx-0",
              theme === "dark" ? "text-gray-300" : "text-gray-600"
            )}
          >
            <strong>{process.env.NEXT_PUBLIC_APP_NAME || "DataBrain.AI"}</strong> is an AI-powered platform that lets you
            manage any kind of data using natural chat, voice commands, and
            manual operations in both <strong>Bengali and English</strong>.
          </p>
          <div
            className={clsx(
              "mb-8 p-4 rounded-lg border-l-4 border-blue-500",
              theme === "dark" ? "bg-gray-800" : "bg-blue-50"
            )}
          >
            <p
              className={clsx(
                "text-sm font-medium",
                theme === "dark" ? "text-blue-300" : "text-blue-700"
              )}
            >
              &quot;আমি আজকে ১০০ টাকা খরচ করেছি&quot; → Instantly added to your expense table
            </p>
            <p
              className={clsx(
                "text-xs mt-1",
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              )}
            >
              Reduces manual work by <strong>80%+</strong> through voice and AI automation
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="/chat/"
              className="px-6 py-2.5 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors text-center"
            >
              Try Voice Chat
            </a>
            <a
              href="/signin"
              className={clsx(
                "px-6 py-2.5 rounded-md border text-sm font-semibold transition-colors text-center",
                theme === "dark"
                  ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-100"
              )}
            >
              Get Started Free
            </a>
          </div>
        </div>
        <div className="flex justify-center">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={`${process.env.NEXT_PUBLIC_APP_NAME || "DataBrain.AI"} Voice & AI Data Management`}
              width={500}
              height={400}
              className="rounded-xl shadow-lg"
              unoptimized
            />
          )}
        </div>
      </div>
    </section>
  );
}

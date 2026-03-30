import React from "react";
import { useTheme } from "@/context/ThemeProvider";
import clsx from "clsx";

const CTA = () => {
  const { theme } = useTheme();

  return (
    <section
      id="cta"
      className={clsx(
        "py-20 md:py-28",
        theme === "dark" ? "bg-gray-800 text-white" : "bg-blue-600 text-white"
      )}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
          Ready to transform how you manage data?
        </h2>
        <p
          className={clsx(
            "text-lg md:text-xl mb-10 max-w-2xl mx-auto",
            theme === "dark" ? "text-gray-300" : "text-blue-100"
          )}
        >
          Speak naturally in Bengali or English, collaborate in real-time, and
          let AI handle the heavy lifting. Your data has never been this
          accessible.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/chat/"
            className={clsx(
              "px-8 py-3 rounded-md font-semibold text-base transition-colors",
              theme === "dark"
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-white text-blue-600 hover:bg-blue-50"
            )}
          >
            Try Voice Chat
          </a>
          <a
            href="/signin"
            className={clsx(
              "px-8 py-3 rounded-md border font-semibold text-base transition-colors",
              theme === "dark"
                ? "border-gray-600 text-gray-200 hover:bg-gray-700"
                : "border-white text-white hover:bg-white/10"
            )}
          >
            Get Started Free
          </a>
        </div>
      </div>
    </section>
  );
};

export default CTA;

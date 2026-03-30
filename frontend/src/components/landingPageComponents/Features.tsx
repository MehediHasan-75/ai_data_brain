import React from "react";
import {
  Mic,
  MessageSquare,
  Users,
  Database,
  Brain,
  Globe,
} from "lucide-react";
import { useTheme } from "@/context/ThemeProvider";
import clsx from "clsx";

const features = [
  {
    icon: Mic,
    title: "Voice Chat Interface",
    description:
      "Real-time speech recognition in Bengali and English. Speak naturally and watch your data get organized instantly with hands-free operation.",
  },
  {
    icon: Brain,
    title: "AI-Powered Data Management",
    description:
      "Claude AI with Model Context Protocol provides direct database access. Complex queries, smart categorization, and intelligent insights.",
  },
  {
    icon: MessageSquare,
    title: "Natural Language Chat",
    description:
      'Chat with your data using everyday language. "Show me expenses from last week" or "আমার গত মাসের খরচ দেখাও" - both work perfectly.',
  },
  {
    icon: Users,
    title: "Collaborative Sharing",
    description:
      "Share tables with friends and family. Real-time collaboration with permission management and activity tracking for team financial planning.",
  },
  {
    icon: Database,
    title: "Dynamic Table Creation",
    description:
      "Create any type of table structure on-the-fly. From expense tracking to project management - unlimited flexibility with JSON-based schema.",
  },
  {
    icon: Globe,
    title: "Multilingual Support",
    description:
      "Full Bengali and English support for voice commands, chat, and UI. Switch languages seamlessly for the most natural experience.",
  },
];

const Features = () => {
  const { theme } = useTheme();

  return (
    <section
      id="features"
      className={clsx(
        "py-16 md:py-24 transition-colors duration-300",
        theme === "dark" ? "bg-gray-800" : "bg-white"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2
            className={clsx(
              "text-3xl md:text-4xl font-bold mb-4",
              theme === "dark" ? "text-white" : "text-gray-900"
            )}
          >
            Revolutionary Features
          </h2>
          <p
            className={clsx(
              "text-lg max-w-3xl mx-auto",
              theme === "dark" ? "text-gray-300" : "text-gray-600"
            )}
          >
            Experience the next generation of data management with voice AI,
            collaborative features, and intelligent automation that reduces
            manual work by 80%.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={clsx(
                "p-6 rounded-xl border flex flex-col items-start text-left transition-colors",
                theme === "dark"
                  ? "bg-gray-700 border-gray-600 hover:border-blue-500"
                  : "bg-gray-50 border-gray-200 hover:border-blue-300"
              )}
            >
              <feature.icon
                className={clsx(
                  "w-10 h-10 mb-4",
                  theme === "dark" ? "text-blue-400" : "text-blue-600"
                )}
                strokeWidth={1.5}
              />
              <h3
                className={clsx(
                  "text-xl font-semibold mb-3",
                  theme === "dark" ? "text-gray-100" : "text-gray-800"
                )}
              >
                {feature.title}
              </h3>
              <p
                className={clsx(
                  "leading-relaxed text-sm",
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                )}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;

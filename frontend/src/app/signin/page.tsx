"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SunIcon, MoonIcon, HomeIcon } from "lucide-react";
import { useTheme } from "@/context/ThemeProvider";
import clsx from "clsx";
import { registerUser, loginUser } from "../../api/AuthApi";
import { useUser } from "@/context/AuthProvider";

type FormData = {
  username: string;
  email: string;
  password: string;
  password2: string;
  rememberMe: boolean;
};

const AuthForm = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    password: "",
    password2: "",
    rememberMe: false,
  });

  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const { refreshUser } = useUser();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (error) setError("");
  };

  const toggleAuthMode = () => {
    setIsSignUp((prev) => !prev);
    setError("");
    setFormData({
      username: "",
      email: "",
      password: "",
      password2: "",
      rememberMe: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isSignUp) {
        if (formData.password !== formData.password2) {
          setError("Passwords do not match");
          return;
        }

        await registerUser({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          password2: formData.password2,
        });
      } else {
        const result = await loginUser({
          username: formData.username,
          password: formData.password,
        });
        if (!result.success) {
          setError(result.error || "Invalid username or password");
          return;
        }
      }

      await refreshUser();
      router.push("/chat");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div
      className={clsx(
        "min-h-screen flex items-center justify-center p-4",
        theme === "dark" ? "bg-gray-950" : "bg-gray-50"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => router.push("/")}
        className="absolute top-4 left-4"
        aria-label="Go to Home"
      >
        <HomeIcon className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="absolute top-4 right-4"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <SunIcon className="h-5 w-5" />
        ) : (
          <MoonIcon className="h-5 w-5" />
        )}
      </Button>

      <Card
        className={clsx(
          "w-full max-w-md border",
          theme === "dark"
            ? "bg-gray-900 border-gray-800"
            : "bg-white border-gray-200"
        )}
      >
        <CardHeader className="text-center pb-2">
          <CardTitle
            className={clsx(
              "text-2xl font-semibold",
              theme === "dark" ? "text-white" : "text-gray-900"
            )}
          >
            {isSignUp ? "Create an account" : "Welcome back"}
          </CardTitle>
          <CardDescription
            className={theme === "dark" ? "text-gray-400" : "text-gray-500"}
          >
            {isSignUp
              ? "Enter your details to get started"
              : "Sign in to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">
          {error && (
            <div
              className={clsx(
                "mb-4 p-3 rounded-md text-sm border",
                theme === "dark"
                  ? "bg-red-950 text-red-300 border-red-800"
                  : "bg-red-50 text-red-700 border-red-200"
              )}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className={theme === "dark" ? "text-gray-300" : "text-gray-700"}
              >
                Username
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleInputChange}
                placeholder="Enter your username"
              />
            </div>

            {isSignUp && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className={
                    theme === "dark" ? "text-gray-300" : "text-gray-700"
                  }
                >
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className={theme === "dark" ? "text-gray-300" : "text-gray-700"}
              >
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter your password"
              />
            </div>

            {isSignUp && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="password2"
                  className={
                    theme === "dark" ? "text-gray-300" : "text-gray-700"
                  }
                >
                  Confirm Password
                </Label>
                <Input
                  id="password2"
                  name="password2"
                  type="password"
                  required
                  value={formData.password2}
                  onChange={handleInputChange}
                  placeholder="Confirm your password"
                />
              </div>
            )}

            <Button type="submit" className="w-full mt-2">
              {isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <p
            className={clsx(
              "mt-4 text-center text-sm",
              theme === "dark" ? "text-gray-400" : "text-gray-500"
            )}
          >
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={toggleAuthMode}
              className={clsx(
                "font-medium hover:underline",
                theme === "dark" ? "text-blue-400" : "text-blue-600"
              )}
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthForm;

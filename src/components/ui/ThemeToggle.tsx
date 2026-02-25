"use client";

import { useTheme } from "@/components/ThemeProvider";
import { motion } from "framer-motion";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className={`relative flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer ${className}`}
      title={`Switch to ${resolved === "dark" ? "light" : "dark"} mode`}
    >
      <motion.span
        key={resolved}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="text-sm"
      >
        {resolved === "dark" ? "☀️" : "🌙"}
      </motion.span>
    </button>
  );
}

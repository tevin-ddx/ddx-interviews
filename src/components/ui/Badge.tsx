"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "easy" | "medium" | "hard" | "active" | "completed";
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-secondary text-secondary-foreground",
  easy: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-800",
  medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-400 dark:border-amber-800",
  hard: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-400 dark:border-red-800",
  active: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-400 dark:border-indigo-800",
  completed: "bg-secondary text-muted-foreground border-border",
};

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "easy" | "medium" | "hard" | "active" | "completed";
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-zinc-800 text-zinc-300",
  easy: "bg-emerald-900/50 text-emerald-400 border-emerald-800",
  medium: "bg-amber-900/50 text-amber-400 border-amber-800",
  hard: "bg-red-900/50 text-red-400 border-red-800",
  active: "bg-indigo-900/50 text-indigo-400 border-indigo-800",
  completed: "bg-zinc-800 text-zinc-400 border-zinc-700",
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

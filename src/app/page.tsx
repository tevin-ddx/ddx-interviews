"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import ThemeToggle from "@/components/ui/ThemeToggle";

import type { Variants } from "framer-motion";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-bold text-white tracking-tight">
            d/dx
          </div>
          <span className="text-sm font-semibold">d/dx interviews</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          className="max-w-2xl space-y-6"
        >
          <motion.div custom={0} variants={fadeUp}>
            <span className="inline-block rounded-full border border-indigo-300/50 bg-indigo-100/50 px-3 py-1 text-xs font-medium text-indigo-600 dark:border-indigo-800/50 dark:bg-indigo-900/30 dark:text-indigo-400">
              Collaborative Coding Interviews
            </span>
          </motion.div>

          <motion.h1
            custom={1}
            variants={fadeUp}
            className="text-5xl font-bold leading-tight tracking-tight"
          >
            Conduct{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              live coding
            </span>{" "}
            interviews effortlessly
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUp}
            className="mx-auto max-w-lg text-lg leading-relaxed text-muted-foreground"
          >
            Real-time collaborative editor, instant Python &amp; C++ execution,
            question bank management, and shareable interview sessions — all in
            one platform.
          </motion.p>

          <motion.div
            custom={3}
            variants={fadeUp}
            className="flex items-center justify-center gap-4 pt-2"
          >
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Open Dashboard
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground/80 transition-colors hover:border-border hover:text-foreground"
            >
              View Source
            </a>
          </motion.div>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial="hidden"
          animate="visible"
          className="mt-24 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {[
            {
              icon: "⚡",
              title: "Live Collaboration",
              desc: "Real-time code editing with cursor presence and instant sync.",
            },
            {
              icon: "▶",
              title: "Instant Execution",
              desc: "Run Python & C++ code with stdout/stderr output in seconds.",
            },
            {
              icon: "📋",
              title: "Question Bank",
              desc: "Manage categorized questions with difficulty levels and file attachments.",
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i + 4}
              variants={fadeUp}
              className="rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-border/80 hover:shadow-sm"
            >
              <div className="mb-3 text-2xl">{feature.icon}</div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 text-center text-xs text-muted-foreground">
        d/dx interviews — Built with Next.js, Tailwind CSS, Monaco Editor
      </footer>
    </div>
  );
}

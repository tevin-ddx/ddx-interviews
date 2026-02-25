"use client";

import { motion, AnimatePresence } from "framer-motion";

interface OutputConsoleProps {
  output: string;
  stderr: string;
  isRunning: boolean;
  exitCode?: number | null;
  executionTime?: number | null;
}

export default function OutputConsole({
  output,
  stderr,
  isRunning,
  exitCode,
  executionTime,
}: OutputConsoleProps) {
  const hasError = stderr && stderr.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isRunning
                ? "animate-pulse bg-amber-400"
                : hasError
                  ? "bg-red-400"
                  : exitCode === 0
                    ? "bg-emerald-400"
                    : "bg-muted-foreground/40"
            }`}
          />
          <span className="text-xs font-medium text-muted-foreground">Output</span>
        </div>
        {executionTime !== null && executionTime !== undefined && (
          <span className="text-xs text-muted-foreground">
            {executionTime}ms
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 font-mono text-sm">
        <AnimatePresence mode="wait">
          {isRunning ? (
            <motion.div
              key="running"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-amber-400"
            >
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Running...
            </motion.div>
          ) : (
            <motion.div
              key="output"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              {output && (
                <pre className="whitespace-pre-wrap text-foreground">
                  {output}
                </pre>
              )}
              {hasError && (
                <pre className="whitespace-pre-wrap text-red-500 dark:text-red-400">
                  {stderr}
                </pre>
              )}
              {!output && !hasError && exitCode === null && (
                <span className="text-muted-foreground">
                  Click &quot;Run&quot; to execute your code
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

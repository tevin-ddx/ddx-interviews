"use client";

import { useState, useEffect, useCallback, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import OutputConsole from "@/components/editor/OutputConsole";

const CodeEditor = dynamic(() => import("@/components/editor/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-900 text-zinc-500">
      Loading editor...
    </div>
  ),
});

const NotebookEditor = dynamic(
  () => import("@/components/editor/NotebookEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-zinc-900 text-zinc-500">
        Loading notebook...
      </div>
    ),
  }
);

interface Interview {
  id: string;
  title: string;
  status: string;
  code: string;
  language: string;
  question: {
    id: string;
    title: string;
    description: string;
    boilerplateCode: string;
    difficulty: string;
  } | null;
}

type EditorMode = "script" | "notebook";

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [stderr, setStderr] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [mode, setMode] = useState<EditorMode>("script");
  const [showQuestion, setShowQuestion] = useState(true);
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/interviews/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: Interview) => {
        setInterview(data);
        setCode(
          data.code ||
            data.question?.boilerplateCode ||
            "# Write your code here\n"
        );
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const runCode = useCallback(async () => {
    setIsRunning(true);
    setOutput("");
    setStderr("");
    setExitCode(null);
    const start = Date.now();

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await res.json();
      setExecutionTime(Date.now() - start);
      setOutput(result.stdout || "");
      setStderr(result.stderr || result.error || "");
      setExitCode(result.code ?? -1);
    } catch {
      setExecutionTime(Date.now() - start);
      setStderr("Execution failed - check your connection");
      setExitCode(-1);
    } finally {
      setIsRunning(false);
    }
  }, [code]);

  const saveCode = useCallback(async () => {
    if (!interview) return;
    await fetch(`/api/interviews/${interview.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }, [interview, code]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runCode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveCode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runCode, saveCode]);

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Session Not Found</h1>
          <p className="mt-2 text-zinc-400">
            This interview session doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading session...
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-8"
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold">
              CS
            </div>
            <h1 className="text-xl font-semibold">{interview.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Enter your name to join
            </p>
          </div>

          <div className="space-y-4">
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name"
              className="flex h-9 w-full rounded-lg border border-input bg-zinc-900 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && userName.trim()) setJoined(true);
              }}
              autoFocus
            />
            <Button
              className="w-full"
              onClick={() => setJoined(true)}
              disabled={!userName.trim()}
            >
              Join Interview
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold">
            CS
          </div>
          <span className="text-sm font-medium">{interview.title}</span>
          {interview.question && (
            <Badge
              variant={
                interview.question.difficulty as "easy" | "medium" | "hard"
              }
            >
              {interview.question.difficulty}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-zinc-300">{userName}</span>
          </div>

          <div className="flex rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setMode("script")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                mode === "script"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              } rounded-l-lg`}
            >
              Script
            </button>
            <button
              onClick={() => setMode("notebook")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                mode === "notebook"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              } rounded-r-lg`}
            >
              Notebook
            </button>
          </div>

          <Button
            onClick={runCode}
            disabled={isRunning}
            size="sm"
            className="gap-1.5"
          >
            {isRunning ? "Running..." : "▶ Run"}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question Panel */}
        <AnimatePresence>
          {showQuestion && interview.question && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-950"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">
                    {interview.question.title}
                  </h2>
                  <button
                    onClick={() => setShowQuestion(false)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-zinc-300">
                  {interview.question.description
                    .split("\n")
                    .map((line, i) => (
                      <p key={i} className="mb-2">
                        {line}
                      </p>
                    ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!showQuestion && interview.question && (
          <button
            onClick={() => setShowQuestion(true)}
            className="flex items-center border-r border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
            title="Show question"
          >
            ❓
          </button>
        )}

        {/* Editor + Output */}
        <div className="flex flex-1 overflow-hidden">
          {mode === "script" ? (
            <>
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  language="python"
                />
              </div>
              <div className="w-[400px] shrink-0 border-l border-zinc-800">
                <OutputConsole
                  output={output}
                  stderr={stderr}
                  isRunning={isRunning}
                  exitCode={exitCode}
                  executionTime={executionTime}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-hidden">
              <NotebookEditor />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

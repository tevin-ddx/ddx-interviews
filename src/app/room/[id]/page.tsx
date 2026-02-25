"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ThemeToggle from "@/components/ui/ThemeToggle";
import OutputConsole from "@/components/editor/OutputConsole";

const CollaborativeEditor = dynamic(
  () => import("@/components/editor/CollaborativeEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-card text-muted-foreground">
        Loading editor...
      </div>
    ),
  }
);

const NotebookEditor = dynamic(
  () => import("@/components/editor/NotebookEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-card text-muted-foreground">
        Loading notebook...
      </div>
    ),
  }
);

interface QuestionFile {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

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
    language: string;
    files: QuestionFile[];
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
  const [output, setOutput] = useState("");
  const [stderr, setStderr] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [mode, setMode] = useState<EditorMode>("script");
  const [language, setLanguage] = useState<string>("python");
  const [showQuestion, setShowQuestion] = useState(true);
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const codeGetterRef = useRef<(() => string) | null>(null);

  useEffect(() => {
    fetch(`/api/interviews/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: Interview) => {
        setInterview(data);
        setLanguage(data.question?.language || data.language || "python");
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const handleCodeRef = useCallback((getter: () => string) => {
    codeGetterRef.current = getter;
  }, []);

  const runCode = useCallback(async () => {
    const code = codeGetterRef.current ? codeGetterRef.current() : "";
    if (!code.trim()) return;

    setIsRunning(true);
    setOutput("");
    setStderr("");
    setExitCode(null);
    const start = Date.now();

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
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
  }, [language]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runCode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runCode]);

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Session Not Found</h1>
          <p className="mt-2 text-muted-foreground">
            This interview session doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
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
          className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8"
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold">
              CS
            </div>
            <h1 className="text-xl font-semibold">{interview.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your name to join
            </p>
          </div>

          <div className="space-y-4">
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name"
              className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

  const initialContent =
    interview.code ||
    interview.question?.boilerplateCode ||
    "# Write your code here\n";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
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
          <ThemeToggle />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="python">Python</option>
            <option value="cpp">C++</option>
          </select>

          <div className="flex rounded-lg border border-border text-xs">
            <button
              onClick={() => setMode("script")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                mode === "script"
                  ? "bg-secondary text-white"
                  : "text-muted-foreground hover:text-foreground"
              } rounded-l-lg`}
            >
              Script
            </button>
            <button
              onClick={() => setMode("notebook")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                mode === "notebook"
                  ? "bg-secondary text-white"
                  : "text-muted-foreground hover:text-foreground"
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
              className="shrink-0 overflow-y-auto border-r border-border bg-background"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">
                    {interview.question.title}
                  </h2>
                  <button
                    onClick={() => setShowQuestion(false)}
                    className="text-xs text-muted-foreground hover:text-foreground/80 cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-foreground/80">
                  {interview.question.description
                    .split("\n")
                    .map((line, i) => (
                      <p key={i} className="mb-2">
                        {line}
                      </p>
                    ))}
                </div>
                {interview.question.files &&
                  interview.question.files.length > 0 && (
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Attachments
                      </p>
                      {interview.question.files.map((f) => (
                        <a
                          key={f.id}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-secondary/50 transition-colors"
                        >
                          <span>📎</span>
                          <span className="truncate">{f.name}</span>
                          <span className="ml-auto text-muted-foreground/70">
                            {(f.size / 1024).toFixed(1)}KB
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!showQuestion && interview.question && (
          <button
            onClick={() => setShowQuestion(true)}
            className="flex items-center border-r border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground/80 cursor-pointer"
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
                <CollaborativeEditor
                  roomId={id}
                  userName={userName}
                  initialContent={initialContent}
                  language={language === "cpp" ? "cpp" : "python"}
                  onCodeRef={handleCodeRef}
                />
              </div>
              <div className="w-[400px] shrink-0 border-l border-border">
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

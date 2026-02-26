"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import * as Y from "yjs";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import Button from "@/components/ui/Button";
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
    solutionCode: string;
    difficulty: string;
    language: string;
    type: string;
    files: QuestionFile[];
  } | null;
}

interface EditorEvent {
  timestamp: number;
  userName: string;
  type: string;
  content: string;
}

type EditorMode = "script" | "notebook";
type RightPanel = "output" | "notes" | "solution";

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<EditorMode>("script");
  const [language, setLanguage] = useState<string>("python");
  const [showQuestion, setShowQuestion] = useState(true);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<"interviewer" | "candidate">("candidate");
  const [joined, setJoined] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("output");
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const codeGetterRef = useRef<(() => string) | null>(null);
  const eventBufferRef = useRef<EditorEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const outputMapRef = useRef<Y.Map<string | number | null> | null>(null);
  const [sharedHistory, setSharedHistory] = useState<Y.Array<Record<string, unknown>> | null>(null);
  const [sharedDoc, setSharedDoc] = useState<Y.Doc | null>(null);

  useEffect(() => {
    fetch(`/api/interviews/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: Interview) => {
        setInterview(data);
        const qType = data.question?.type || "python_script";
        if (qType === "python_notebook") {
          setMode("notebook");
          setLanguage("python");
        } else if (qType === "cpp") {
          setMode("script");
          setLanguage("cpp");
        } else {
          setMode("script");
          setLanguage(data.question?.language || data.language || "python");
        }
      })
      .catch(() => setNotFound(true));
  }, [id]);

  // Check if user is an admin (interviewer)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUserRole("interviewer");
      })
      .catch(() => {});
  }, []);

  // Load existing notes if interviewer
  useEffect(() => {
    if (userRole === "interviewer" && joined) {
      fetch(`/api/interviews/${id}/notes`)
        .then((r) => r.json())
        .then((data) => {
          if (data.note) setNoteContent(data.note.content);
        })
        .catch(() => {});
    }
  }, [userRole, joined, id]);

  // Flush event buffer periodically
  useEffect(() => {
    if (!joined) return;
    flushTimerRef.current = setInterval(() => {
      const buf = eventBufferRef.current;
      if (buf.length === 0) return;
      eventBufferRef.current = [];
      fetch(`/api/interviews/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: buf }),
      }).catch(() => {});
    }, 3000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [joined, id]);

  const handleCodeRef = useCallback((getter: () => string) => {
    codeGetterRef.current = getter;
  }, []);

  const handleDocReady = useCallback((doc: Y.Doc) => {
    ydocRef.current = doc;
    setSharedDoc(doc);

    const outputMap = doc.getMap<string | number | null>("executionOutput");
    outputMapRef.current = outputMap;

    const historyArray = doc.getArray<Record<string, unknown>>("terminalHistory");
    setSharedHistory(historyArray);

    outputMap.observe(() => {
      const running = outputMap.get("isRunning") as number;
      setIsRunning(running === 1);
      if (running === 1) setRightPanel("output");
    });
  }, []);

  const handleEditorEvent = useCallback((event: EditorEvent) => {
    eventBufferRef.current.push(event);
  }, []);

  const runCode = useCallback(async () => {
    const code = codeGetterRef.current ? codeGetterRef.current() : "";
    if (!code.trim()) return;

    const map = outputMapRef.current;
    const setRunning = (val: number) => {
      if (map) {
        ydocRef.current?.transact(() => map.set("isRunning", val));
      } else {
        setIsRunning(val === 1);
      }
    };

    setRightPanel("output");
    setRunning(1);

    const start = Date.now();

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, roomId: id }),
      });
      const result = await res.json();
      setRunning(0);

      const entry = {
        id: crypto.randomUUID(),
        type: "code_run",
        input: "Run code",
        stdout: result.stdout || "",
        stderr: result.stderr || result.error || "",
        exitCode: result.code ?? -1,
        executionTime: Date.now() - start,
        timestamp: Date.now(),
        userName,
      };

      if (sharedHistory) {
        ydocRef.current?.transact(() => {
          sharedHistory.push([entry]);
        });
      }
    } catch {
      setRunning(0);

      const entry = {
        id: crypto.randomUUID(),
        type: "code_run",
        input: "Run code",
        stdout: "",
        stderr: "Execution failed - check your connection",
        exitCode: -1,
        executionTime: Date.now() - start,
        timestamp: Date.now(),
        userName,
      };

      if (sharedHistory) {
        ydocRef.current?.transact(() => {
          sharedHistory.push([entry]);
        });
      }
    }
  }, [language, userName, sharedHistory]);

  const endInterview = async () => {
    const finalCode = codeGetterRef.current ? codeGetterRef.current() : "";
    // Flush remaining events
    const buf = eventBufferRef.current;
    eventBufferRef.current = [];
    if (buf.length > 0) {
      await fetch(`/api/interviews/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: buf }),
      }).catch(() => {});
    }
    // Save notes
    if (noteContent.trim()) {
      await fetch(`/api/interviews/${id}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteContent }),
      }).catch(() => {});
    }
    // End the interview
    await fetch(`/api/interviews/${id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalCode }),
    });
    router.push(`/admin/interviews/${id}/review`);
  };

  const saveNote = async () => {
    setNoteSaving(true);
    await fetch(`/api/interviews/${id}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteContent }),
    });
    setNoteSaving(false);
  };

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

  if (interview.status === "completed") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Interview Ended</h1>
          <p className="text-muted-foreground">
            This interview session has been completed.
          </p>
          {userRole === "interviewer" && (
            <Button onClick={() => router.push(`/admin/interviews/${id}/review`)}>
              View Review
            </Button>
          )}
        </div>
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
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white tracking-tight">
              d/dx
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

  const hasSolution = !!interview.question?.solutionCode;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-[8px] font-bold text-white tracking-tight">
            d/dx
          </div>
          <span className="text-sm font-medium">{interview.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-[10px] rounded-md border border-border bg-secondary/50 px-2 py-1 text-muted-foreground">
            {mode === "notebook" ? "Notebook" : language === "cpp" ? "C++" : "Python"}
          </span>

          <Button
            onClick={runCode}
            disabled={isRunning}
            size="sm"
            className="gap-1.5"
          >
            {isRunning ? "Running..." : "▶ Run"}
          </Button>

          {userRole === "interviewer" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowEndConfirm(true)}
            >
              End Interview
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <PanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        {/* Question Panel */}
        {showQuestion && interview.question ? (
          <>
            <Panel
              defaultSize="20%"
              minSize="12%"
              maxSize="40%"
              className="overflow-y-auto bg-background"
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
                <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground/80">
                  {interview.question.description
                    .split("\n")
                    .map((line, i) => (
                      <p key={i} className="mb-2">
                        {line}
                      </p>
                    ))}
                </div>
                {interview.question.files?.length > 0 && (
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
            </Panel>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />
          </>
        ) : (
          interview.question && (
            <button
              onClick={() => setShowQuestion(true)}
              className="flex items-center border-r border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground/80 cursor-pointer"
              title="Show question"
            >
              ❓
            </button>
          )
        )}

        {/* Editor + Right Panel */}
        {mode === "script" ? (
          <>
            <Panel defaultSize="55%" minSize="30%" className="overflow-hidden">
              <CollaborativeEditor
                roomId={id}
                userName={userName}
                initialContent={initialContent}
                language={language === "cpp" ? "cpp" : "python"}
                onCodeRef={handleCodeRef}
                onEvent={handleEditorEvent}
                onDocReady={handleDocReady}
              />
            </Panel>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />
            <Panel defaultSize="25%" minSize="15%" maxSize="50%" className="flex flex-col overflow-hidden">
              {/* Right panel tabs */}
              {userRole === "interviewer" && (
                <div className="flex border-b border-border text-xs">
                  <button
                    onClick={() => setRightPanel("output")}
                    className={`flex-1 py-2 transition-colors cursor-pointer ${
                      rightPanel === "output"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Output
                  </button>
                  <button
                    onClick={() => setRightPanel("notes")}
                    className={`flex-1 py-2 transition-colors cursor-pointer ${
                      rightPanel === "notes"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Notes
                  </button>
                  {hasSolution && (
                    <button
                      onClick={() => setRightPanel("solution")}
                      className={`flex-1 py-2 transition-colors cursor-pointer ${
                        rightPanel === "solution"
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Solution
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                {rightPanel === "output" && (
                  <OutputConsole
                    isRunning={isRunning}
                    roomId={id}
                    historyArray={sharedHistory}
                    ydoc={sharedDoc}
                    userName={userName}
                  />
                )}

                {rightPanel === "notes" && userRole === "interviewer" && (
                  <div className="flex h-full flex-col p-3 gap-2">
                    <p className="text-xs text-muted-foreground">
                      Private notes — only visible to you
                    </p>
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      className="flex-1 resize-none rounded-lg border border-input bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Take notes during the interview..."
                    />
                    <Button
                      onClick={saveNote}
                      disabled={noteSaving}
                      size="sm"
                      variant="secondary"
                    >
                      {noteSaving ? "Saving..." : "Save Notes"}
                    </Button>
                  </div>
                )}

                {rightPanel === "solution" &&
                  userRole === "interviewer" &&
                  hasSolution && (
                    <div className="flex h-full flex-col">
                      {showSolution ? (
                        <>
                          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Reference Solution
                            </span>
                            <button
                              onClick={() => setShowSolution(false)}
                              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              Hide
                            </button>
                          </div>
                          <pre className="flex-1 overflow-auto p-4 font-mono text-sm text-foreground/90 bg-card">
                            {interview.question!.solutionCode}
                          </pre>
                        </>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                          <p className="text-sm text-muted-foreground">
                            Solution is hidden
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setShowSolution(true)}
                          >
                            Reveal Solution
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </Panel>
          </>
        ) : (
          <Panel defaultSize="80%" minSize="50%" className="overflow-hidden">
            <NotebookEditor
              roomId={id}
              userName={userName}
              language={language === "cpp" ? "cpp" : "python"}
            />
          </Panel>
        )}
      </PanelGroup>

      {/* End Interview Confirmation Modal */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEndConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">End Interview?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This will save the final code, your notes, and all edit history.
                The session will be marked as completed and participants will be
                disconnected.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowEndConfirm(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={endInterview}>
                  End Interview
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

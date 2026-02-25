"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface InterviewEvent {
  id: string;
  timestamp: number;
  userName: string;
  type: string;
  content: string;
}

interface InterviewData {
  id: string;
  title: string;
  status: string;
  code: string;
  language: string;
  endedAt: string | null;
  createdAt: string;
  question: {
    title: string;
    description: string;
    difficulty: string;
    solutionCode: string;
    language: string;
  } | null;
}

interface NoteData {
  id: string;
  content: string;
}

export default function InterviewReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [events, setEvents] = useState<InterviewEvent[]>([]);
  const [note, setNote] = useState<NoteData | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [tab, setTab] = useState<"playback" | "notes">("playback");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/interviews/${id}`).then((r) => r.json()),
      fetch(`/api/interviews/${id}/events`).then((r) => r.json()),
      fetch(`/api/interviews/${id}/notes`).then((r) => r.json()),
    ]).then(([iv, ev, n]) => {
      if (cancelled) return;
      setInterview(iv);
      setEvents(ev);
      if (n.note) {
        setNote(n.note);
        setNoteContent(n.note.content);
      }
      if (ev.length > 0) setCurrentIdx(ev.length - 1);
    });
    return () => { cancelled = true; };
  }, [id]);

  const play = useCallback(() => {
    if (events.length === 0) return;
    setPlaying(true);
    setCurrentIdx(0);
  }, [events]);

  useEffect(() => {
    if (!playing || currentIdx >= events.length - 1) {
      return;
    }
    const delay = Math.min(
      events[currentIdx + 1].timestamp - events[currentIdx].timestamp,
      500
    );
    timerRef.current = setTimeout(() => {
      setCurrentIdx((i) => {
        const next = i + 1;
        if (next >= events.length - 1) setPlaying(false);
        return next;
      });
    }, Math.max(delay, 30));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, currentIdx, events]);

  const saveNote = async () => {
    setNoteSaving(true);
    await fetch(`/api/interviews/${id}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteContent }),
    });
    setNoteSaving(false);
  };

  if (!interview) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const currentCode = events.length > 0 ? events[currentIdx]?.content || "" : interview.code;
  const currentUser = events.length > 0 ? events[currentIdx]?.userName : "";
  const progress = events.length > 1 ? (currentIdx / (events.length - 1)) * 100 : 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{interview.title}</h1>
              <Badge variant="completed">{interview.status}</Badge>
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
            {interview.question && (
              <p className="mt-1 text-sm text-muted-foreground">
                {interview.question.title}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(interview.createdAt).toLocaleString()}
              {interview.endedAt &&
                ` — ended ${new Date(interview.endedAt).toLocaleString()}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={tab === "playback" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setTab("playback")}
            >
              Playback ({events.length} edits)
            </Button>
            <Button
              variant={tab === "notes" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setTab("notes")}
            >
              Notes
            </Button>
          </div>
        </div>
      </div>

      {tab === "playback" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Playback Editor */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Controls */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={playing ? () => setPlaying(false) : play}
                disabled={events.length === 0}
              >
                {playing ? "⏸ Pause" : "▶ Play"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCurrentIdx(0)}
                disabled={events.length === 0}
              >
                ⏮
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCurrentIdx(events.length - 1)}
                disabled={events.length === 0}
              >
                ⏭
              </Button>

              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(events.length - 1, 0)}
                  value={currentIdx}
                  onChange={(e) => {
                    setPlaying(false);
                    setCurrentIdx(Number(e.target.value));
                  }}
                  className="w-full accent-primary"
                  disabled={events.length === 0}
                />
              </div>

              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {events.length > 0
                  ? `${currentIdx + 1} / ${events.length}`
                  : "No events"}
              </span>

              {currentUser && (
                <span className="rounded bg-primary/20 px-2 py-0.5 text-xs text-primary">
                  {currentUser}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-secondary">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>

            <div className="flex-1">
              <Editor
                height="100%"
                language={interview.language === "cpp" ? "cpp" : "python"}
                value={currentCode}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                  automaticLayout: true,
                }}
              />
            </div>
          </div>

          {/* Solution Panel */}
          {interview.question?.solutionCode && (
            <div className="w-[400px] shrink-0 border-l border-border flex flex-col">
              <button
                onClick={() => setShowSolution((s) => !s)}
                className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-medium cursor-pointer hover:bg-secondary/50"
              >
                <span>Solution</span>
                <span className="text-xs text-muted-foreground">
                  {showSolution ? "Hide" : "Reveal"}
                </span>
              </button>
              {showSolution ? (
                <div className="flex-1">
                  <Editor
                    height="100%"
                    language={
                      interview.question.language === "cpp" ? "cpp" : "python"
                    }
                    value={interview.question.solutionCode}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      padding: { top: 12 },
                      automaticLayout: true,
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Click &quot;Reveal&quot; to view the solution
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Notes Tab */
        <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
          <h2 className="text-lg font-semibold mb-4">Interview Notes</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Private notes only visible to interviewers. These are saved to your account.
          </p>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Write your notes about the candidate's performance..."
          />
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={saveNote} disabled={noteSaving} size="sm">
              {noteSaving ? "Saving..." : note ? "Update Notes" : "Save Notes"}
            </Button>
            {note && (
              <span className="text-xs text-muted-foreground">
                Notes saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface Question {
  id: string;
  title: string;
  difficulty: string;
}

interface Interview {
  id: string;
  title: string;
  status: string;
  questionId: string | null;
  question: { title: string; difficulty: string } | null;
  createdAt: string;
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newInterview, setNewInterview] = useState({
    title: "",
    questionId: "",
  });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/interviews"), fetch("/api/questions")])
      .then(([ivRes, qRes]) => Promise.all([ivRes.json(), qRes.json()]))
      .then(([ivData, qData]) => {
        if (!cancelled) {
          setInterviews(ivData);
          setQuestions(qData);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleCreate = async () => {
    const res = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newInterview.title || "Untitled Interview",
        questionId: newInterview.questionId || null,
      }),
    });

    if (res.ok) {
      setShowModal(false);
      setNewInterview({ title: "", questionId: "" });
      setRefreshKey((k) => k + 1);
    }
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/room/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEnd = async (id: string) => {
    await fetch(`/api/interviews/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    setRefreshKey((k) => k + 1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this interview?")) return;
    await fetch(`/api/interviews/${id}`, { method: "DELETE" });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interviews</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage interview sessions
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          + Start New Interview
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          Loading...
        </div>
      ) : interviews.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          No interviews yet. Start your first one!
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {interviews.map((iv) => (
              <motion.div
                key={iv.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        iv.status === "active" ? "active" : "completed"
                      }
                    >
                      {iv.status}
                    </Badge>
                    <span className="font-medium">{iv.title}</span>
                    {iv.question && (
                      <span className="text-xs text-zinc-500">
                        — {iv.question.title}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(iv.createdAt).toLocaleDateString()} ·{" "}
                    <code className="text-zinc-600">
                      {iv.id.slice(0, 8)}...
                    </code>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {iv.status === "active" && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyLink(iv.id)}
                      >
                        {copiedId === iv.id ? "Copied!" : "Copy Link"}
                      </Button>
                      <a href={`/room/${iv.id}`} target="_blank" rel="noreferrer">
                        <Button variant="primary" size="sm">
                          Join
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEnd(iv.id)}
                      >
                        End
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(iv.id)}
                  >
                    Delete
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* New Interview Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">Start New Interview</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Create a session and share the link with your candidate
              </p>

              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-300">
                    Title
                  </label>
                  <input
                    value={newInterview.title}
                    onChange={(e) =>
                      setNewInterview((p) => ({
                        ...p,
                        title: e.target.value,
                      }))
                    }
                    placeholder="e.g. Frontend Engineer – Round 1"
                    className="flex h-9 w-full rounded-lg border border-input bg-zinc-800 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-300">
                    Question (optional)
                  </label>
                  <select
                    value={newInterview.questionId}
                    onChange={(e) =>
                      setNewInterview((p) => ({
                        ...p,
                        questionId: e.target.value,
                      }))
                    }
                    className="flex h-9 w-full rounded-lg border border-input bg-zinc-800 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">No pre-selected question</option>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title} ({q.difficulty})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate}>Create Session</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

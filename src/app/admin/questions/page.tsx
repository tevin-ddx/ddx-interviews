"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface Question {
  id: string;
  title: string;
  description: string;
  boilerplateCode: string;
  difficulty: string;
  category: string;
  language: string;
  createdAt: string;
  files: { id: string; name: string }[];
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/questions")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setQuestions(data);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/questions/${id}`, { method: "DELETE" });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Questions</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your interview question bank
          </p>
        </div>
        <Link href="/admin/questions/new">
          <Button>+ New Question</Button>
        </Link>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          Loading...
        </div>
      ) : questions.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          No questions yet. Create your first one!
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {questions.map((q) => (
              <motion.div
                key={q.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{q.title}</span>
                      <Badge
                        variant={
                          q.difficulty as "easy" | "medium" | "hard"
                        }
                      >
                        {q.difficulty}
                      </Badge>
                      <Badge>{q.language === "cpp" ? "C++" : "Python"}</Badge>
                      {q.category && (
                        <Badge>{q.category}</Badge>
                      )}
                      {q.files?.length > 0 && (
                        <span className="text-xs text-zinc-500">
                          📎 {q.files.length} file{q.files.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-lg truncate text-sm text-zinc-400">
                      {q.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/questions/${q.id}/edit`}>
                    <Button variant="secondary" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(q.id)}
                  >
                    Delete
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

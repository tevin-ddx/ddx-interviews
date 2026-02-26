"use client";

import { useState, useEffect, FormEvent, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const QUESTION_TYPES = [
  { value: "python_script", label: "Python Script" },
  { value: "python_notebook", label: "Python Notebook" },
  { value: "cpp", label: "C++" },
];

function typeToLanguage(type: string): string {
  return type === "cpp" ? "cpp" : "python";
}

export default function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    boilerplateCode: "",
    solutionCode: "",
    difficulty: "medium",
    category: "",
    type: "python_script",
  });

  useEffect(() => {
    fetch(`/api/questions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setForm({
          title: data.title,
          description: data.description,
          boilerplateCode: data.boilerplateCode,
          solutionCode: data.solutionCode || "",
          difficulty: data.difficulty,
          category: data.category,
          type: data.type || "python_script",
        });
        setLoading(false);
      });
  }, [id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          language: typeToLanguage(form.type),
        }),
      });

      if (res.ok) {
        router.push("/admin/questions");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold">Edit Question</h1>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="title"
          label="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground/80">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={4}
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground/80">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value }))
              }
              className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground/80">
              Difficulty
            </label>
            <select
              value={form.difficulty}
              onChange={(e) =>
                setForm((f) => ({ ...f, difficulty: e.target.value }))
              }
              className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <Input
            id="category"
            label="Category"
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value }))
            }
          />
        </div>

        {form.type !== "python_notebook" && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground/80">
              Boilerplate Code
            </label>
            <textarea
              value={form.boilerplateCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, boilerplateCode: e.target.value }))
              }
              rows={6}
              className="flex w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground/80">
            Solution Code{" "}
            <span className="text-muted-foreground font-normal">
              (interviewer-only, hidden from candidates)
            </span>
          </label>
          <textarea
            value={form.solutionCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, solutionCode: e.target.value }))
            }
            rows={6}
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Optional: paste the reference solution here"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

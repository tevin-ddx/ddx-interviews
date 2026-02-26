"use client";

import { useState, useEffect, FormEvent, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface NotebookCell {
  source: string;
  cell_type: string;
}

const QUESTION_TYPES = [
  { value: "python_script", label: "Python Script" },
  { value: "python_notebook", label: "Python Notebook" },
  { value: "cpp", label: "C++" },
];

function typeToLanguage(type: string): string {
  return type === "cpp" ? "cpp" : "python";
}

function parseIpynb(text: string): NotebookCell[] {
  const nb = JSON.parse(text);
  const cells: NotebookCell[] = [];
  for (const c of nb.cells || []) {
    if (c.cell_type !== "code") continue;
    const source = Array.isArray(c.source) ? c.source.join("") : c.source || "";
    if (source.trim()) cells.push({ source, cell_type: "code" });
  }
  return cells;
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
  const notebookInputRef = useRef<HTMLInputElement>(null);
  const [notebookCells, setNotebookCells] = useState<NotebookCell[]>([]);
  const [notebookFileName, setNotebookFileName] = useState<string>("");
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
        if (data.type === "python_notebook" && data.boilerplateCode) {
          try {
            const parsed = JSON.parse(data.boilerplateCode);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setNotebookCells(parsed);
              setNotebookFileName("Existing notebook");
            }
          } catch {
            // not JSON
          }
        }
        setLoading(false);
      });
  }, [id]);

  const handleNotebookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cells = parseIpynb(reader.result as string);
        setNotebookCells(cells);
        setNotebookFileName(file.name);
      } catch {
        alert("Failed to parse notebook file");
      }
    };
    reader.readAsText(file);
    if (notebookInputRef.current) notebookInputRef.current.value = "";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const boilerplate =
      form.type === "python_notebook" && notebookCells.length > 0
        ? JSON.stringify(notebookCells)
        : form.boilerplateCode;

    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          boilerplateCode: boilerplate,
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

        {form.type === "python_notebook" ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground/80">
              Starter Notebook
            </label>
            <p className="text-xs text-muted-foreground">
              Upload a .ipynb file to pre-populate the notebook cells
            </p>

            {notebookCells.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{notebookFileName}</span>
                  <button
                    type="button"
                    onClick={() => { setNotebookCells([]); setNotebookFileName(""); }}
                    className="text-xs text-muted-foreground hover:text-red-400 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {notebookCells.length} code cell{notebookCells.length !== 1 ? "s" : ""} found
                </p>
                {notebookCells.map((cell, i) => (
                  <pre
                    key={i}
                    className="rounded-md bg-secondary/50 px-3 py-2 font-mono text-xs text-foreground/80 overflow-x-auto max-h-24 overflow-y-auto"
                  >
                    {cell.source.length > 200 ? cell.source.slice(0, 200) + "..." : cell.source}
                  </pre>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={notebookInputRef}
                type="file"
                accept=".ipynb"
                onChange={handleNotebookUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => notebookInputRef.current?.click()}
              >
                {notebookCells.length > 0 ? "Replace Notebook" : "Upload .ipynb"}
              </Button>
            </div>
          </div>
        ) : (
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

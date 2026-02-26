"use client";

import { useState, FormEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface UploadedFile {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

interface NotebookCell {
  source: string;
  cell_type: string;
}

const QUESTION_TYPES = [
  { value: "python_script", label: "Python Script" },
  { value: "python_notebook", label: "Python Notebook" },
  { value: "cpp", label: "C++" },
];

const BOILERPLATES: Record<string, string> = {
  python_script: "# Write your solution here\n",
  python_notebook: "",
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
};

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

export default function NewQuestionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notebookInputRef = useRef<HTMLInputElement>(null);
  const [notebookCells, setNotebookCells] = useState<NotebookCell[]>([]);
  const [notebookFileName, setNotebookFileName] = useState<string>("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    boilerplateCode: "# Write your solution here\n",
    solutionCode: "",
    difficulty: "medium",
    category: "",
    type: "python_script",
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.files) {
        setUploadedFiles((prev) => [...prev, ...data.files]);
      }
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (idx: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTypeChange = (type: string) => {
    setForm((f) => ({
      ...f,
      type,
      boilerplateCode:
        f.boilerplateCode === BOILERPLATES[f.type]
          ? BOILERPLATES[type] || ""
          : f.boilerplateCode,
    }));
    if (type !== "python_notebook") {
      setNotebookCells([]);
      setNotebookFileName("");
    }
  };

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
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          boilerplateCode: boilerplate,
          language: typeToLanguage(form.type),
          files: uploadedFiles,
        }),
      });

      if (res.ok) {
        router.push("/admin/questions");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold">New Question</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a new coding interview question
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="title"
          label="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Two Sum"
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
            placeholder="Describe the problem..."
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
              onChange={(e) => handleTypeChange(e.target.value)}
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
            placeholder="e.g. Arrays"
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

        {/* File Attachments */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground/80">
            Attachments
          </label>
          <p className="text-xs text-muted-foreground">
            Upload reference files, datasets, or test inputs for this question
          </p>

          {uploadedFiles.length > 0 && (
            <div className="space-y-1">
              {uploadedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">
                      📎
                    </span>
                    <span className="text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-xs text-muted-foreground hover:text-red-400 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload Files"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Question"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

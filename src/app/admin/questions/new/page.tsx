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

export default function NewQuestionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    boilerplateCode: "# Write your solution here\n",
    solutionCode: "",
    difficulty: "medium",
    category: "",
    language: "python",
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, files: uploadedFiles }),
      });

      if (res.ok) {
        router.push("/admin/questions");
      }
    } finally {
      setSaving(false);
    }
  };

  const boilerplates: Record<string, string> = {
    python: "# Write your solution here\n",
    cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
  };

  const handleLanguageChange = (lang: string) => {
    setForm((f) => ({
      ...f,
      language: lang,
      boilerplateCode:
        f.boilerplateCode === boilerplates[f.language]
          ? boilerplates[lang] || ""
          : f.boilerplateCode,
    }));
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
              Language
            </label>
            <select
              value={form.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="python">Python</option>
              <option value="cpp">C++</option>
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

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground/80">
            Solution Code <span className="text-muted-foreground font-normal">(interviewer-only, hidden from candidates)</span>
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
                    <span className="text-xs text-indigo-600 dark:text-indigo-400">📎</span>
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
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import CodeEditor from "./CodeEditor";
import OutputConsole from "./OutputConsole";
import Button from "../ui/Button";

interface Cell {
  id: string;
  code: string;
  output: string;
  stderr: string;
  isRunning: boolean;
  exitCode: number | null;
}

interface NotebookEditorProps {
  initialCells?: Cell[];
}

function createCell(): Cell {
  return {
    id: crypto.randomUUID(),
    code: "",
    output: "",
    stderr: "",
    isRunning: false,
    exitCode: null,
  };
}

export default function NotebookEditor({ initialCells }: NotebookEditorProps) {
  const [cells, setCells] = useState<Cell[]>(
    initialCells || [createCell()]
  );

  const updateCellCode = useCallback((cellId: string, code: string) => {
    setCells((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, code } : c))
    );
  }, []);

  const runCell = useCallback(
    async (cellId: string) => {
      const cellIndex = cells.findIndex((c) => c.id === cellId);
      if (cellIndex === -1) return;

      const codeParts = cells
        .slice(0, cellIndex + 1)
        .map((c) => c.code)
        .join("\n");

      setCells((prev) =>
        prev.map((c) =>
          c.id === cellId
            ? { ...c, isRunning: true, output: "", stderr: "" }
            : c
        )
      );

      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeParts }),
        });
        const result = await res.json();

        setCells((prev) =>
          prev.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  isRunning: false,
                  output: result.stdout || "",
                  stderr: result.stderr || "",
                  exitCode: result.code ?? -1,
                }
              : c
          )
        );
      } catch {
        setCells((prev) =>
          prev.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  isRunning: false,
                  stderr: "Execution failed",
                  exitCode: -1,
                }
              : c
          )
        );
      }
    },
    [cells]
  );

  const addCell = useCallback(() => {
    setCells((prev) => [...prev, createCell()]);
  }, []);

  const removeCell = useCallback((cellId: string) => {
    setCells((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== cellId);
    });
  }, []);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-4">
      {cells.map((cell, index) => (
        <div
          key={cell.id}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
            <span className="text-xs text-zinc-500">
              In [{index + 1}]
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => runCell(cell.id)}
                disabled={cell.isRunning}
              >
                ▶ Run
              </Button>
              {cells.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCell(cell.id)}
                >
                  ✕
                </Button>
              )}
            </div>
          </div>
          <div className="h-32">
            <CodeEditor
              value={cell.code}
              onChange={(v) => updateCellCode(cell.id, v)}
              height="100%"
            />
          </div>
          {(cell.output || cell.stderr || cell.isRunning) && (
            <div className="h-24 border-t border-zinc-800">
              <OutputConsole
                output={cell.output}
                stderr={cell.stderr}
                isRunning={cell.isRunning}
                exitCode={cell.exitCode}
                executionTime={null}
              />
            </div>
          )}
        </div>
      ))}
      <button
        onClick={addCell}
        className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 cursor-pointer"
      >
        + Add Cell
      </button>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import * as Y from "yjs";
import Button from "../ui/Button";
import OutputConsole from "./OutputConsole";

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ||
  "codestream-collab.tevin-ddx.partykit.dev";

const CURSOR_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#ef4444", "#22c55e", "#3b82f6",
];

interface CellOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  isRunning: boolean;
  executionTime: number | null;
}

interface CellView {
  id: string;
  yText: Y.Text;
  output: CellOutput;
}

interface StarterCell {
  source: string;
}

interface NotebookEditorProps {
  roomId?: string;
  userName?: string;
  language?: string;
  initialCells?: StarterCell[];
}

export default function NotebookEditor({
  roomId,
  userName = "Anonymous",
  language = "python",
  initialCells,
}: NotebookEditorProps) {
  const docRef = useRef<Y.Doc | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providerRef = useRef<any>(null);
  const cellsArrayRef = useRef<Y.Array<Y.Map<unknown>> | null>(null);
  const [cells, setCells] = useState<CellView[]>([]);
  const [connected, setConnected] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [awareness, setAwareness] = useState<any>(null);
  const initializedRef = useRef(false);

  const syncCellViews = useCallback(() => {
    const arr = cellsArrayRef.current;
    if (!arr) return;

    const views: CellView[] = [];
    arr.forEach((yMap: Y.Map<unknown>) => {
      const id = yMap.get("id") as string;
      const yText = yMap.get("code") as Y.Text;
      const outputMap = yMap.get("output") as Y.Map<unknown> | undefined;

      views.push({
        id,
        yText,
        output: {
          stdout: (outputMap?.get("stdout") as string) ?? "",
          stderr: (outputMap?.get("stderr") as string) ?? "",
          exitCode: (outputMap?.get("exitCode") as number | null) ?? null,
          isRunning: (outputMap?.get("isRunning") as number) === 1,
          executionTime:
            (outputMap?.get("executionTime") as number | null) ?? null,
        },
      });
    });
    setCells(views);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let destroyed = false;

    (async () => {
      const doc = new Y.Doc();
      docRef.current = doc;

      const cellsArray = doc.getArray<Y.Map<unknown>>("notebookCells");
      cellsArrayRef.current = cellsArray;

      try {
        const { default: YPartyKitProvider } = await import(
          "y-partykit/provider"
        );
        const provider = new YPartyKitProvider(
          PARTYKIT_HOST,
          `${roomId}-notebook`,
          doc,
          { connect: true },
        );
        providerRef.current = provider;

        const color =
          CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
        provider.awareness.setLocalStateField("user", {
          name: userName,
          color,
        });
        if (!destroyed) setAwareness(provider.awareness);

        provider.on("sync", (synced: boolean) => {
          if (synced && !initializedRef.current) {
            initializedRef.current = true;
            if (!destroyed) setConnected(true);
            if (cellsArray.length === 0) {
              const jitter = 200 + Math.random() * 500;
              setTimeout(() => {
                if (cellsArray.length === 0) {
                  if (initialCells && initialCells.length > 0) {
                    for (const c of initialCells) {
                      addCellToDoc(doc, cellsArray, c.source);
                    }
                  } else {
                    addCellToDoc(doc, cellsArray);
                  }
                }
              }, jitter);
            }
            syncCellViews();
          }
        });

        provider.on("status", ({ status }: { status: string }) => {
          if (!destroyed) setConnected(status === "connected");
        });
      } catch {
        initializedRef.current = true;
        if (!destroyed) setConnected(true);
        if (cellsArray.length === 0) {
          if (initialCells && initialCells.length > 0) {
            for (const c of initialCells) addCellToDoc(doc, cellsArray, c.source);
          } else {
            addCellToDoc(doc, cellsArray);
          }
        }
        syncCellViews();
      }

      cellsArray.observeDeep(() => {
        if (!destroyed) syncCellViews();
      });

      setTimeout(() => {
        if (!initializedRef.current) {
          initializedRef.current = true;
          if (!destroyed) setConnected(true);
          if (cellsArray.length === 0) {
            if (initialCells && initialCells.length > 0) {
              for (const c of initialCells) addCellToDoc(doc, cellsArray, c.source);
            } else {
              addCellToDoc(doc, cellsArray);
            }
          }
          syncCellViews();
        }
      }, 4000);
    })();

    return () => {
      destroyed = true;
      providerRef.current?.destroy();
      docRef.current?.destroy();
    };
  }, [roomId, userName, syncCellViews]);

  const addCell = useCallback(() => {
    const doc = docRef.current;
    const arr = cellsArrayRef.current;
    if (!doc || !arr) return;
    addCellToDoc(doc, arr);
  }, []);

  const removeCell = useCallback((cellId: string) => {
    const arr = cellsArrayRef.current;
    if (!arr || arr.length <= 1) return;
    for (let i = 0; i < arr.length; i++) {
      const m = arr.get(i);
      if ((m.get("id") as string) === cellId) {
        arr.delete(i, 1);
        break;
      }
    }
  }, []);

  const runCell = useCallback(
    async (cellId: string) => {
      const arr = cellsArrayRef.current;
      if (!arr) return;

      let cellIndex = -1;
      for (let i = 0; i < arr.length; i++) {
        if ((arr.get(i).get("id") as string) === cellId) {
          cellIndex = i;
          break;
        }
      }
      if (cellIndex === -1) return;

      const yText = arr.get(cellIndex).get("code") as Y.Text;
      const cellCode = yText.toString();

      const cellMap = arr.get(cellIndex);
      const outputMap = cellMap.get("output") as Y.Map<unknown>;

      docRef.current?.transact(() => {
        outputMap.set("isRunning", 1);
        outputMap.set("stdout", "");
        outputMap.set("stderr", "");
        outputMap.set("exitCode", null);
        outputMap.set("executionTime", null);
      });

      const start = Date.now();
      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: cellCode,
            language,
            roomId,
            cell: true,
          }),
        });
        const result = await res.json();
        docRef.current?.transact(() => {
          outputMap.set("isRunning", 0);
          outputMap.set("stdout", result.stdout || "");
          outputMap.set("stderr", result.stderr || result.error || "");
          outputMap.set("exitCode", result.code ?? -1);
          outputMap.set("executionTime", Date.now() - start);
        });
      } catch {
        docRef.current?.transact(() => {
          outputMap.set("isRunning", 0);
          outputMap.set("stderr", "Execution failed - check your connection");
          outputMap.set("exitCode", -1);
          outputMap.set("executionTime", Date.now() - start);
        });
      }
    },
    [language, roomId],
  );

  if (!roomId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Notebook mode requires a room connection.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <div
          className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`}
        />
        <span className="text-[10px] text-muted-foreground">
          {connected ? "Notebook synced" : "Connecting..."}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cells.map((cell, index) => (
          <NotebookCell
            key={cell.id}
            cell={cell}
            index={index}
            awareness={awareness}
            language={language}
            canRemove={cells.length > 1}
            onRun={() => runCell(cell.id)}
            onRemove={() => removeCell(cell.id)}
          />
        ))}

        <button
          onClick={addCell}
          className="w-full rounded-lg border border-dashed border-border/80 py-2 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground/80 cursor-pointer"
        >
          + Add Cell
        </button>
      </div>
    </div>
  );
}

function addCellToDoc(doc: Y.Doc, arr: Y.Array<Y.Map<unknown>>, source = "") {
  doc.transact(() => {
    const cellMap = new Y.Map<unknown>();
    cellMap.set("id", crypto.randomUUID());
    const code = new Y.Text();
    if (source) code.insert(0, source);
    cellMap.set("code", code);
    const outputMap = new Y.Map<unknown>();
    outputMap.set("stdout", "");
    outputMap.set("stderr", "");
    outputMap.set("exitCode", null);
    outputMap.set("isRunning", 0);
    outputMap.set("executionTime", null);
    cellMap.set("output", outputMap);
    arr.push([cellMap]);
  });
}

interface NotebookCellProps {
  cell: CellView;
  index: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  awareness: any;
  language: string;
  canRemove: boolean;
  onRun: () => void;
  onRemove: () => void;
}

function NotebookCell({
  cell,
  index,
  awareness,
  language,
  canRemove,
  onRun,
  onRemove,
}: NotebookCellProps) {
  const bindingRef = useRef<{ destroy: () => void } | null>(null);

  const handleMount: OnMount = useCallback(
    async (editorInstance) => {
      const model = editorInstance.getModel();
      if (!model) return;

      try {
        const { MonacoBinding } = await import("y-monaco");
        bindingRef.current?.destroy();
        const binding = new MonacoBinding(
          cell.yText,
          model,
          new Set([editorInstance]),
          awareness ?? undefined,
        );
        bindingRef.current = binding;
      } catch {
        // Fallback: no collaborative binding
      }
    },
    [cell.yText, awareness],
  );

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
    };
  }, []);

  const hasOutput =
    cell.output.stdout || cell.output.stderr || cell.output.isRunning;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground font-mono">
          In [{index + 1}]
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRun}
            disabled={cell.output.isRunning}
          >
            {cell.output.isRunning ? "Running..." : "▶ Run"}
          </Button>
          {canRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              ✕
            </Button>
          )}
        </div>
      </div>

      <div className="h-32">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          onMount={handleMount}
          options={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: "line",
            cursorBlinking: "smooth",
            tabSize: 4,
            wordWrap: "on",
            automaticLayout: true,
            lineNumbers: "off",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 8,
          }}
        />
      </div>

      {hasOutput && (
        <div className="h-24 border-t border-border">
          <OutputConsole
            output={cell.output.stdout}
            stderr={cell.output.stderr}
            isRunning={cell.output.isRunning}
            exitCode={cell.output.exitCode}
            executionTime={cell.output.executionTime}
          />
        </div>
      )}
    </div>
  );
}

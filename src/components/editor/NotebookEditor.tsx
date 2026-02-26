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

interface Peer {
  name: string;
  color: string;
  clientId: number;
}

function injectCursorStyles() {
  const STYLE_ID = "yjs-cursor-styles";
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .yRemoteSelection {
      background-color: var(--yjs-selection-color, rgba(99,102,241,0.25));
    }
    .yRemoteSelectionHead {
      position: absolute;
      border-left: 2px solid var(--yjs-cursor-color, #6366f1);
      border-top: 2px solid var(--yjs-cursor-color, #6366f1);
      height: 100%;
      box-sizing: border-box;
    }
    .yRemoteSelectionHead::after {
      position: absolute;
      content: attr(data-name);
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      line-height: 1;
      padding: 1px 4px 2px;
      border-radius: 3px 3px 3px 0;
      background-color: var(--yjs-cursor-color, #6366f1);
      left: -2px;
      top: -18px;
      white-space: nowrap;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

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
  const [peers, setPeers] = useState<Peer[]>([]);
  const initializedRef = useRef(false);
  const colorRef = useRef(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]);

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
    injectCursorStyles();
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

        provider.awareness.setLocalStateField("user", {
          name: userName,
          color: colorRef.current,
        });
        if (!destroyed) setAwareness(provider.awareness);

        provider.awareness.on("change", () => {
          if (destroyed) return;
          const states = provider.awareness.getStates();
          const peerList: Peer[] = [];
          states.forEach((state: Record<string, unknown>, clientId: number) => {
            if (clientId !== doc.clientID && state.user) {
              const user = state.user as { name: string; color: string };
              peerList.push({ clientId, name: user.name, color: user.color });
            }
          });
          setPeers(peerList);
        });

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
          {connected ? (peers.length > 0 ? "Live" : "Ready") : "Connecting..."}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: colorRef.current }}
          >
            {userName} (you)
          </span>
          {peers.map((p) => (
            <span
              key={p.clientId}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.name}
            </span>
          ))}
        </div>
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

const MIN_CELL_HEIGHT = 40;
const MAX_CELL_HEIGHT = 600;

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
  const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [editorHeight, setEditorHeight] = useState(MIN_CELL_HEIGHT);

  const updateHeight = useCallback((ed: editor.IStandaloneCodeEditor) => {
    const contentHeight = ed.getContentHeight();
    const clamped = Math.max(MIN_CELL_HEIGHT, Math.min(contentHeight, MAX_CELL_HEIGHT));
    setEditorHeight(clamped);
    ed.layout();
  }, []);

  const handleMount: OnMount = useCallback(
    async (editorInstance) => {
      editorInstanceRef.current = editorInstance;
      const model = editorInstance.getModel();
      if (!model) return;

      updateHeight(editorInstance);
      editorInstance.onDidContentSizeChange(() => updateHeight(editorInstance));

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

        setTimeout(() => updateHeight(editorInstance), 100);
      } catch {
        // Fallback: no collaborative binding
      }
    },
    [cell.yText, awareness, updateHeight],
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

      <div style={{ height: editorHeight }}>
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
            scrollbar: { vertical: "hidden", horizontal: "auto" },
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
        <div className="max-h-48 border-t border-border">
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

"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import * as Y from "yjs";

const CURSOR_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#ef4444", "#22c55e", "#3b82f6",
];

const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST || "codestream-collab.tevin-ddx.partykit.dev";

interface Peer {
  name: string;
  color: string;
  clientId: number;
}

interface EditorEvent {
  timestamp: number;
  userName: string;
  type: string;
  content: string;
}

interface CollaborativeEditorProps {
  roomId: string;
  userName: string;
  initialContent?: string;
  language?: string;
  readOnly?: boolean;
  onCodeRef?: (getter: () => string) => void;
  onEvent?: (event: EditorEvent) => void;
  onDocReady?: (doc: Y.Doc) => void;
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

export default function CollaborativeEditor({
  roomId,
  userName,
  initialContent = "",
  language = "python",
  readOnly = false,
  onCodeRef,
  onEvent,
  onDocReady,
}: CollaborativeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providerRef = useRef<any>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const initializedRef = useRef(false);
  const colorRef = useRef(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]);

  useEffect(() => {
    injectCursorStyles();
    return () => {
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      docRef.current?.destroy();
    };
  }, []);

  const setupCollaboration = useCallback(
    async (editorInstance: editor.IStandaloneCodeEditor) => {
      const doc = new Y.Doc();
      docRef.current = doc;
      const yText = doc.getText("monaco");

      if (onCodeRef) onCodeRef(() => yText.toString());
      if (onDocReady) onDocReady(doc);

      const tryInitializeContent = () => {
        if (initializedRef.current) return;
        if (yText.length === 0 && initialContent) {
          doc.transact(() => {
            yText.insert(0, initialContent);
          });
        }
        initializedRef.current = true;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let awareness: any = undefined;

      try {
        const { default: YPartyKitProvider } = await import(
          "y-partykit/provider"
        );

        const provider = new YPartyKitProvider(PARTYKIT_HOST, roomId, doc, {
          connect: true,
        });

        providerRef.current = provider;

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        doc.on("update", (_update: Uint8Array, origin: unknown) => {
          if (origin === provider) return;
          if (!onEvent) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            onEvent({
              timestamp: Date.now(),
              userName,
              type: "edit",
              content: yText.toString(),
            });
          }, 400);
        });
        awareness = provider.awareness;

        provider.awareness.setLocalStateField("user", {
          name: userName,
          color: colorRef.current,
        });

        provider.on("sync", (synced: boolean) => {
          if (synced) {
            setConnected(true);
            // Random delay (200-700ms) prevents both users from inserting
            // boilerplate simultaneously — the first inserter wins and
            // the second will see non-empty content via server sync.
            const jitter = 200 + Math.random() * 500;
            setTimeout(tryInitializeContent, jitter);
          }
        });

        provider.on("status", ({ status }: { status: string }) => {
          setConnected(status === "connected");
        });

        provider.awareness.on("change", () => {
          const states = provider.awareness.getStates();
          const peerList: Peer[] = [];
          states.forEach(
            (state: Record<string, unknown>, clientId: number) => {
              if (clientId !== doc.clientID && state.user) {
                const user = state.user as { name: string; color: string };
                peerList.push({
                  clientId,
                  name: user.name,
                  color: user.color,
                });
              }
            },
          );
          setPeers(peerList);
        });
      } catch {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        doc.on("update", () => {
          if (!onEvent) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            onEvent({
              timestamp: Date.now(),
              userName,
              type: "edit",
              content: yText.toString(),
            });
          }, 400);
        });
        tryInitializeContent();
        setConnected(true);
      }

      // Hard fallback: if sync never fires (network issues), init after 4s
      setTimeout(() => {
        if (!initializedRef.current) {
          tryInitializeContent();
          setConnected(true);
        }
      }, 4000);

      const model = editorInstance.getModel();
      if (model) {
        const { MonacoBinding } = await import("y-monaco");
        const binding = new MonacoBinding(
          yText,
          model,
          new Set([editorInstance]),
          awareness,
        );
        bindingRef.current = binding;
      }
    },
    [roomId, userName, initialContent, onCodeRef, onEvent, onDocReady],
  );

  const handleMount: OnMount = useCallback(
    (editorInstance) => {
      editorRef.current = editorInstance;
      editorInstance.focus();
      setupCollaboration(editorInstance);
    },
    [setupCollaboration],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border">
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

      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          onMount={handleMount}
          options={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: "line",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            tabSize: 4,
            wordWrap: "on",
            readOnly,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true },
          }}
        />
      </div>
    </div>
  );
}

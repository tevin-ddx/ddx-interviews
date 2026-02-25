"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import * as Y from "yjs";

const CURSOR_COLORS = [
  "#6366f1", "#ec4899", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#ef4444", "#22c55e", "#3b82f6",
];

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
}

const MSG_SYNC_STEP1 = 0;
const MSG_SYNC_STEP2 = 1;
const MSG_SYNC_UPDATE = 2;
const MSG_AWARENESS = 3;

function encodeAwareness(clientId: number, state: object): Uint8Array {
  const stateStr = JSON.stringify(state);
  const stateBytes = new TextEncoder().encode(stateStr);
  const buf: number[] = [];

  buf.push(1);

  let id = clientId;
  while (id > 0x7f) {
    buf.push(0x80 | (id & 0x7f));
    id >>>= 7;
  }
  buf.push(id & 0x7f);

  let c = Date.now() & 0xffffffff;
  while (c > 0x7f) {
    buf.push(0x80 | (c & 0x7f));
    c >>>= 7;
  }
  buf.push(c & 0x7f);

  let len = stateBytes.length;
  while (len > 0x7f) {
    buf.push(0x80 | (len & 0x7f));
    len >>>= 7;
  }
  buf.push(len & 0x7f);
  for (let i = 0; i < stateBytes.length; i++) buf.push(stateBytes[i]);

  return new Uint8Array(buf);
}

function decodeAwareness(data: Uint8Array): Array<{ clientId: number; state: Record<string, unknown> }> {
  const results: Array<{ clientId: number; state: Record<string, unknown> }> = [];
  try {
    let offset = 0;
    let count = 0;
    let shift = 0;
    let b;
    do {
      b = data[offset++];
      count |= (b & 0x7f) << shift;
      shift += 7;
    } while (b >= 0x80);

    for (let i = 0; i < count; i++) {
      let clientId = 0;
      shift = 0;
      do {
        b = data[offset++];
        clientId |= (b & 0x7f) << shift;
        shift += 7;
      } while (b >= 0x80);

      shift = 0;
      do {
        b = data[offset++];
        shift += 7;
      } while (b >= 0x80);

      let sLen = 0;
      shift = 0;
      do {
        b = data[offset++];
        sLen |= (b & 0x7f) << shift;
        shift += 7;
      } while (b >= 0x80);

      const stateBytes = data.slice(offset, offset + sLen);
      offset += sLen;
      const stateStr = new TextDecoder().decode(stateBytes);
      const state = JSON.parse(stateStr);
      results.push({ clientId, state });
    }
  } catch {
    /* ignore malformed awareness */
  }
  return results;
}

export default function CollaborativeEditor({
  roomId,
  userName,
  initialContent = "",
  language = "python",
  readOnly = false,
  onCodeRef,
  onEvent,
}: CollaborativeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const initializedRef = useRef(false);
  const colorRef = useRef(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]);
  const codeGetterRef = useRef<() => string>(() => "");

  useEffect(() => {
    if (onCodeRef) {
      onCodeRef(() => {
        const doc = docRef.current;
        if (doc) return doc.getText("monaco").toString();
        return "";
      });
    }
  }, [onCodeRef]);

  const setupCollaboration = useCallback(
    async (editorInstance: editor.IStandaloneCodeEditor) => {
      const doc = new Y.Doc();
      docRef.current = doc;
      const yText = doc.getText("monaco");

      codeGetterRef.current = () => yText.toString();
      if (onCodeRef) onCodeRef(codeGetterRef.current);

      const wsUrl =
        (typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws") +
        `://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:1234/${roomId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setConnected(true);

        const sv = Y.encodeStateVector(doc);
        const msg = new Uint8Array(1 + sv.length);
        msg[0] = MSG_SYNC_STEP1;
        msg.set(sv, 1);
        ws.send(msg);

        const awarenessData = encodeAwareness(doc.clientID, {
          user: { name: userName, color: colorRef.current },
        });
        const awarenessMsg = new Uint8Array(1 + awarenessData.length);
        awarenessMsg[0] = MSG_AWARENESS;
        awarenessMsg.set(awarenessData, 1);
        ws.send(awarenessMsg);
      };

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data);
        const msgType = data[0];
        const payload = data.slice(1);

        switch (msgType) {
          case MSG_SYNC_STEP1: {
            const update = Y.encodeStateAsUpdate(doc, payload);
            const resp = new Uint8Array(1 + update.length);
            resp[0] = MSG_SYNC_STEP2;
            resp.set(update, 1);
            ws.send(resp);
            break;
          }
          case MSG_SYNC_STEP2: {
            Y.applyUpdate(doc, payload);

            if (!initializedRef.current && yText.length === 0 && initialContent) {
              doc.transact(() => {
                yText.insert(0, initialContent);
              });
            }
            initializedRef.current = true;
            break;
          }
          case MSG_SYNC_UPDATE: {
            Y.applyUpdate(doc, payload);
            break;
          }
          case MSG_AWARENESS: {
            const updates = decodeAwareness(payload);
            setPeers((prev) => {
              const map = new Map(prev.map((p) => [p.clientId, p]));
              for (const u of updates) {
                if (u.state && typeof u.state === "object" && "user" in u.state) {
                  const user = u.state.user as { name: string; color: string };
                  map.set(u.clientId, {
                    clientId: u.clientId,
                    name: user.name,
                    color: user.color,
                  });
                }
              }
              map.delete(doc.clientID);
              return Array.from(map.values());
            });
            break;
          }
        }
      };

      ws.onclose = () => setConnected(false);

      doc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin === "remote") return;
        if (ws.readyState === WebSocket.OPEN) {
          const msg = new Uint8Array(1 + update.length);
          msg[0] = MSG_SYNC_UPDATE;
          msg.set(update, 1);
          ws.send(msg);
        }
        if (onEvent) {
          onEvent({
            timestamp: Date.now(),
            userName,
            type: "edit",
            content: yText.toString(),
          });
        }
      });

      const model = editorInstance.getModel();
      if (model) {
        const { MonacoBinding } = await import("y-monaco");
        const binding = new MonacoBinding(
          yText,
          model,
          new Set([editorInstance])
        );
        bindingRef.current = binding;
      }
    },
    [roomId, userName, initialContent, onCodeRef, onEvent]
  );

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      wsRef.current?.close();
      docRef.current?.destroy();
    };
  }, []);

  const handleMount: OnMount = useCallback(
    (editorInstance) => {
      editorRef.current = editorInstance;
      editorInstance.focus();
      setupCollaboration(editorInstance);
    },
    [setupCollaboration]
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border">
      {/* Presence bar */}
      <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <div
          className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-600"}`}
        />
        <span className="text-[10px] text-muted-foreground">
          {connected ? "Live" : "Connecting..."}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {/* Current user */}
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: colorRef.current }}
          >
            {userName} (you)
          </span>
          {/* Remote peers */}
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

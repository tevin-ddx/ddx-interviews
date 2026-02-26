"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import * as Y from "yjs";

interface HistoryEntry {
  id: string;
  type: "code_run" | "terminal";
  input: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number | null;
  timestamp: number;
  userName?: string;
}

interface OutputConsoleProps {
  isRunning: boolean;
  roomId?: string;
  userName?: string;
  historyArray?: Y.Array<Record<string, unknown>> | null;
  ydoc?: Y.Doc | null;
  // Legacy props for standalone use (notebook cells)
  output?: string;
  stderr?: string;
  exitCode?: number | null;
  executionTime?: number | null;
}

export default function OutputConsole({
  isRunning,
  roomId,
  userName,
  historyArray,
  ydoc,
  output,
  stderr,
  exitCode,
  executionTime,
}: OutputConsoleProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [runningCmd, setRunningCmd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Legacy mode: track output/stderr props for notebook cell inline output
  const lastOutputRef = useRef<string>("");
  const lastStderrRef = useRef<string>("");

  useEffect(() => {
    if (historyArray) return; // shared mode — skip legacy
    if (isRunning) return;
    const hasOutput = output || stderr;
    const isSame =
      output === lastOutputRef.current && stderr === lastStderrRef.current;
    if (hasOutput && !isSame) {
      lastOutputRef.current = output || "";
      lastStderrRef.current = stderr || "";
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "code_run",
          input: "Run code",
          stdout: output || "",
          stderr: stderr || "",
          exitCode: exitCode ?? null,
          executionTime: executionTime ?? null,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [output, stderr, isRunning, exitCode, executionTime, historyArray]);

  // Shared mode: observe the Y.Array for changes
  useEffect(() => {
    if (!historyArray) return;

    const sync = () => {
      const entries: HistoryEntry[] = [];
      historyArray.forEach((item: Record<string, unknown>) => {
        entries.push({
          id: (item.id as string) || crypto.randomUUID(),
          type: (item.type as "code_run" | "terminal") || "code_run",
          input: (item.input as string) || "",
          stdout: (item.stdout as string) || "",
          stderr: (item.stderr as string) || "",
          exitCode: (item.exitCode as number | null) ?? null,
          executionTime: (item.executionTime as number | null) ?? null,
          timestamp: (item.timestamp as number) || 0,
          userName: (item.userName as string) || undefined,
        });
      });
      setHistory(entries);
    };

    sync();
    historyArray.observe(sync);
    return () => historyArray.unobserve(sync);
  }, [historyArray]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isRunning, runningCmd]);

  const handleTerminalSubmit = useCallback(
    async (cmd: string) => {
      if (!cmd.trim()) return;

      setCmdHistory((prev) => [...prev, cmd]);
      setCmdHistoryIdx(-1);
      setTerminalInput("");
      setRunningCmd(true);

      const start = Date.now();

      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: cmd, language: "shell", roomId }),
        });
        const result = await res.json();

        const entry: Record<string, unknown> = {
          id: crypto.randomUUID(),
          type: "terminal",
          input: cmd,
          stdout: result.stdout || "",
          stderr: result.stderr || result.error || "",
          exitCode: result.code ?? -1,
          executionTime: Date.now() - start,
          timestamp: Date.now(),
          userName,
        };

        if (historyArray && ydoc) {
          ydoc.transact(() => historyArray.push([entry]));
        } else {
          setHistory((prev) => [...prev, entry as unknown as HistoryEntry]);
        }
      } catch {
        const entry: Record<string, unknown> = {
          id: crypto.randomUUID(),
          type: "terminal",
          input: cmd,
          stdout: "",
          stderr: "Command failed - check your connection",
          exitCode: -1,
          executionTime: Date.now() - start,
          timestamp: Date.now(),
          userName,
        };

        if (historyArray && ydoc) {
          ydoc.transact(() => historyArray.push([entry]));
        } else {
          setHistory((prev) => [...prev, entry as unknown as HistoryEntry]);
        }
      } finally {
        setRunningCmd(false);
      }
    },
    [roomId, userName, historyArray, ydoc],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTerminalSubmit(terminalInput);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx =
          cmdHistoryIdx === -1
            ? cmdHistory.length - 1
            : Math.max(0, cmdHistoryIdx - 1);
        setCmdHistoryIdx(newIdx);
        setTerminalInput(cmdHistory[newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdHistoryIdx >= 0) {
        const newIdx = cmdHistoryIdx + 1;
        if (newIdx >= cmdHistory.length) {
          setCmdHistoryIdx(-1);
          setTerminalInput("");
        } else {
          setCmdHistoryIdx(newIdx);
          setTerminalInput(cmdHistory[newIdx]);
        }
      }
    }
  };

  const clearHistory = () => {
    if (historyArray && ydoc) {
      ydoc.transact(() => historyArray.delete(0, historyArray.length));
    }
    setHistory([]);
    lastOutputRef.current = "";
    lastStderrRef.current = "";
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-card"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isRunning || runningCmd
                ? "animate-pulse bg-amber-400"
                : "bg-emerald-400"
            }`}
          />
          <span className="text-xs font-medium text-muted-foreground">
            Terminal
          </span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearHistory();
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-3"
      >
        {history.length === 0 && !isRunning && (
          <span className="text-muted-foreground text-[11px]">
            Run code with Cmd+Enter or type shell commands below
          </span>
        )}

        {history.map((entry) => (
          <HistoryBlock key={entry.id} entry={entry} />
        ))}

        {(isRunning || runningCmd) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-amber-400"
          >
            <svg
              className="h-3 w-3 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Running...</span>
          </motion.div>
        )}
      </div>

      <div className="border-t border-border px-3 py-1.5 flex items-center gap-2">
        <span className="text-emerald-400 text-xs font-mono select-none">$</span>
        <input
          ref={inputRef}
          value={terminalInput}
          onChange={(e) => setTerminalInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={runningCmd}
          placeholder="Type a shell command..."
          className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {runningCmd && (
          <span className="text-[10px] text-amber-400 animate-pulse">running</span>
        )}
      </div>
    </div>
  );
}

function HistoryBlock({ entry }: { entry: HistoryEntry }) {
  const isTerminal = entry.type === "terminal";
  const hasError = entry.stderr && entry.stderr.trim().length > 0;
  const success = entry.exitCode === 0;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {isTerminal ? (
          <span className="text-emerald-400">$</span>
        ) : (
          <span
            className={success ? "text-emerald-400" : hasError ? "text-red-400" : "text-indigo-400"}
          >
            ▶
          </span>
        )}
        <span className="text-foreground/80">
          {isTerminal ? entry.input : "Run code"}
        </span>
        {entry.userName && (
          <span className="text-[10px] text-muted-foreground/50">
            {entry.userName}
          </span>
        )}
        {entry.executionTime != null && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {entry.executionTime}ms
          </span>
        )}
      </div>
      {entry.stdout && (
        <pre className="whitespace-pre-wrap text-foreground/90 pl-4 leading-relaxed">
          {entry.stdout}
        </pre>
      )}
      {hasError && (
        <pre className="whitespace-pre-wrap text-red-400 pl-4 leading-relaxed">
          {entry.stderr}
        </pre>
      )}
    </div>
  );
}

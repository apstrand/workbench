import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Plus, X, Terminal as TerminalIcon } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

interface TerminalSessionInfo {
  id: string;
  name: string;
}

interface TerminalPaneProps {
  currentPath: string;
  onClose: () => void;
}

export default function TerminalPane({ currentPath, onClose }: TerminalPaneProps) {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const nextSessionNumber = useRef(1);
  const terminalsMap = useRef<Record<string, { term: XTerm; fitAddon: FitAddon }>>({});

  // Helper to add a new terminal session
  const addNewSession = () => {
    const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const name = `Terminal ${nextSessionNumber.current++}`;
    const newSession = { id, name };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(id);
  };

  // Helper to close a specific terminal session
  const closeSession = (sessionId: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      setActiveSessionId((currentActive) => {
        if (currentActive === sessionId) {
          const index = prev.findIndex((s) => s.id === sessionId);
          return filtered.length > 0 ? filtered[Math.min(index, filtered.length - 1)].id : null;
        }
        return currentActive;
      });
      return filtered;
    });
  };

  // Spawn default terminal on mount if none exist
  useEffect(() => {
    if (sessions.length === 0) {
      addNewSession();
    }
  }, []);

  // Listen for data and exit events from backend PTY processes globally
  useEffect(() => {
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenData = await listen<{ session_id: string; data: string }>("pty-data", (event) => {
        const { session_id, data } = event.payload;
        const entry = terminalsMap.current[session_id];
        if (entry) {
          entry.term.write(data);
        }
      });

      unlistenExit = await listen<{ session_id: string }>("pty-exit", (event) => {
        const { session_id } = event.payload;
        // Close session on frontend if shell process exits
        setSessions((prev) => {
          const filtered = prev.filter((s) => s.id !== session_id);
          setActiveSessionId((currentActive) => {
            if (currentActive === session_id) {
              const index = prev.findIndex((s) => s.id === session_id);
              return filtered.length > 0 ? filtered[Math.min(index, filtered.length - 1)].id : null;
            }
            return currentActive;
          });
          return filtered;
        });
      });
    };

    setupListeners();

    return () => {
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
    };
  }, []);

  return (
    <div className="terminal-pane">
      {/* Terminal Header */}
      <div className="terminal-header">
        <div className="terminal-tabs">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={`terminal-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveSessionId(session.id)}
              >
                <TerminalIcon className="w-3.5 h-3.5 terminal-tab-icon" />
                <span className="terminal-tab-name">{session.name}</span>
                <button
                  className="terminal-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(session.id);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="terminal-actions">
          <button className="terminal-action-btn" onClick={addNewSession} title="New Terminal">
            <Plus className="w-4 h-4" />
          </button>
          <button className="terminal-action-btn" onClick={onClose} title="Close Panel">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Body Container */}
      <div className="terminal-body">
        {sessions.map((session) => (
          <div
            key={session.id}
            style={{
              display: session.id === activeSessionId ? "block" : "none",
              width: "100%",
              height: "100%",
              overflow: "hidden",
            }}
          >
            <TerminalSession
              sessionId={session.id}
              isActive={session.id === activeSessionId}
              currentPath={currentPath}
              terminalsMap={terminalsMap}
            />
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="terminal-empty">
            <p>No active terminal sessions.</p>
            <button className="save-all-btn" onClick={addNewSession} style={{ padding: "6px 12px" }}>
              New Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalSession({
  sessionId,
  isActive,
  currentPath,
  terminalsMap,
}: {
  sessionId: string;
  isActive: boolean;
  currentPath: string;
  terminalsMap: React.MutableRefObject<Record<string, { term: XTerm; fitAddon: FitAddon }>>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!containerRef.current || initialized.current) return;
    initialized.current = true;

    // Create a new xterm Terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: {
        background: "transparent",
        foreground: "hsl(210, 40%, 98%)",
        cursor: "var(--accent)",
        selectionBackground: "rgba(56, 189, 248, 0.3)",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    terminalsMap.current[sessionId] = { term, fitAddon };

    // Set initial size
    try {
      fitAddon.fit();
    } catch (e) {
      console.warn("Initial xterm fit deferred", e);
    }

    const cols = term.cols || 80;
    const rows = term.rows || 24;

    // Invoke Tauri to spawn native process
    invoke("spawn_pty", {
      sessionId,
      cols,
      rows,
      cwd: currentPath || null,
    }).catch((err) => {
      term.write(`\r\n\x1b[31mFailed to spawn terminal process: ${err}\x1b[0m\r\n`);
    });

    // Write terminal data input to native process PTY
    const dataListener = term.onData((data) => {
      invoke("write_to_pty", { sessionId, data }).catch((err) => {
        console.error("Failed to write to PTY:", err);
      });
    });

    return () => {
      dataListener.dispose();
      term.dispose();
      delete terminalsMap.current[sessionId];
      invoke("close_pty", { sessionId }).catch((err) => {
        console.error("Failed to close PTY on teardown:", err);
      });
    };
  }, [sessionId, currentPath, terminalsMap]);

  // Handle container resize via ResizeObserver
  useEffect(() => {
    if (!containerRef.current || !isActive || !terminalsMap.current[sessionId]) return;

    const { term, fitAddon } = terminalsMap.current[sessionId];

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          const cols = term.cols;
          const rows = term.rows;
          if (cols && rows) {
            invoke("resize_pty", { sessionId, cols, rows }).catch((err) =>
              console.error("Failed to resize PTY:", err)
            );
          }
        } catch (e) {
          // Ignore container layout measurement errors
        }
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [isActive, sessionId, terminalsMap]);

  // Fit and resize when active session becomes focused/active
  useEffect(() => {
    if (isActive && terminalsMap.current[sessionId]) {
      const { term, fitAddon } = terminalsMap.current[sessionId];
      const timer = setTimeout(() => {
        try {
          fitAddon.fit();
          const cols = term.cols;
          const rows = term.rows;
          if (cols && rows) {
            invoke("resize_pty", { sessionId, cols, rows }).catch((err) =>
              console.error("Failed to resize active PTY:", err)
            );
          }
        } catch (e) {
          // Ignore container layout measurement errors
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive, sessionId, terminalsMap]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        padding: "8px",
        boxSizing: "border-box",
        backgroundColor: "var(--bg-tertiary)",
      }}
    />
  );
}

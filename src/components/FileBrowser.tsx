import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FileText,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Pin,
  X,
  Image as ImageIcon,
  Video as VideoIcon,
} from "lucide-react";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface FileBrowserProps {
  currentPath: string;
  setCurrentPath: (path: string) => void;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  width: number;
}

export default function FileBrowser({
  currentPath,
  setCurrentPath,
  selectedFile,
  onSelectFile,
  width,
}: FileBrowserProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyboard navigation focus indexes
  const [focusedWorkspaceIndex, setFocusedWorkspaceIndex] = useState<number>(-1);
  const [focusedEntryIndex, setFocusedEntryIndex] = useState<number>(-1);

  // Persistent workspace pane height percentage (default 25%)
  const [workspaceHeightPercent, setWorkspaceHeightPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tauri-markdown-workspace-ratio");
      return saved ? parseFloat(saved) : 25;
    } catch {
      return 25;
    }
  });

  useEffect(() => {
    localStorage.setItem("tauri-markdown-workspace-ratio", String(workspaceHeightPercent));
  }, [workspaceHeightPercent]);

  // Drag resizing for workspace section height
  const startSectionResize = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const sidebarElement = mouseDownEvent.currentTarget.parentElement;
    if (!sidebarElement) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rect = sidebarElement.getBoundingClientRect();
      const relativeY = moveEvent.clientY - rect.top;
      const percent = Math.max(15, Math.min(80, (relativeY / rect.height) * 100));
      setWorkspaceHeightPercent(percent);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Initialize pinned workspaces state from localStorage
  const [pinnedWorkspaces, setPinnedWorkspaces] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tauri-markdown-workspaces");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist workspaces in localStorage
  useEffect(() => {
    localStorage.setItem("tauri-markdown-workspaces", JSON.stringify(pinnedWorkspaces));
  }, [pinnedWorkspaces]);

  // Reset focus index when directories change
  useEffect(() => {
    setFocusedEntryIndex(-1);
  }, [entries]);

  // Reset workspace focus index on changes
  useEffect(() => {
    setFocusedWorkspaceIndex(-1);
  }, [pinnedWorkspaces]);

  // Scroll focused entry into view
  useEffect(() => {
    if (focusedEntryIndex >= 0) {
      const el = document.querySelector(`.folders .file-item:nth-child(${focusedEntryIndex + 1})`);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedEntryIndex]);

  // Scroll focused workspace folder into view
  useEffect(() => {
    if (focusedWorkspaceIndex >= 0) {
      const el = document.querySelector(`.workspace .workspace-item:nth-child(${focusedWorkspaceIndex + 1})`);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedWorkspaceIndex]);

  // Initialize path to home directory if empty
  useEffect(() => {
    if (!currentPath) {
      setLoading(true);
      invoke<string>("get_home_dir")
        .then((home) => {
          setCurrentPath(home);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    }
  }, [currentPath, setCurrentPath]);

  // Load directory contents when current path changes
  useEffect(() => {
    if (!currentPath) return;

    let active = true;
    setLoading(true);
    setError(null);

    invoke<FileEntry[]>("list_directory", { path: currentPath })
      .then((data) => {
        if (active) {
          setEntries(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPath]);

  // Go to parent directory
  const handleGoUp = () => {
    if (!currentPath) return;
    const isWindows = currentPath.includes("\\");
    const separator = isWindows ? "\\" : "/";
    const parts = currentPath.split(separator);
    
    if (parts.length > 1) {
      if (parts[parts.length - 1] === "") {
        parts.pop();
      }
      parts.pop();
      
      let parent = parts.join(separator);
      if (parent === "" && !isWindows) {
        parent = "/";
      }
      if (isWindows && parent.endsWith(":")) {
        parent = parent + "\\";
      }
      
      setCurrentPath(parent || separator);
    }
  };

  // Determine if we can go up further
  const canGoUp = () => {
    if (!currentPath) return false;
    const isWindows = currentPath.includes("\\");
    if (isWindows) {
      return currentPath.split("\\").filter(Boolean).length > 1;
    } else {
      return currentPath !== "/";
    }
  };

  // Extract folder name from absolute path
  const getFolderName = (path: string) => {
    const isWindows = path.includes("\\");
    const separator = isWindows ? "\\" : "/";
    if (path === "/" || (isWindows && path.endsWith(":\\"))) {
      return path;
    }
    const parts = path.split(separator).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : path;
  };

  // Pin a folder
  const handlePin = (path: string) => {
    if (!pinnedWorkspaces.includes(path)) {
      setPinnedWorkspaces([...pinnedWorkspaces, path]);
    }
  };

  // Unpin a folder
  const handleUnpin = (path: string) => {
    setPinnedWorkspaces(pinnedWorkspaces.filter((p) => p !== path));
  };

  // Keyboard navigation for folders list
  const handleFoldersKeyDown = (e: React.KeyboardEvent) => {
    if (entries.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedEntryIndex((prev) => (prev < entries.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedEntryIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const index = focusedEntryIndex >= 0 ? focusedEntryIndex : 0;
      if (index >= 0 && index < entries.length) {
        const entry = entries[index];
        const isMarkdown = entry.name.toLowerCase().endsWith(".md");
        const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(entry.name);
        const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/i.test(entry.name);
        const isSelectable = isMarkdown || isImage || isVideo;
        
        if (entry.is_dir) {
          setCurrentPath(entry.path);
        } else if (isSelectable) {
          onSelectFile(entry.path);
        }
      }
    }
  };

  // Keyboard navigation for workspaces list
  const handleWorkspaceKeyDown = (e: React.KeyboardEvent) => {
    if (pinnedWorkspaces.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedWorkspaceIndex((prev) => (prev < pinnedWorkspaces.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedWorkspaceIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const index = focusedWorkspaceIndex >= 0 ? focusedWorkspaceIndex : 0;
      if (index >= 0 && index < pinnedWorkspaces.length) {
        setCurrentPath(pinnedWorkspaces[index]);
      }
    }
  };

  return (
    <div
      className="sidebar"
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
      }}
    >
      <div className="sidebar-header">
        <Folder className="w-4 h-4 text-accent" />
        <span>Workspace Hub</span>
      </div>

      {/* Workspaces Section (Upper Sidebar Pane) */}
      <div
        className="sidebar-section workspace"
        style={{
          height: `${workspaceHeightPercent}%`,
          flex: "none",
        }}
      >
        <div className="sidebar-subheader">
          <span className="sidebar-section-title">
            <Pin className="w-3.5 h-3.5 text-accent" style={{ transform: "rotate(45deg)" }} />
            <span>Workspaces</span>
          </span>
        </div>
        <div className="sidebar-scroll-content">
          {pinnedWorkspaces.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)", opacity: 0.7 }}>
              No pinned workspace folders.
            </div>
          ) : (
            <div
              className="workspace-list"
              tabIndex={0}
              onKeyDown={handleWorkspaceKeyDown}
              onFocus={() => {
                if (focusedWorkspaceIndex === -1) setFocusedWorkspaceIndex(0);
              }}
              onBlur={() => setFocusedWorkspaceIndex(-1)}
            >
              {pinnedWorkspaces.map((path, index) => {
                const isFocused = focusedWorkspaceIndex === index;
                return (
                  <div
                    key={path}
                    className={`workspace-item ${isFocused ? "keyboard-focused" : ""}`}
                    onClick={() => setCurrentPath(path)}
                    title={path}
                  >
                    <div className="workspace-item-info">
                      <Folder style={{ width: "15px", height: "15px", fill: "var(--accent-soft)", color: "var(--accent)" }} />
                      <div className="workspace-item-text">
                        <span className="workspace-item-name">{getFolderName(path)}</span>
                        <span className="workspace-item-path">{path}</span>
                      </div>
                    </div>
                    <div className="workspace-item-actions">
                      <button
                        className="workspace-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnpin(path);
                        }}
                        title="Unpin folder"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Drag Resizer divider */}
      <div className="section-resizer" onMouseDown={startSectionResize} />

      {/* Folders Section (Lower Sidebar Pane) */}
      <div className="sidebar-section folders">
        <div className="sidebar-subheader">
          <span className="sidebar-section-title">
            <Folder className="w-3.5 h-3.5 text-secondary" />
            <span>Folders</span>
          </span>
          {currentPath && (
            <button
              className="file-action-btn"
              onClick={() => {
                if (pinnedWorkspaces.includes(currentPath)) {
                  handleUnpin(currentPath);
                } else {
                  handlePin(currentPath);
                }
              }}
              title={pinnedWorkspaces.includes(currentPath) ? "Unpin current folder" : "Pin current folder"}
              style={{ opacity: 0.8 }}
            >
              <Pin
                className={`w-3.5 h-3.5 ${pinnedWorkspaces.includes(currentPath) ? "pinned text-accent fill-accent" : ""}`}
                style={{
                  transform: pinnedWorkspaces.includes(currentPath) ? "none" : "rotate(45deg)",
                }}
              />
            </button>
          )}
        </div>
        <div className="sidebar-scroll-content">
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            <button
              className="nav-button"
              onClick={handleGoUp}
              disabled={!canGoUp() || loading}
              title="Go Up"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="path-bar" title={currentPath}>
              {currentPath || "Loading path..."}
            </div>
          </div>

          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
              <Loader2 className="w-6 h-6 animate-spin text-secondary" style={{ opacity: 0.6 }} />
            </div>
          )}

          {error && (
            <div style={{ padding: "12px", display: "flex", gap: "8px", color: "hsl(0, 84%, 60%)", fontSize: "12px", background: "hsl(0, 84%, 97%)", borderRadius: "6px", border: "1px solid hsl(0, 84%, 90%)" }}>
              <AlertCircle className="w-4 h-4 min-w-[16px]" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <div
              className="file-list"
              tabIndex={0}
              onKeyDown={handleFoldersKeyDown}
              onFocus={() => {
                if (focusedEntryIndex === -1) setFocusedEntryIndex(0);
              }}
              onBlur={() => setFocusedEntryIndex(-1)}
            >
              {entries.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Empty Directory
                </div>
              ) : (
                entries.map((entry, index) => {
                  const isMarkdown = entry.name.toLowerCase().endsWith(".md");
                  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(entry.name);
                  const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/i.test(entry.name);
                  const isSelectable = isMarkdown || isImage || isVideo;
                  
                  const isSelected = selectedFile === entry.path;
                  const isPinned = pinnedWorkspaces.includes(entry.path);
                  const isFocused = focusedEntryIndex === index;
                  
                  return (
                    <div
                      key={entry.path}
                      className={`file-item ${isSelected ? "selected" : ""} ${isFocused ? "keyboard-focused" : ""}`}
                      onClick={() => {
                        if (entry.is_dir) {
                          setCurrentPath(entry.path);
                        } else if (isSelectable) {
                          onSelectFile(entry.path);
                        }
                      }}
                      style={{
                        opacity: !entry.is_dir && !isSelectable ? 0.45 : 1,
                        cursor: !entry.is_dir && !isSelectable ? "default" : "pointer",
                      }}
                    >
                      <span className="file-item-icon">
                        {entry.is_dir ? (
                          <Folder style={{ width: "16px", height: "16px", fill: "var(--text-secondary)", opacity: 0.8 }} />
                        ) : isImage ? (
                          <ImageIcon style={{ width: "16px", height: "16px" }} />
                        ) : isVideo ? (
                          <VideoIcon style={{ width: "16px", height: "16px" }} />
                        ) : (
                          <FileText style={{ width: "16px", height: "16px" }} />
                        )}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flexGrow: 1,
                        }}
                      >
                        {entry.name}
                      </span>

                      {entry.is_dir && (
                        <div className="file-item-actions">
                          <button
                            className={`file-action-btn ${isPinned ? "pinned" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPinned) {
                                handleUnpin(entry.path);
                              } else {
                                handlePin(entry.path);
                              }
                            }}
                            title={isPinned ? "Remove from Workspaces" : "Pin to Workspaces"}
                          >
                            <Pin
                              className="w-3.5 h-3.5"
                              style={{
                                transform: isPinned ? "none" : "rotate(45deg)",
                              }}
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

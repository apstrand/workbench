import { useEffect, useState, useRef } from "react";
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

  const sidebarRef = useRef<HTMLDivElement>(null);

  // Active section tracking: "workspace" or "folders"
  const [activeSection, setActiveSection] = useState<"workspace" | "folders">("folders");
  const [focusedWorkspaceIndex, setFocusedWorkspaceIndex] = useState<number>(0);
  const [focusedEntryIndex, setFocusedEntryIndex] = useState<number>(0);

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

  // Focus sidebar on mount
  useEffect(() => {
    sidebarRef.current?.focus();
  }, []);

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

  // Sync folders focus bounds when entries change
  useEffect(() => {
    if (entries.length === 0) {
      setFocusedEntryIndex(-1);
      if (activeSection === "folders" && pinnedWorkspaces.length > 0) {
        setActiveSection("workspace");
        setFocusedWorkspaceIndex(pinnedWorkspaces.length - 1);
      }
    } else {
      if (focusedEntryIndex < 0 || focusedEntryIndex >= entries.length) {
        setFocusedEntryIndex(0);
      }
    }
  }, [entries, activeSection, pinnedWorkspaces.length]);

  // Sync workspaces focus bounds when pinned folders change
  useEffect(() => {
    if (pinnedWorkspaces.length === 0) {
      setFocusedWorkspaceIndex(-1);
      if (activeSection === "workspace") {
        setActiveSection("folders");
        setFocusedEntryIndex(0);
      }
    } else {
      if (focusedWorkspaceIndex < 0 || focusedWorkspaceIndex >= pinnedWorkspaces.length) {
        setFocusedWorkspaceIndex(0);
      }
    }
  }, [pinnedWorkspaces, activeSection]);

  // Sync folders focus index with selectedFile when entries or selectedFile changes
  useEffect(() => {
    if (selectedFile && entries.length > 0) {
      const index = entries.findIndex((entry) => entry.path === selectedFile);
      if (index !== -1) {
        setFocusedEntryIndex(index);
        setActiveSection("folders");
      }
    }
  }, [selectedFile, entries]);

  // Scroll focused entry or workspace folder into view
  useEffect(() => {
    const el = sidebarRef.current?.querySelector(".keyboard-focused");
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [focusedEntryIndex, focusedWorkspaceIndex, activeSection]);

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

  // Central keyboard navigation for the entire sidebar
  const handleSidebarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (canGoUp() && !loading) {
        handleGoUp();
      }
      return;
    }

    if (activeSection === "workspace") {
      if (pinnedWorkspaces.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (focusedWorkspaceIndex < pinnedWorkspaces.length - 1) {
          setFocusedWorkspaceIndex((prev) => prev + 1);
        } else if (entries.length > 0) {
          setActiveSection("folders");
          setFocusedEntryIndex(0);
        }
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
    } else if (activeSection === "folders") {
      if (entries.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedEntryIndex((prev) => (prev < entries.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (focusedEntryIndex > 0) {
          setFocusedEntryIndex((prev) => prev - 1);
        } else if (pinnedWorkspaces.length > 0) {
          setActiveSection("workspace");
          setFocusedWorkspaceIndex(pinnedWorkspaces.length - 1);
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const index = focusedEntryIndex >= 0 ? focusedEntryIndex : 0;
        if (index >= 0 && index < entries.length) {
          const entry = entries[index];
          const isMarkdown = entry.name.toLowerCase().endsWith(".md") || entry.name.toLowerCase().endsWith(".qmd");
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
    }
  };

  return (
    <div
      ref={sidebarRef}
      className="sidebar"
      tabIndex={0}
      onKeyDown={handleSidebarKeyDown}
      onClick={() => sidebarRef.current?.focus()}
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        outline: "none", // Prevent default blue focus outline on sidebar
      }}
    >
      <div className="sidebar-header">
        <Folder className="w-4 h-4 text-accent" />
        <span>Workspace Hub</span>
      </div>

      {/* Workspaces Section (Upper Sidebar Pane) */}
      <div
        className="sidebar-section workspace"
        onClick={() => {
          setActiveSection("workspace");
        }}
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
            <div className="workspace-list">
              {pinnedWorkspaces.map((path, index) => {
                const isFocused = activeSection === "workspace" && focusedWorkspaceIndex === index;
                return (
                  <div
                    key={path}
                    className={`workspace-item ${isFocused ? "keyboard-focused" : ""}`}
                    onClick={() => {
                      setActiveSection("workspace");
                      setFocusedWorkspaceIndex(index);
                      setCurrentPath(path);
                    }}
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
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnpin(path);
                          sidebarRef.current?.focus();
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
      <div
        className="sidebar-section folders"
        onClick={() => {
          setActiveSection("folders");
        }}
      >
        <div className="sidebar-subheader">
          <span className="sidebar-section-title">
            <Folder className="w-3.5 h-3.5 text-secondary" />
            <span>Folders</span>
          </span>
          {currentPath && (
            <button
              className="file-action-btn"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (pinnedWorkspaces.includes(currentPath)) {
                  handleUnpin(currentPath);
                } else {
                  handlePin(currentPath);
                }
                sidebarRef.current?.focus();
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
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                handleGoUp();
                sidebarRef.current?.focus();
              }}
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
            <div className="file-list">
              {entries.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Empty Directory
                </div>
              ) : (
                entries.map((entry, index) => {
                  const isMarkdown = entry.name.toLowerCase().endsWith(".md") || entry.name.toLowerCase().endsWith(".qmd");
                  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(entry.name);
                  const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/i.test(entry.name);
                  const isSelectable = isMarkdown || isImage || isVideo;
                  
                  const isSelected = selectedFile === entry.path;
                  const isPinned = pinnedWorkspaces.includes(entry.path);
                  const isFocused = activeSection === "folders" && focusedEntryIndex === index;
                  
                  return (
                    <div
                      key={entry.path}
                      className={`file-item ${isSelected ? "selected" : ""} ${isFocused ? "keyboard-focused" : ""}`}
                      onClick={() => {
                        setActiveSection("folders");
                        setFocusedEntryIndex(index);
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
                            tabIndex={-1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPinned) {
                                handleUnpin(entry.path);
                              } else {
                                handlePin(entry.path);
                              }
                              sidebarRef.current?.focus();
                            }}
                            title={isPinned ? "Remove from Workspaces" : "Pin to Workspaces"}
                          >
                            <Pin
                              className="w-3.5 h-3.5"
                              style={{
                                transform: isPinned ? "none" : "rotate(45deg)",
                                fill: isPinned ? "var(--accent)" : "none",
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

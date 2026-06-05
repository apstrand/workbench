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
  Terminal as TerminalIcon,
  FolderTree,
  List,
} from "lucide-react";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface PinnedItem {
  path: string;
  isDir: boolean;
}

interface FileBrowserProps {
  currentPath: string;
  setCurrentPath: (path: string) => void;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  width: number;
  pinnedWorkspaces: PinnedItem[];
  setPinnedWorkspaces: (items: PinnedItem[]) => void;
  sortedPinned: PinnedItem[];
  viewMode: "list" | "tree";
  setViewMode: (mode: "list" | "tree") => void;
}

export default function FileBrowser({
  currentPath,
  setCurrentPath,
  selectedFile,
  onSelectFile,
  width,
  pinnedWorkspaces,
  setPinnedWorkspaces,
  sortedPinned,
  viewMode,
  setViewMode,
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

  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [treeEntries, setTreeEntries] = useState<Record<string, FileEntry[]>>({});
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(0);
  const [treeRootPath, setTreeRootPath] = useState<string>(currentPath || "/");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global / key binding to focus search input
  useEffect(() => {
    const handleGlobalSlash = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) {
        const proseMirror = document.activeElement?.closest(".ProseMirror");
        if (!proseMirror) {
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalSlash);
    return () => window.removeEventListener("keydown", handleGlobalSlash);
  }, []);

  // Directory recursive search invoke
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const root = viewMode === "tree" ? treeRootPath : currentPath;
        const res = await invoke<FileEntry[]>("search_directory", { path: root, query: searchQuery });
        setSearchResults(res);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, viewMode, treeRootPath, currentPath]);

  // Sync treeRootPath when currentPath is set and treeRootPath is still "/"
  useEffect(() => {
    if (currentPath && treeRootPath === "/") {
      setTreeRootPath(currentPath);
    }
  }, [currentPath]);

  // Load subdirectory entries for Tree View
  const loadTreeDirectory = async (path: string) => {
    if (treeEntries[path]) return; // already loaded
    try {
      const res = await invoke<FileEntry[]>("list_directory", { path });
      setTreeEntries((prev) => ({
        ...prev,
        [path]: res,
      }));
    } catch (err) {
      console.error(`Error loading tree directory ${path}:`, err);
    }
  };

  // Sync root directory loading when treeRootPath changes
  useEffect(() => {
    if (treeRootPath) {
      loadTreeDirectory(treeRootPath);
    }
  }, [treeRootPath]);

  // Toggle expansion of a folder path
  const toggleExpand = async (path: string) => {
    const isExpanding = !expandedPaths[path];
    setExpandedPaths((prev) => ({
      ...prev,
      [path]: isExpanding,
    }));
    if (isExpanding) {
      await loadTreeDirectory(path);
    }
  };

  interface FlatTreeNode {
    path: string;
    name: string;
    isDir: boolean;
    depth: number;
    parentPath: string | null;
  }

  const getFlatTreeNodes = (): FlatTreeNode[] => {
    const nodes: FlatTreeNode[] = [];
    const traverse = (path: string, depth: number) => {
      const entries = treeEntries[path] || [];
      for (const entry of entries) {
        nodes.push({
          path: entry.path,
          name: entry.name,
          isDir: entry.is_dir,
          depth,
          parentPath: path,
        });
        if (entry.is_dir && expandedPaths[entry.path]) {
          traverse(entry.path, depth + 1);
        }
      }
    };
    traverse(treeRootPath, 0);
    return nodes;
  };

  const flatNodes = getFlatTreeNodes();

  // Sync folders focus bounds when entries change
  useEffect(() => {
    if (viewMode === "tree") {
      if (flatNodes.length === 0) {
        setFocusedNodeIndex(-1);
        if (activeSection === "folders" && sortedPinned.length > 0) {
          setActiveSection("workspace");
          setFocusedWorkspaceIndex(sortedPinned.length - 1);
        }
      } else {
        if (focusedNodeIndex < 0 || focusedNodeIndex >= flatNodes.length) {
          setFocusedNodeIndex(0);
        }
      }
    } else {
      if (entries.length === 0) {
        setFocusedEntryIndex(-1);
        if (activeSection === "folders" && sortedPinned.length > 0) {
          setActiveSection("workspace");
          setFocusedWorkspaceIndex(sortedPinned.length - 1);
        }
      } else {
        if (focusedEntryIndex < 0 || focusedEntryIndex >= entries.length) {
          setFocusedEntryIndex(0);
        }
      }
    }
  }, [entries, activeSection, sortedPinned.length, flatNodes.length, viewMode]);

  // Sync workspaces focus bounds when pinned items change
  useEffect(() => {
    if (sortedPinned.length === 0) {
      setFocusedWorkspaceIndex(-1);
      if (activeSection === "workspace") {
        setActiveSection("folders");
        if (viewMode === "tree") {
          setFocusedNodeIndex(0);
        } else {
          setFocusedEntryIndex(0);
        }
      }
    } else {
      if (focusedWorkspaceIndex < 0 || focusedWorkspaceIndex >= sortedPinned.length) {
        setFocusedWorkspaceIndex(0);
      }
    }
  }, [sortedPinned, activeSection, viewMode]);

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

  // Sync folders focus index with selectedFile in tree mode
  useEffect(() => {
    if (viewMode === "tree" && selectedFile && flatNodes.length > 0) {
      const index = flatNodes.findIndex((node) => node.path === selectedFile);
      if (index !== -1) {
        setFocusedNodeIndex(index);
        setActiveSection("folders");
      }
    }
  }, [selectedFile, flatNodes.length, viewMode]);

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

  // Pin a folder or file
  const handlePin = (path: string, isDir: boolean) => {
    if (!pinnedWorkspaces.some((p) => p.path === path)) {
      setPinnedWorkspaces([...pinnedWorkspaces, { path, isDir }]);
    }
  };

  // Unpin a folder or file
  const handleUnpin = (path: string) => {
    setPinnedWorkspaces(pinnedWorkspaces.filter((p) => p.path !== path));
  };

  // Open terminal at path
  const handleOpenTerminal = () => {
    if (!currentPath) return;
    invoke("open_terminal", { path: currentPath })
      .catch((err) => alert(`Error opening terminal: ${err}`));
    sidebarRef.current?.focus();
  };

  // Central keyboard navigation for the entire sidebar
  const handleSidebarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (viewMode === "list" && canGoUp() && !loading) {
        handleGoUp();
      }
      return;
    }

    if (activeSection === "workspace") {
      if (sortedPinned.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (focusedWorkspaceIndex < sortedPinned.length - 1) {
          setFocusedWorkspaceIndex((prev) => prev + 1);
        } else if (viewMode === "tree" ? flatNodes.length > 0 : entries.length > 0) {
          setActiveSection("folders");
          if (viewMode === "tree") {
            setFocusedNodeIndex(0);
          } else {
            setFocusedEntryIndex(0);
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedWorkspaceIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const index = focusedWorkspaceIndex >= 0 ? focusedWorkspaceIndex : 0;
        if (index >= 0 && index < sortedPinned.length) {
          const item = sortedPinned[index];
          if (item.isDir) {
            setCurrentPath(item.path);
            if (viewMode === "tree") {
              setTreeRootPath(item.path);
            }
          } else {
            onSelectFile(item.path);
          }
        }
      }
    } else if (activeSection === "folders") {
      if (viewMode === "tree") {
        if (flatNodes.length === 0) return;

        const node = flatNodes[focusedNodeIndex >= 0 ? focusedNodeIndex : 0];

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedNodeIndex((prev) => (prev < flatNodes.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (focusedNodeIndex > 0) {
            setFocusedNodeIndex((prev) => prev - 1);
          } else if (sortedPinned.length > 0) {
            setActiveSection("workspace");
            setFocusedWorkspaceIndex(sortedPinned.length - 1);
          }
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          if (node && node.isDir && !expandedPaths[node.path]) {
            toggleExpand(node.path);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (node) {
            if (node.isDir && expandedPaths[node.path]) {
              toggleExpand(node.path);
            } else if (node.parentPath) {
              const pIdx = flatNodes.findIndex(n => n.path === node.parentPath);
              if (pIdx !== -1) {
                setFocusedNodeIndex(pIdx);
              }
            }
          }
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (node) {
            if (node.isDir) {
              toggleExpand(node.path);
            } else {
              onSelectFile(node.path);
            }
          }
        }
      } else {
        if (entries.length === 0) return;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedEntryIndex((prev) => (prev < entries.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (focusedEntryIndex > 0) {
            setFocusedEntryIndex((prev) => prev - 1);
          } else if (sortedPinned.length > 0) {
            setActiveSection("workspace");
            setFocusedWorkspaceIndex(sortedPinned.length - 1);
          }
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const index = focusedEntryIndex >= 0 ? focusedEntryIndex : 0;
          if (index >= 0 && index < entries.length) {
            const entry = entries[index];
            const isSelectable = !entry.is_dir;
            
            if (entry.is_dir) {
              setCurrentPath(entry.path);
            } else if (isSelectable) {
              onSelectFile(entry.path);
            }
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
            <Pin className="w-3.5 h-3.5 text-accent" />
            <span>Workspaces</span>
          </span>
        </div>
        <div className="sidebar-scroll-content">
          {sortedPinned.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)", opacity: 0.7 }}>
              No pinned workspaces.
            </div>
          ) : (
            <div className="workspace-list">
              {sortedPinned.map((item, index) => {
                const isFocused = activeSection === "workspace" && focusedWorkspaceIndex === index;
                return (
                  <div
                    key={item.path}
                    className={`workspace-item ${isFocused ? "keyboard-focused" : ""}`}
                    onClick={() => {
                      setActiveSection("workspace");
                      setFocusedWorkspaceIndex(index);
                      if (item.isDir) {
                        setCurrentPath(item.path);
                        if (viewMode === "tree") {
                          setTreeRootPath(item.path);
                        }
                      } else {
                        onSelectFile(item.path);
                      }
                    }}
                    title={item.path}
                  >
                    <div className="workspace-item-info">
                      {item.isDir ? (
                        <Folder style={{ width: "15px", height: "15px", fill: "var(--accent-soft)", color: "var(--accent)" }} />
                      ) : (
                        <FileText style={{ width: "15px", height: "15px", color: "var(--text-secondary)" }} />
                      )}
                      <div className="workspace-item-text">
                        <span className="workspace-item-name">{getFolderName(item.path)}</span>
                        <span className="workspace-item-path">{item.path}</span>
                      </div>
                    </div>
                    <div className="workspace-item-actions">
                      <button
                        className="workspace-action-btn"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnpin(item.path);
                          sidebarRef.current?.focus();
                        }}
                        title={item.isDir ? "Unpin folder" : "Unpin file"}
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
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className={`file-action-btn ${viewMode === "tree" ? "active text-accent" : ""}`}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const nextMode = viewMode === "list" ? "tree" : "list";
                  setViewMode(nextMode);
                  if (nextMode === "tree" && currentPath) {
                    setTreeRootPath(currentPath);
                  }
                  sidebarRef.current?.focus();
                }}
                title={viewMode === "list" ? "Switch to Tree View" : "Switch to List View"}
                style={{ opacity: 0.8 }}
              >
                {viewMode === "list" ? <FolderTree className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              </button>
              <button
                className="file-action-btn"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleOpenTerminal}
                title="Open terminal in this folder"
                style={{ opacity: 0.8 }}
              >
                <TerminalIcon className="w-3.5 h-3.5" />
              </button>
              {viewMode === "list" && (
                <button
                  className="file-action-btn"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const isCurrentPinned = pinnedWorkspaces.some((p) => p.path === currentPath);
                    if (isCurrentPinned) {
                      handleUnpin(currentPath);
                    } else {
                      handlePin(currentPath, true);
                    }
                    sidebarRef.current?.focus();
                  }}
                  title={pinnedWorkspaces.some((p) => p.path === currentPath) ? "Unpin current folder" : "Pin current folder"}
                  style={{ opacity: 0.8 }}
                >
                  <Pin
                    className={`w-3.5 h-3.5 ${pinnedWorkspaces.some((p) => p.path === currentPath) ? "pinned text-accent fill-accent" : ""}`}
                    style={{
                      fill: pinnedWorkspaces.some((p) => p.path === currentPath) ? "var(--accent)" : "none",
                    }}
                  />
                </button>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "0 12px 8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", padding: "4px 8px", border: "1px solid var(--border)" }}>
            <span style={{ fontSize: "12px", opacity: 0.6 }}>🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search files... (Press /)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  searchInputRef.current?.blur();
                  sidebarRef.current?.focus();
                }
              }}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: "12px",
                width: "100%",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  sidebarRef.current?.focus();
                }}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: "var(--text-secondary)" }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <div className="sidebar-scroll-content">
          {viewMode === "list" && (
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
          )}

          {viewMode === "tree" && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
              <div className="path-bar" title={treeRootPath} style={{ flexGrow: 1, fontSize: "11px", opacity: 0.8 }}>
                🌳 {treeRootPath}
              </div>
            </div>
          )}

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

          {!loading && !error && searchQuery && (
            <div className="file-list">
              {isSearching ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  No results found
                </div>
              ) : (
                searchResults.map((entry) => {
                  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(entry.name);
                  const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/i.test(entry.name);
                  const isSelectable = !entry.is_dir;
                  const isSelected = selectedFile === entry.path;
                  const isPinned = pinnedWorkspaces.some((p) => p.path === entry.path);
                  
                  const root = viewMode === "tree" ? treeRootPath : currentPath;
                  const relPath = entry.path.startsWith(root)
                    ? entry.path.substring(root.length).replace(/^[/\\]/, "")
                    : entry.path;

                  return (
                    <div
                      key={entry.path}
                      className={`file-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setActiveSection("folders");
                        if (entry.is_dir) {
                          setSearchQuery("");
                          setCurrentPath(entry.path);
                          if (viewMode === "tree") {
                            setTreeRootPath(entry.path);
                          }
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
                      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, overflow: "hidden" }}>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: 500,
                          }}
                        >
                          {entry.name}
                        </span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "10px",
                            opacity: 0.6,
                          }}
                        >
                          {relPath || entry.path}
                        </span>
                      </div>

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
                              handlePin(entry.path, entry.is_dir);
                            }
                            sidebarRef.current?.focus();
                          }}
                          title={isPinned ? "Remove from Workspaces" : "Pin to Workspaces"}
                        >
                          <Pin
                            className="w-3.5 h-3.5"
                            style={{
                              fill: isPinned ? "var(--accent)" : "none",
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {!loading && !error && !searchQuery && viewMode === "list" && (
            <div className="file-list">
              {entries.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Empty Directory
                </div>
              ) : (
                entries.map((entry, index) => {
                  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(entry.name);
                  const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/i.test(entry.name);
                  const isSelectable = !entry.is_dir;
                  
                  const isSelected = selectedFile === entry.path;
                  const isPinned = pinnedWorkspaces.some((p) => p.path === entry.path);
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
                              handlePin(entry.path, entry.is_dir);
                            }
                            sidebarRef.current?.focus();
                          }}
                          title={isPinned ? "Remove from Workspaces" : "Pin to Workspaces"}
                        >
                          <Pin
                            className="w-3.5 h-3.5"
                            style={{
                              fill: isPinned ? "var(--accent)" : "none",
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {!loading && !error && !searchQuery && viewMode === "tree" && (
            <div className="file-list">
              {flatNodes.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Empty Workspace
                </div>
              ) : (
                flatNodes.map((node, index) => {
                  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(node.name);
                  const isVideo = /\.(mp4|webm|ogg|mov|mkv)$/i.test(node.name);
                  const isSelected = selectedFile === node.path;
                  const isPinned = pinnedWorkspaces.some((p) => p.path === node.path);
                  const isFocused = activeSection === "folders" && focusedNodeIndex === index;
                  const isExpanded = expandedPaths[node.path];

                  return (
                    <div
                      key={node.path}
                      className={`file-item ${isSelected ? "selected" : ""} ${isFocused ? "keyboard-focused" : ""}`}
                      onClick={() => {
                        setActiveSection("folders");
                        setFocusedNodeIndex(index);
                        if (node.isDir) {
                          toggleExpand(node.path);
                        } else {
                          onSelectFile(node.path);
                        }
                      }}
                      style={{
                        paddingLeft: `${node.depth * 12 + 8}px`,
                        cursor: "pointer",
                      }}
                    >
                      <span className="file-item-icon" style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        {node.isDir && (
                          <span style={{ fontSize: "10px", width: "10px", display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}>
                            ▶
                          </span>
                        )}
                        {node.isDir ? (
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
                        {node.name}
                      </span>

                      <div className="file-item-actions">
                        <button
                          className={`file-action-btn ${isPinned ? "pinned" : ""}`}
                          tabIndex={-1}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPinned) {
                              handleUnpin(node.path);
                            } else {
                              handlePin(node.path, node.isDir);
                            }
                            sidebarRef.current?.focus();
                          }}
                          title={isPinned ? "Remove from Workspaces" : "Pin to Workspaces"}
                        >
                          <Pin
                            className="w-3.5 h-3.5"
                            style={{
                              fill: isPinned ? "var(--accent)" : "none",
                            }}
                          />
                        </button>
                      </div>
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

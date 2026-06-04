import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import FileBrowser from "./components/FileBrowser";
import MarkdownEditor from "./components/MarkdownEditor";
import MediaViewer from "./components/MediaViewer";
import { FileCode, Loader2, X, AlertCircle } from "lucide-react";

export default function App() {
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // Persistent sidebar width state
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tauri-markdown-sidebar-width");
      return saved ? parseInt(saved, 10) : 260;
    } catch {
      return 260;
    }
  });

  useEffect(() => {
    localStorage.setItem("tauri-markdown-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  // Handle drag resizing for the sidebar
  const startSidebarResize = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(450, moveEvent.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Check if a file is an image or video
  const isMediaFile = (path: string) => {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico|mp4|webm|ogg|mov|mkv)$/i.test(path);
  };

  // Load a file's content from local disk
  const handleSelectFile = async (filePath: string) => {
    setFileError(null);

    // Automatically sync parent folder view
    const isWindows = filePath.includes("\\");
    const separator = isWindows ? "\\" : "/";
    const lastSep = filePath.lastIndexOf(separator);
    if (lastSep !== -1) {
      const parentDir = filePath.substring(0, lastSep);
      setCurrentPath(parentDir);
    }

    // Add to open tabs list
    if (!openTabs.includes(filePath)) {
      setOpenTabs([...openTabs, filePath]);
    }

    if (isMediaFile(filePath)) {
      setSelectedFile(filePath);
      setFileContent("");
      return;
    }

    setIsLoadingFile(true);
    try {
      const content = await invoke<string>("read_file_content", { path: filePath });
      setFileContent(content);
      setSelectedFile(filePath);
    } catch (err) {
      setFileError(String(err));
      setSelectedFile(filePath);
      setFileContent("");
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Close tab and cycle active tab selection
  const handleCloseTab = (pathToRemove: string) => {
    const updatedTabs = openTabs.filter((t) => t !== pathToRemove);
    setOpenTabs(updatedTabs);

    if (selectedFile === pathToRemove) {
      if (updatedTabs.length > 0) {
        const index = openTabs.indexOf(pathToRemove);
        const nextIndex = Math.min(index, updatedTabs.length - 1);
        handleSelectFile(updatedTabs[nextIndex]);
      } else {
        setSelectedFile(null);
        setFileError(null);
      }
    }
  };

  // Get filename from absolute path
  const getFileName = (path: string) => {
    const isWindows = path.includes("\\");
    const separator = isWindows ? "\\" : "/";
    return path.substring(path.lastIndexOf(separator) + 1);
  };

  // Write content back to the local file
  const handleSaveFile = async (content: string) => {
    if (!selectedFile) return;
    try {
      await invoke("write_file_content", {
        path: selectedFile,
        content,
      });
      setFileContent(content);
    } catch (err) {
      alert(`Error saving file: ${err}`);
      throw err;
    }
  };

  // Keyboard shortcuts Cmd+Shift+[ and Cmd+Shift+] to change tabs
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdShift = (e.metaKey || e.ctrlKey) && e.shiftKey;
      if (!isCmdShift) return;

      if (e.key === "[" || e.key === "{" || e.code === "BracketLeft") {
        e.preventDefault();
        if (openTabs.length > 1 && selectedFile) {
          const idx = openTabs.indexOf(selectedFile);
          if (idx !== -1) {
            const prevIdx = (idx - 1 + openTabs.length) % openTabs.length;
            handleSelectFile(openTabs[prevIdx]);
          }
        }
      } else if (e.key === "]" || e.key === "}" || e.code === "BracketRight") {
        e.preventDefault();
        if (openTabs.length > 1 && selectedFile) {
          const idx = openTabs.indexOf(selectedFile);
          if (idx !== -1) {
            const nextIdx = (idx + 1) % openTabs.length;
            handleSelectFile(openTabs[nextIdx]);
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [openTabs, selectedFile, handleSelectFile]);

  return (
    <div className="app-container">
      {/* File Browser Sidebar */}
      <FileBrowser
        currentPath={currentPath}
        setCurrentPath={setCurrentPath}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        width={sidebarWidth}
      />

      {/* Vertical Drag Resizer Handle */}
      <div className="sidebar-resizer" onMouseDown={startSidebarResize} />

      {/* Editor/Viewer Panel with Tabs Bar */}
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Tabs Bar */}
        {openTabs.length > 0 && (
          <div className="tabs-bar">
            {openTabs.map((path) => {
              const name = getFileName(path);
              const isActive = selectedFile === path;
              return (
                <div
                  key={path}
                  className={`tab-item ${isActive ? "active" : ""}`}
                  onClick={() => handleSelectFile(path)}
                  title={path}
                >
                  <span className="tab-title">{name}</span>
                  <button
                    className="tab-close-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(path);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Content Area */}
        <div style={{ flexGrow: 1, display: "flex", height: "100%", overflow: "hidden" }}>
          {isLoadingFile ? (
            <div className="no-file-selected">
              <Loader2 className="w-10 h-10 animate-spin text-accent" style={{ marginBottom: "16px" }} />
              <p>Loading file content...</p>
            </div>
          ) : selectedFile ? (
            fileError ? (
              <div className="no-file-selected">
                <AlertCircle className="w-12 h-12" style={{ marginBottom: "16px", color: "hsl(0, 84%, 60%)" }} />
                <h2 style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: "18px" }}>Cannot Read File</h2>
                <p style={{ margin: 0, fontSize: "14px", opacity: 0.8, maxWidth: "360px", color: "var(--text-secondary)" }}>
                  {fileError.includes("invalid utf-8") 
                    ? "This file appears to be a binary file and cannot be read as text." 
                    : `Failed to load file content: ${fileError}`}
                </p>
              </div>
            ) : isMediaFile(selectedFile) ? (
              <MediaViewer filePath={selectedFile} />
            ) : (
              <MarkdownEditor
                filePath={selectedFile}
                initialContent={fileContent}
                onSave={handleSaveFile}
              />
            )
          ) : (
            <div className="no-file-selected">
              <FileCode className="no-file-icon text-accent" style={{ width: "64px", height: "64px" }} />
              <h2 style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: "20px" }}>No File Open</h2>
              <p style={{ margin: 0, fontSize: "14px", opacity: 0.8, maxWidth: "320px" }}>
                Select a Markdown (.md), image, or video file from the browser sidebar to open. Use Cmd+S/Ctrl+S to save markdown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

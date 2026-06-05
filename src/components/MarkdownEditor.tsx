import { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Undo2,
  Redo2,
  Save,
  CodeSquare,
  CheckCircle,
  FileEdit,
  Lock,
} from "lucide-react";

interface MarkdownEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (filePath: string, content: string) => Promise<void>;
  onChange?: (filePath: string, content: string) => void;
}

export default function MarkdownEditor({
  filePath,
  initialContent,
  onSave,
  onChange,
}: MarkdownEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editMode, setEditMode] = useState<"rich" | "plain">("rich");

  const isMarkdown = filePath.toLowerCase().endsWith(".md") || filePath.toLowerCase().endsWith(".qmd");
  const isEditable = true;

  const [plainContent, setPlainContent] = useState(initialContent);

  // Sync plainContent and editor content when filePath or initialContent changes
  useEffect(() => {
    setPlainContent(initialContent);
    if (isMarkdown && editor && initialContent !== undefined) {
      const currentMarkdown = (editor.storage as any).markdown.getMarkdown();
      if (currentMarkdown !== initialContent) {
        editor.commands.setContent(initialContent);
      }
      editor.setEditable(true);
    }
  }, [filePath, initialContent, isMarkdown]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      Markdown,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: isMarkdown ? initialContent : "",
    editable: isMarkdown,
    autofocus: isMarkdown ? 'end' : false,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
    onUpdate: ({ editor }) => {
      if (isMarkdown) {
        const md = (editor.storage as any).markdown.getMarkdown();
        setPlainContent(md);
        onChange?.(filePath, md);
      }
    }
  });

  // Handle Save operation
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    
    let contentToSave = "";
    if (isMarkdown) {
      if (editMode === "rich" && editor) {
        contentToSave = (editor.storage as any).markdown.getMarkdown();
      } else {
        contentToSave = plainContent;
      }
    } else {
      contentToSave = plainContent;
    }

    try {
      await onSave(filePath, contentToSave);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      
      // Keep rich and plain views in sync after saving
      if (isMarkdown) {
        if (editMode === "rich") {
          setPlainContent(contentToSave);
        } else {
          editor?.commands.setContent(contentToSave);
        }
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleMode = (mode: "rich" | "plain") => {
    if (mode === "plain") {
      if (editor) {
        const md = (editor.storage as any).markdown.getMarkdown();
        setPlainContent(md);
      }
    } else {
      if (editor) {
        editor.commands.setContent(plainContent);
      }
    }
    setEditMode(mode);
  };

  // Intercept Shift+Tab to focus the sidebar folder view
  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      (document.querySelector(".sidebar") as HTMLElement)?.focus();
    }
  };

  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  // Keyboard shortcut Ctrl+S / Cmd+S for saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isMarkdown && !editor) {
    return (
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        Initializing editor...
      </div>
    );
  }

  const getFileName = (path: string) => {
    const isWindows = path.includes("\\");
    const separator = isWindows ? "\\" : "/";
    return path.substring(path.lastIndexOf(separator) + 1);
  };

  return (
    <div className="main-panel" onKeyDownCapture={handleKeyDownCapture}>
      <div className="editor-header">
        <div className="file-info">
          <div className="file-title-container">
            <FileEdit className="w-5 h-5 text-accent" />
            <div>
              <div className="file-name-text">{getFileName(filePath)}</div>
              <div className="file-path-text">{filePath}</div>
            </div>
          </div>

          {isMarkdown && (
            <div className="mode-toggle-container" style={{ display: "flex", borderRadius: "6px", backgroundColor: "var(--bg-tertiary)", padding: "2px", border: "1px solid var(--border)", marginLeft: "16px" }}>
              <button
                onClick={() => handleToggleMode("rich")}
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: editMode === "rich" ? "var(--bg-primary)" : "transparent",
                  color: editMode === "rich" ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: editMode === "rich" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                Rich Text
              </button>
              <button
                onClick={() => handleToggleMode("plain")}
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: editMode === "plain" ? "var(--bg-primary)" : "transparent",
                  color: editMode === "plain" ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: editMode === "plain" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                Plain Text
              </button>
            </div>
          )}

          <div className="save-status">
            {isEditable ? (
              <>
                {saveSuccess && (
                  <span style={{ color: "hsl(142, 71%, 45%)", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                    <CheckCircle className="w-4 h-4" /> Saved
                  </span>
                )}
                <button
                  className="save-button"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "4px 8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", color: "var(--text-secondary)" }}>
                <Lock className="w-3.5 h-3.5" /> Read Only
              </span>
            )}
          </div>
        </div>

        {/* Visual formatting toolbar */}
        {isMarkdown && editMode === "rich" && editor && (
          <div className="editor-toolbar">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              disabled={!editor.can().chain().focus().toggleBold().run()}
              className={`toolbar-btn ${editor.isActive("bold") ? "active" : ""}`}
              title="Bold (Cmd+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              disabled={!editor.can().chain().focus().toggleItalic().run()}
              className={`toolbar-btn ${editor.isActive("italic") ? "active" : ""}`}
              title="Italic (Cmd+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              disabled={!editor.can().chain().focus().toggleStrike().run()}
              className={`toolbar-btn ${editor.isActive("strike") ? "active" : ""}`}
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCode().run()}
              disabled={!editor.can().chain().focus().toggleCode().run()}
              className={`toolbar-btn ${editor.isActive("code") ? "active" : ""}`}
              title="Inline Code"
            >
              <Code className="w-4 h-4" />
            </button>

            <div className="toolbar-divider" />

            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`toolbar-btn ${editor.isActive("heading", { level: 1 }) ? "active" : ""}`}
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`toolbar-btn ${editor.isActive("heading", { level: 2 }) ? "active" : ""}`}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`toolbar-btn ${editor.isActive("heading", { level: 3 }) ? "active" : ""}`}
              title="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </button>

            <div className="toolbar-divider" />

            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`toolbar-btn ${editor.isActive("bulletList") ? "active" : ""}`}
              title="Bullet List"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`toolbar-btn ${editor.isActive("orderedList") ? "active" : ""}`}
              title="Ordered List"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              className={`toolbar-btn ${editor.isActive("taskList") ? "active" : ""}`}
              title="Checklist"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`toolbar-btn ${editor.isActive("blockquote") ? "active" : ""}`}
              title="Blockquote"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`toolbar-btn ${editor.isActive("codeBlock") ? "active" : ""}`}
              title="Code Block"
            >
              <CodeSquare className="w-4 h-4" />
            </button>

            <div className="toolbar-divider" />

            <button
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              className="toolbar-btn"
              title="Horizontal Rule"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().chain().focus().undo().run()}
              className="toolbar-btn"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().chain().focus().redo().run()}
              className="toolbar-btn"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="editor-container">
        <div className="editor-wrapper">
          {isMarkdown && editMode === "rich" ? (
            <EditorContent editor={editor} />
          ) : (
            <textarea
              className="plain-text-editor"
              value={plainContent}
              onChange={(e) => {
                const val = e.target.value;
                setPlainContent(val);
                onChange?.(filePath, val);
              }}
              placeholder="Plain text editor..."
              style={{
                width: "100%",
                minHeight: "500px",
                border: "none",
                outline: "none",
                resize: "vertical",
                background: "transparent",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono, 'Fira Code', 'JetBrains Mono', Courier, monospace)",
                fontSize: "14px",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                padding: "20px 28px",
                boxSizing: "border-box",
              }}
              autoFocus
            />
          )}
        </div>
      </div>
    </div>
  );
}

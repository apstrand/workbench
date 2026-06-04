import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
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
  onSave: (content: string) => Promise<void>;
}

export default function MarkdownEditor({
  filePath,
  initialContent,
  onSave,
}: MarkdownEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isEditable = filePath.toLowerCase().endsWith(".md") || filePath.toLowerCase().endsWith(".qmd");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Let markdown extension handle code block or lists if preferred,
        // but default StarterKit is fully compatible
      }),
      Markdown,
    ],
    content: initialContent,
    editable: isEditable,
    autofocus: isEditable ? 'end' : false,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
  });

  // Load new file content when filePath or initialContent changes
  useEffect(() => {
    if (editor && initialContent !== undefined) {
      const currentMarkdown = (editor.storage as any).markdown.getMarkdown();
      if (currentMarkdown !== initialContent) {
        editor.commands.setContent(initialContent);
      }
      editor.setEditable(isEditable);
      if (isEditable) {
        editor.commands.focus('end');
      }
    }
  }, [filePath, initialContent, editor, isEditable]);

  // Handle Save operation
  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    setSaveSuccess(false);
    
    const markdown = (editor.storage as any).markdown.getMarkdown();
    try {
      await onSave(markdown);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S for saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, onSave]);

  if (!editor) {
    return (
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        Initializing editor...
      </div>
    );
  }

  // Get filename from absolute path
  const getFileName = (path: string) => {
    const isWindows = path.includes("\\");
    const separator = isWindows ? "\\" : "/";
    return path.substring(path.lastIndexOf(separator) + 1);
  };

  return (
    <div className="main-panel">
      <div className="editor-header">
        <div className="file-info">
          <div className="file-title-container">
            <FileEdit className="w-5 h-5 text-accent" />
            <div>
              <div className="file-name-text">{getFileName(filePath)}</div>
              <div className="file-path-text">{filePath}</div>
            </div>
          </div>
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
        {isEditable && (
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
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
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
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

const findMatchesInDoc = (doc: any, query: string, caseSensitive = false) => {
  const matches: { from: number; to: number }[] = [];
  if (!query) return matches;
  
  const searchTerm = caseSensitive ? query : query.toLowerCase();
  
  doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      const text = node.text || "";
      const searchText = caseSensitive ? text : text.toLowerCase();
      let index = searchText.indexOf(searchTerm);
      while (index !== -1) {
        matches.push({
          from: pos + index,
          to: pos + index + query.length
        });
        index = searchText.indexOf(searchTerm, index + 1);
      }
    }
  });
  return matches;
};

const findMatchesInText = (text: string, query: string, caseSensitive = false) => {
  const matches: { from: number; to: number }[] = [];
  if (!query) return matches;
  
  const textToSearch = caseSensitive ? text : text.toLowerCase();
  const searchTerm = caseSensitive ? query : query.toLowerCase();
  
  let index = textToSearch.indexOf(searchTerm);
  while (index !== -1) {
    matches.push({
      from: index,
      to: index + query.length
    });
    index = textToSearch.indexOf(searchTerm, index + 1);
  }
  return matches;
};

const replaceAllInDoc = (editor: any, query: string, replacement: string, caseSensitive = false) => {
  const matches = findMatchesInDoc(editor.state.doc, query, caseSensitive);
  const tr = editor.state.tr;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    tr.replaceWith(match.from, match.to, editor.schema.text(replacement));
  }
  editor.view.dispatch(tr);
};

const escapeRegExp = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const searchHighlightKey = new PluginKey('searchHighlight');

const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',
  addOptions() {
    return {
      findStateRef: null as any,
    };
  },
  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr) {
            const ref = extension.options.findStateRef;
            if (!ref || !ref.current) return DecorationSet.empty;
            const { searchQuery, caseSensitive, currentMatchIndex, isOpen } = ref.current;
            if (!isOpen || !searchQuery) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            const searchTerm = caseSensitive ? searchQuery : searchQuery.toLowerCase();

            tr.doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text || "";
                const searchText = caseSensitive ? text : text.toLowerCase();
                let index = searchText.indexOf(searchTerm);
                while (index !== -1) {
                  const isActive = decorations.length === currentMatchIndex;
                  decorations.push(
                    Decoration.inline(pos + index, pos + index + searchQuery.length, {
                      class: isActive ? 'search-result active-match' : 'search-result',
                    })
                  );
                  index = searchText.indexOf(searchTerm, index + 1);
                }
              }
            });

            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

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

  const [findState, setFindState] = useState<{
    isOpen: boolean;
    searchQuery: string;
    replaceQuery: string;
    caseSensitive: boolean;
    currentMatchIndex: number;
  }>({
    isOpen: false,
    searchQuery: "",
    replaceQuery: "",
    caseSensitive: false,
    currentMatchIndex: 0,
  });

  const findStateRef = useRef(findState);
  useEffect(() => {
    findStateRef.current = findState;
  }, [findState]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      Markdown,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      SearchHighlightExtension.configure({
        findStateRef: findStateRef,
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

  // Declaratively update ProseMirror search highlights when findState changes or editor is re-attached
  useEffect(() => {
    if (editor && editMode === "rich") {
      editor.view.dispatch(editor.state.tr);
    }
  }, [findState.searchQuery, findState.caseSensitive, findState.currentMatchIndex, findState.isOpen, editMode, editor]);

  // Sync plain text content back to Tiptap editor when switching to rich mode
  useEffect(() => {
    if (editMode === "rich" && editor) {
      const currentMd = (editor.storage as any).markdown.getMarkdown();
      if (currentMd !== plainContent) {
        editor.commands.setContent(plainContent);
      }
    }
  }, [editMode, editor, plainContent]);

  const getMatches = (query: string, caseSensitive: boolean) => {
    if (!query) return [];
    if (editMode === "rich" && editor) {
      return findMatchesInDoc(editor.state.doc, query, caseSensitive);
    } else {
      return findMatchesInText(plainContent, query, caseSensitive);
    }
  };

  const goToMatch = (index: number, matches: { from: number; to: number }[]) => {
    if (matches.length === 0 || index < 0 || index >= matches.length) return;
    const match = matches[index];
    
    if (editMode === "rich" && editor) {
      setFindState(prev => ({ ...prev, currentMatchIndex: index }));
      
      const tr = editor.state.tr;
      const resolvedPos = tr.doc.resolve(match.from);
      tr.setSelection(new TextSelection(resolvedPos, tr.doc.resolve(match.to)));
      tr.scrollIntoView();
      editor.view.dispatch(tr);
    } else {
      const textarea = document.querySelector(".plain-text-editor") as HTMLTextAreaElement;
      if (textarea) {
        const activeElement = document.activeElement as HTMLElement;
        textarea.focus();
        textarea.setSelectionRange(match.from, match.to);
        if (activeElement && activeElement !== textarea) {
          activeElement.focus();
        }
      }
    }
  };

  const handleSearchChange = (query: string) => {
    setFindState(prev => ({ ...prev, searchQuery: query, currentMatchIndex: 0 }));
  };

  const handleCaseToggle = () => {
    setFindState(prev => ({ ...prev, caseSensitive: !prev.caseSensitive, currentMatchIndex: 0 }));
  };

  const handleFindNext = () => {
    const query = findState.searchQuery;
    if (!query) return;
    const matches = getMatches(query, findState.caseSensitive);
    if (matches.length === 0) return;
    
    const nextIndex = (findState.currentMatchIndex + 1) % matches.length;
    setFindState(prev => ({ ...prev, currentMatchIndex: nextIndex }));
    goToMatch(nextIndex, matches);
  };

  const handleFindPrev = () => {
    const query = findState.searchQuery;
    if (!query) return;
    const matches = getMatches(query, findState.caseSensitive);
    if (matches.length === 0) return;
    
    const prevIndex = (findState.currentMatchIndex - 1 + matches.length) % matches.length;
    setFindState(prev => ({ ...prev, currentMatchIndex: prevIndex }));
    goToMatch(prevIndex, matches);
  };

  const handleReplace = () => {
    const query = findState.searchQuery;
    if (!query) return;
    const matches = getMatches(query, findState.caseSensitive);
    if (matches.length === 0) return;
    
    const index = findState.currentMatchIndex;
    const match = matches[index];
    if (!match) return;
    
    const replacement = findState.replaceQuery;
    
    if (editMode === "rich" && editor) {
      editor.commands.setTextSelection({ from: match.from, to: match.to });
      editor.commands.insertContent(replacement);
      
      setTimeout(() => {
        const newMatches = getMatches(query, findState.caseSensitive);
        if (newMatches.length > 0) {
          const nextIndex = index % newMatches.length;
          setFindState(prev => ({ ...prev, currentMatchIndex: nextIndex }));
          goToMatch(nextIndex, newMatches);
        } else {
          setFindState(prev => ({ ...prev, currentMatchIndex: 0 }));
        }
      }, 0);
    } else {
      const newContent = plainContent.substring(0, match.from) + replacement + plainContent.substring(match.to);
      setPlainContent(newContent);
      onChange?.(filePath, newContent);
      
      setTimeout(() => {
        const newMatches = findMatchesInText(newContent, query, findState.caseSensitive);
        if (newMatches.length > 0) {
          const nextIndex = index % newMatches.length;
          setFindState(prev => ({ ...prev, currentMatchIndex: nextIndex }));
          goToMatch(nextIndex, newMatches);
        } else {
          setFindState(prev => ({ ...prev, currentMatchIndex: 0 }));
        }
      }, 0);
    }
  };

  const handleReplaceAll = () => {
    const query = findState.searchQuery;
    if (!query) return;
    const replacement = findState.replaceQuery;
    
    if (editMode === "rich" && editor) {
      replaceAllInDoc(editor, query, replacement, findState.caseSensitive);
      const md = (editor.storage as any).markdown.getMarkdown();
      setPlainContent(md);
      onChange?.(filePath, md);
    } else {
      const regex = new RegExp(escapeRegExp(query), findState.caseSensitive ? 'g' : 'gi');
      const newContent = plainContent.replace(regex, replacement);
      setPlainContent(newContent);
      onChange?.(filePath, newContent);
    }
    
    setFindState(prev => ({ ...prev, currentMatchIndex: 0 }));
  };

  const handleCloseFind = () => {
    setFindState(prev => ({ ...prev, isOpen: false, searchQuery: "" }));
  };





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

  const handleFindNextRef = useRef(handleFindNext);
  const handleFindPrevRef = useRef(handleFindPrev);
  useEffect(() => {
    handleFindNextRef.current = handleFindNext;
    handleFindPrevRef.current = handleFindPrev;
  });

  // Keyboard shortcut Ctrl+S / Cmd+S for saving, Cmd+F for find, Cmd+G for find next, Cmd+Shift+G for find prev
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      
      if (isCmd && key === "s") {
        e.preventDefault();
        handleSaveRef.current();
      } else if (isCmd && key === "f") {
        e.preventDefault();
        setFindState(prev => {
          if (prev.isOpen) {
            const input = document.getElementById("editor-search-input");
            if (input) {
              input.focus();
              (input as HTMLInputElement).select();
            }
            return prev;
          }
          return { ...prev, isOpen: true };
        });
        
        setTimeout(() => {
          const input = document.getElementById("editor-search-input");
          if (input) {
            input.focus();
            (input as HTMLInputElement).select();
          }
        }, 50);
      } else if (isCmd && key === "g") {
        e.preventDefault();
        if (e.shiftKey) {
          handleFindPrevRef.current();
        } else {
          handleFindNextRef.current();
        }
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

  const activeMatches = getMatches(findState.searchQuery, findState.caseSensitive);
  const matchCount = activeMatches.length;
  const currentMatchDisplay = matchCount > 0 ? findState.currentMatchIndex + 1 : 0;

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

      {findState.isOpen && (
        <div className="find-replace-bar">
          <div className="find-replace-row">
            <div className="find-replace-input-wrapper">
              <input
                id="editor-search-input"
                className="find-replace-input"
                placeholder="Find"
                value={findState.searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                      handleFindPrev();
                    } else {
                      handleFindNext();
                    }
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCloseFind();
                  }
                }}
              />
              {findState.searchQuery && (
                <span className="find-replace-match-count">
                  {currentMatchDisplay} of {matchCount}
                </span>
              )}
            </div>
            
            <button className="find-replace-btn" onClick={handleFindPrev} title="Previous Match (Cmd+Shift+G)">
              <ChevronUp className="w-4 h-4" />
            </button>
            <button className="find-replace-btn" onClick={handleFindNext} title="Next Match (Cmd+G)">
              <ChevronDown className="w-4 h-4" />
            </button>
            
            <label className="find-replace-toggle">
              <input
                type="checkbox"
                checked={findState.caseSensitive}
                onChange={handleCaseToggle}
              />
              Match Case
            </label>
            
            <button className="find-replace-btn" onClick={handleCloseFind} style={{ marginLeft: "auto", border: "none", background: "transparent" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="find-replace-row">
            <div className="find-replace-input-wrapper">
              <input
                className="find-replace-input"
                placeholder="Replace"
                value={findState.replaceQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setFindState(prev => ({ ...prev, replaceQuery: val }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleReplace();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCloseFind();
                  }
                }}
              />
            </div>
            <button className="find-replace-btn" onClick={handleReplace}>
              Replace
            </button>
            <button className="find-replace-btn" onClick={handleReplaceAll}>
              Replace All
            </button>
          </div>
        </div>
      )}

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
                flexGrow: 1,
                height: "100%",
                border: "none",
                outline: "none",
                resize: "none",
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

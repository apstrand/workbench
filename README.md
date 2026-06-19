# Markdown Editor & File Browser

A Markdown editor built with **Tauri v2**, **React**, **TypeScript**, and **Tiptap**. It enables browsing local files via a sidebar list and editing `.md` documents natively using a visual WYSIWYG editor that reads and saves pure Markdown.

## Key Features

- **Local File Navigation**: Traverse local folders, navigate up/down directories, and filter markdown files.
- **Tiptap Markdown Editor**: Rich-text editing with automatic Markdown serialization and deserialization.
- **Visual Formatting Toolbar**: Easy buttons to apply headers, lists, code styles, blockquotes, and undo/redo operations.
- **Save Keybindings**: Supports saving modifications natively via `Cmd+S` (macOS) or `Ctrl+S` (Windows/Linux) as well as a visual toolbar Save button.
- **Adaptable HSL Color System**: Automatically adapts to system light and dark themes with glassmorphic borders and custom scrollbars.

---

## Project Structure

- **`src-tauri/`**: The Rust backend of the Tauri application.
  - `src/lib.rs`: Exposes native Rust filesystem commands (`get_home_dir`, `list_directory`, `read_file_content`, `write_file_content`) to the webview.
  - `Cargo.toml`: Rust workspace dependencies.
- **`src/`**: The React + TypeScript frontend application.
  - `components/FileBrowser.tsx`: The folder navigation sidebar.
  - `components/MarkdownEditor.tsx`: The Tiptap rich-text editor panel.
  - `App.tsx`: Orchestrates active file loading, saving, layout panels, and landing state.
  - `index.css`: Defines CSS layout and HSL color variables.

---

## Development Workflow

### Prerequisites

Make sure you have the following installed on your machine:
1. **Node.js** (npm)
2. **Rust** and Cargo toolchain

### Installation

Install all frontend npm packages:
```bash
npm install
```

### Running in Development Mode

To start the Vite development server and open the Tauri native desktop window:
```bash
npm run tauri dev
```
Tauri will automatically rebuild the Rust code on change and reload the frontend instantly.

---

## Production Build

To compile a final release binary:

### 1. Build and Package (DMG, PKG, MSI, DEB, etc.)
```bash
npm run tauri build
```

### 2. Build Release Binary Only (Fast Compilation Check)
To build the compiled release binary without packaging it into installers:
```bash
npm run tauri build -- --no-bundle
```
The compiled release executable will be available at:
`src-tauri/target/release/tauri-app`

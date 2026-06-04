use std::path::{Path, PathBuf};
use std::fs;
use std::io::Write;
use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
    Frame,
};
use crossterm::event::{self, KeyCode, KeyModifiers};
use anyhow::Result;

use crate::config::Config;
use crate::markdown::parse_markdown;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ActiveSection {
    Workspaces,
    Folders,
    Viewer,
}

#[derive(Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub struct AppState {
    pub config: Config,
    pub current_dir: PathBuf,
    pub entries: Vec<FileEntry>,
    pub workspace_index: usize,
    pub folder_index: usize,
    pub active_section: ActiveSection,
    pub selected_file: Option<PathBuf>,
    pub file_content: Option<Text<'static>>,
    pub file_lines_count: usize,
    pub scroll_offset: usize,
    pub error: Option<String>,
    pub quit: bool,
}

impl AppState {
    pub fn new(initial_dir: Option<PathBuf>) -> Self {
        let config = Config::load();
        
        let start_dir = initial_dir
            .or_else(|| dirs::home_dir())
            .unwrap_or_else(|| PathBuf::from("."));
            
        let current_dir = fs::canonicalize(&start_dir)
            .unwrap_or(start_dir);

        let mut app = Self {
            config,
            current_dir,
            entries: Vec::new(),
            workspace_index: 0,
            folder_index: 0,
            active_section: ActiveSection::Folders,
            selected_file: None,
            file_content: None,
            file_lines_count: 0,
            scroll_offset: 0,
            error: None,
            quit: false,
        };

        app.reload_directory();
        app
    }

    pub fn reload_directory(&mut self) {
        match list_directory(&self.current_dir) {
            Ok(entries) => {
                self.entries = entries;
                if self.entries.is_empty() {
                    self.folder_index = 0;
                } else if self.folder_index >= self.entries.len() {
                    self.folder_index = self.entries.len() - 1;
                }
                self.error = None;
            }
            Err(e) => {
                self.entries = Vec::new();
                self.folder_index = 0;
                self.error = Some(format!("Error reading folder: {}", e));
            }
        }
    }

    pub fn select_file(&mut self, path: PathBuf) {
        let path_str = path.to_string_lossy();
        if is_media_file(&path_str) {
            self.selected_file = Some(path);
            self.file_content = None;
            self.file_lines_count = 0;
            self.scroll_offset = 0;
            self.error = None;
            return;
        }

        match fs::read_to_string(&path) {
            Ok(content) => {
                let parsed = parse_markdown(&content);
                self.file_lines_count = parsed.lines.len();
                self.file_content = Some(parsed);
                self.selected_file = Some(path);
                self.scroll_offset = 0;
                self.error = None;
            }
            Err(e) => {
                self.error = Some(format!("Error opening file: {}", e));
            }
        }
    }

    pub fn handle_key(&mut self, key: event::KeyEvent) -> Result<()> {
        if key.code == KeyCode::Char('q') && key.modifiers.contains(KeyModifiers::CONTROL) {
            self.quit = true;
            return Ok(());
        }

        match self.active_section {
            ActiveSection::Workspaces => self.handle_key_workspaces(key)?,
            ActiveSection::Folders => self.handle_key_folders(key)?,
            ActiveSection::Viewer => self.handle_key_viewer(key)?,
        }

        Ok(())
    }

    fn handle_global_keys(&mut self, key: event::KeyEvent) -> bool {
        match key.code {
            KeyCode::Tab => {
                self.active_section = match self.active_section {
                    ActiveSection::Workspaces => {
                        if !self.entries.is_empty() {
                            ActiveSection::Folders
                        } else {
                            ActiveSection::Viewer
                        }
                    }
                    ActiveSection::Folders => ActiveSection::Viewer,
                    ActiveSection::Viewer => {
                        if !self.config.pinned_workspaces.is_empty() {
                            ActiveSection::Workspaces
                        } else if !self.entries.is_empty() {
                            ActiveSection::Folders
                        } else {
                            ActiveSection::Viewer
                        }
                    }
                };
                true
            }
            KeyCode::BackTab => { // Shift + Tab
                self.active_section = match self.active_section {
                    ActiveSection::Workspaces => ActiveSection::Viewer,
                    ActiveSection::Folders => {
                        if !self.config.pinned_workspaces.is_empty() {
                            ActiveSection::Workspaces
                        } else {
                            ActiveSection::Viewer
                        }
                    }
                    ActiveSection::Viewer => {
                        if !self.entries.is_empty() {
                            ActiveSection::Folders
                        } else if !self.config.pinned_workspaces.is_empty() {
                            ActiveSection::Workspaces
                        } else {
                            ActiveSection::Viewer
                        }
                    }
                };
                true
            }
            KeyCode::Char('q') | KeyCode::Esc => {
                self.quit = true;
                true
            }
            _ => false,
        }
    }

    fn handle_key_workspaces(&mut self, key: event::KeyEvent) -> Result<()> {
        if self.handle_global_keys(key) {
            return Ok(());
        }

        let workspaces = &self.config.pinned_workspaces;
        if workspaces.is_empty() {
            return Ok(());
        }

        match key.code {
            KeyCode::Down | KeyCode::Char('j') => {
                if self.workspace_index < workspaces.len() - 1 {
                    self.workspace_index += 1;
                } else if !self.entries.is_empty() {
                    self.active_section = ActiveSection::Folders;
                    self.folder_index = 0;
                }
            }
            KeyCode::Up | KeyCode::Char('k') => {
                if self.workspace_index > 0 {
                    self.workspace_index -= 1;
                }
            }
            KeyCode::Enter => {
                let path = PathBuf::from(&workspaces[self.workspace_index]);
                if path.exists() && path.is_dir() {
                    self.current_dir = path;
                    self.reload_directory();
                    self.active_section = ActiveSection::Folders;
                    self.folder_index = 0;
                } else {
                    self.error = Some("Workspace directory no longer exists".to_string());
                }
            }
            KeyCode::Char('p') | KeyCode::Char('d') | KeyCode::Char('x') => {
                let removed = workspaces[self.workspace_index].clone();
                self.config.pinned_workspaces.retain(|x| x != &removed);
                let _ = self.config.save();
                if self.workspace_index >= self.config.pinned_workspaces.len() {
                    self.workspace_index = self.config.pinned_workspaces.len().saturating_sub(1);
                }
                if self.config.pinned_workspaces.is_empty() {
                    self.active_section = ActiveSection::Folders;
                    self.folder_index = 0;
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn handle_key_folders(&mut self, key: event::KeyEvent) -> Result<()> {
        if self.handle_global_keys(key) {
            return Ok(());
        }

        match key.code {
            KeyCode::Down | KeyCode::Char('j') => {
                if !self.entries.is_empty() && self.folder_index < self.entries.len() - 1 {
                    self.folder_index += 1;
                }
            }
            KeyCode::Up | KeyCode::Char('k') => {
                if self.folder_index > 0 {
                    self.folder_index -= 1;
                } else if !self.config.pinned_workspaces.is_empty() {
                    self.active_section = ActiveSection::Workspaces;
                    self.workspace_index = self.config.pinned_workspaces.len() - 1;
                }
            }
            KeyCode::Enter | KeyCode::Right => {
                if !self.entries.is_empty() {
                    let entry = self.entries[self.folder_index].clone();
                    let path = PathBuf::from(&entry.path);
                    if entry.is_dir {
                        self.current_dir = path;
                        self.reload_directory();
                        self.folder_index = 0;
                    } else if key.code == KeyCode::Enter {
                        self.select_file(path);
                    }
                }
            }
            KeyCode::Backspace | KeyCode::Char('u') | KeyCode::Left => {
                if let Some(parent) = self.current_dir.parent() {
                    let old_dir_name = self.current_dir.file_name()
                        .map(|n| n.to_string_lossy().into_owned());
                    
                    self.current_dir = parent.to_path_buf();
                    self.reload_directory();
                    
                    if let Some(name) = old_dir_name {
                        if let Some(idx) = self.entries.iter().position(|e| e.is_dir && e.name == name) {
                            self.folder_index = idx;
                        } else {
                            self.folder_index = 0;
                        }
                    } else {
                        self.folder_index = 0;
                    }
                }
            }
            KeyCode::Char('p') => {
                let mut path_to_pin = self.current_dir.to_string_lossy().into_owned();
                if !self.entries.is_empty() {
                    let entry = &self.entries[self.folder_index];
                    if entry.is_dir {
                        path_to_pin = entry.path.clone();
                    }
                }
                
                if self.config.pinned_workspaces.contains(&path_to_pin) {
                    self.config.pinned_workspaces.retain(|x| x != &path_to_pin);
                } else {
                    self.config.pinned_workspaces.push(path_to_pin);
                }
                let _ = self.config.save();
            }
            _ => {}
        }
        Ok(())
    }

    fn handle_key_viewer(&mut self, key: event::KeyEvent) -> Result<()> {
        if self.handle_global_keys(key) {
            return Ok(());
        }

        match key.code {
            KeyCode::Down | KeyCode::Char('j') => {
                self.scroll_offset = self.scroll_offset.saturating_add(1);
            }
            KeyCode::Up | KeyCode::Char('k') => {
                self.scroll_offset = self.scroll_offset.saturating_sub(1);
            }
            KeyCode::PageDown | KeyCode::Char(' ') => {
                self.scroll_offset = self.scroll_offset.saturating_add(15);
            }
            KeyCode::PageUp | KeyCode::Backspace => {
                self.scroll_offset = self.scroll_offset.saturating_sub(15);
            }
            KeyCode::Char('e') => {
                if let Some(ref file_path) = self.selected_file {
                    let path_str = file_path.to_string_lossy();
                    if !is_media_file(&path_str) {
                        return self.edit_current_file();
                    }
                }
            }
            KeyCode::Char('o') | KeyCode::Enter => {
                if let Some(ref file_path) = self.selected_file {
                    let _ = open_system_default(&file_path.to_string_lossy());
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn edit_current_file(&mut self) -> Result<()> {
        let file_path = match &self.selected_file {
            Some(p) => p.clone(),
            None => return Ok(()),
        };

        crossterm::terminal::disable_raw_mode()?;
        std::io::stdout().flush()?;
        crossterm::execute!(
            std::io::stdout(),
            crossterm::terminal::LeaveAlternateScreen,
            crossterm::cursor::Show
        )?;

        let editor = std::env::var("EDITOR").unwrap_or_else(|_| "nano".to_string());
        
        let child = std::process::Command::new(&editor)
            .arg(&file_path)
            .spawn();

        match child {
            Ok(mut c) => {
                let _ = c.wait();
            }
            Err(_) => {
                let fallback = std::process::Command::new("vim")
                    .arg(&file_path)
                    .spawn();
                if fallback.is_err() {
                    let _ = std::process::Command::new("nano")
                        .arg(&file_path)
                        .spawn()
                        .map(|mut c| c.wait());
                }
            }
        }

        crossterm::terminal::enable_raw_mode()?;
        crossterm::execute!(
            std::io::stdout(),
            crossterm::terminal::EnterAlternateScreen,
            crossterm::cursor::Hide
        )?;

        self.select_file(file_path);
        
        Ok(())
    }

    pub fn draw(&self, f: &mut Frame<'_>) {
        let rect = f.size();
        
        let main_chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(0),
                Constraint::Length(1),
            ])
            .split(rect);

        let pane_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(30),
                Constraint::Percentage(70),
            ])
            .split(main_chunks[0]);

        let sidebar_chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Percentage(35),
                Constraint::Percentage(65),
            ])
            .split(pane_chunks[0]);

        // Render Pinned Workspaces
        let workspaces_border_color = if self.active_section == ActiveSection::Workspaces {
            Color::Rgb(59, 130, 246)
        } else {
            Color::Rgb(30, 41, 59)
        };

        let workspaces = &self.config.pinned_workspaces;
        let mut list_items = Vec::new();
        
        for (i, path_str) in workspaces.iter().enumerate() {
            let path = Path::new(path_str);
            let folder_name = path.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path_str.clone());

            let is_selected = i == self.workspace_index && self.active_section == ActiveSection::Workspaces;
            
            let style = if is_selected {
                Style::default().bg(Color::Rgb(30, 58, 138)).fg(Color::White)
            } else {
                Style::default().fg(Color::Rgb(240, 243, 248))
            };

            list_items.push(ListItem::new(vec![
                Line::from(vec![
                    Span::styled("📌 ", Style::default().fg(Color::Rgb(59, 130, 246))),
                    Span::styled(folder_name, Style::default().add_modifier(Modifier::BOLD)),
                ]),
                Line::from(vec![
                    Span::styled(format!("  {}", path_str), Style::default().fg(Color::Rgb(148, 161, 178))),
                ]),
            ]).style(style));
        }

        let workspaces_block = Block::default()
            .borders(Borders::ALL)
            .title("📌 Workspaces")
            .border_style(Style::default().fg(workspaces_border_color));

        let workspaces_list = List::new(list_items)
            .block(workspaces_block);
            
        f.render_widget(workspaces_list, sidebar_chunks[0]);

        // Render Directory Folders
        let folders_border_color = if self.active_section == ActiveSection::Folders {
            Color::Rgb(59, 130, 246)
        } else {
            Color::Rgb(30, 41, 59)
        };

        let mut folder_items = Vec::new();
        let path_str = self.current_dir.to_string_lossy().into_owned();
        
        for (i, entry) in self.entries.iter().enumerate() {
            let is_selected = i == self.folder_index && self.active_section == ActiveSection::Folders;
            let is_currently_open = self.selected_file.as_ref()
                .map(|p| p.to_string_lossy() == entry.path)
                .unwrap_or(false);

            let style = if is_selected {
                Style::default().bg(Color::Rgb(30, 58, 138)).fg(Color::White)
            } else if is_currently_open {
                Style::default().bg(Color::Rgb(15, 32, 66)).fg(Color::Rgb(59, 130, 246)).add_modifier(Modifier::BOLD)
            } else {
                let fg = if entry.is_dir || is_markdown_file(&entry.name) || is_media_file(&entry.path) {
                    Color::Rgb(240, 243, 248)
                } else {
                    Color::Rgb(80, 90, 105)
                };
                Style::default().fg(fg)
            };

            let icon = if entry.is_dir {
                "📁 "
            } else if is_media_file(&entry.path) {
                if is_video_file(&entry.name) { "🎥 " } else { "🖼️ " }
            } else if is_markdown_file(&entry.name) {
                "📄 "
            } else {
                "   "
            };

            folder_items.push(ListItem::new(Line::from(vec![
                Span::styled(icon, Style::default().fg(Color::Rgb(148, 161, 178))),
                Span::styled(entry.name.clone(), Style::default()),
            ])).style(style));
        }

        let folders_block = Block::default()
            .borders(Borders::ALL)
            .title(format!("📁 Folders: {}", path_str))
            .border_style(Style::default().fg(folders_border_color));

        let folders_list = List::new(folder_items)
            .block(folders_block);

        f.render_widget(folders_list, sidebar_chunks[1]);

        // Render Content Viewer
        let viewer_border_color = if self.active_section == ActiveSection::Viewer {
            Color::Rgb(59, 130, 246)
        } else {
            Color::Rgb(30, 41, 59)
        };

        let viewer_block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(viewer_border_color));

        if let Some(ref file_path) = self.selected_file {
            let path_str = file_path.to_string_lossy();
            let title = file_path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            
            let viewer_block = viewer_block.title(format!("📄 Viewer: {} ({})", title, path_str));

            if is_media_file(&path_str) {
                let media_type = if is_video_file(&title) { "Video" } else { "Image" };
                let media_lines = vec![
                    Line::from(""),
                    Line::from(vec![
                        Span::styled(format!("  🎞️ Media File: {}", title), Style::default().add_modifier(Modifier::BOLD).fg(Color::Rgb(251, 191, 36)))
                    ]),
                    Line::from(vec![
                        Span::styled(format!("  Type: {}", media_type), Style::default().fg(Color::Rgb(148, 161, 178)))
                    ]),
                    Line::from(vec![
                        Span::styled(format!("  Location: {}", path_str), Style::default().fg(Color::Rgb(148, 161, 178)))
                    ]),
                    Line::from(""),
                    Line::from(vec![
                        Span::styled("  Press ", Style::default().fg(Color::Rgb(148, 161, 178))),
                        Span::styled("Enter", Style::default().add_modifier(Modifier::BOLD).fg(Color::Rgb(59, 130, 246))),
                        Span::styled(" or ", Style::default().fg(Color::Rgb(148, 161, 178))),
                        Span::styled("o", Style::default().add_modifier(Modifier::BOLD).fg(Color::Rgb(59, 130, 246))),
                        Span::styled(" to open this media file in your system default GUI application.", Style::default().fg(Color::Rgb(148, 161, 178))),
                    ]),
                    Line::from(""),
                ];
                let paragraph = Paragraph::new(media_lines)
                    .block(viewer_block);
                f.render_widget(paragraph, pane_chunks[1]);
            } else if let Some(ref text) = self.file_content {
                let paragraph = Paragraph::new(text.clone())
                    .block(viewer_block)
                    .scroll((self.scroll_offset as u16, 0))
                    .wrap(Wrap { trim: false });
                f.render_widget(paragraph, pane_chunks[1]);
            } else {
                let paragraph = Paragraph::new(vec![Line::from("  No content loaded.")])
                    .block(viewer_block);
                f.render_widget(paragraph, pane_chunks[1]);
            }
        } else {
            let viewer_block = viewer_block.title("📄 Welcome");
            
            let landing_text = vec![
                Line::from(""),
                Line::from(vec![
                    Span::styled("    Markdown Workbench TUI", Style::default().fg(Color::Rgb(59, 130, 246)).add_modifier(Modifier::BOLD))
                ]),
                Line::from(vec![
                    Span::styled("    ──────────────────────", Style::default().fg(Color::Rgb(30, 41, 59)))
                ]),
                Line::from(""),
                Line::from(vec![
                    Span::styled("    No File Open.", Style::default().fg(Color::Rgb(240, 243, 248)).add_modifier(Modifier::BOLD))
                ]),
                Line::from("    Select a Markdown (.md) or Media file from the folders list to view it."),
                Line::from(""),
                Line::from(vec![
                    Span::styled("    Keybindings:", Style::default().add_modifier(Modifier::BOLD).fg(Color::Rgb(251, 191, 36)))
                ]),
                Line::from(vec![
                    Span::styled("    Tab / Shift-Tab : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Cycle focus between panels", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    j / k / Arrows  : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Navigate lists and scroll viewer", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    Enter           : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Navigate folder or open/view file", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    Backspace / u   : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Navigate to parent directory", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    p               : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Pin/Unpin current folder to Workspaces", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    e               : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Edit markdown file in terminal $EDITOR", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    o               : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Open selected file in host default GUI app", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(vec![
                    Span::styled("    Esc / q         : ", Style::default().fg(Color::Rgb(148, 161, 178))),
                    Span::styled("Quit application", Style::default().fg(Color::Rgb(240, 243, 248)))
                ]),
                Line::from(""),
            ];
            let paragraph = Paragraph::new(landing_text)
                .block(viewer_block);
            f.render_widget(paragraph, pane_chunks[1]);
        }

        // Render Help/Status Bar at bottom
        let help_bg = Color::Rgb(30, 41, 59);
        let help_fg = Color::Rgb(240, 243, 248);
        let key_color = Color::Rgb(59, 130, 246);

        if let Some(ref err) = self.error {
            let error_span = Span::styled(format!("  ⚠️ Error: {} ", err), Style::default().bg(Color::Red).fg(Color::White).add_modifier(Modifier::BOLD));
            f.render_widget(Paragraph::new(Line::from(vec![error_span])).style(Style::default().bg(help_bg)), main_chunks[1]);
        } else {
            let help_spans = vec![
                Span::styled(" Tab", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Cycle Focus |", Style::default().fg(help_fg)),
                Span::styled(" Enter", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Open/Enter |", Style::default().fg(help_fg)),
                Span::styled(" Backspace/u", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Up Dir |", Style::default().fg(help_fg)),
                Span::styled(" p", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Pin/Unpin |", Style::default().fg(help_fg)),
                Span::styled(" e", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Edit |", Style::default().fg(help_fg)),
                Span::styled(" o", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Open Ext |", Style::default().fg(help_fg)),
                Span::styled(" q/Esc", Style::default().fg(key_color).add_modifier(Modifier::BOLD)),
                Span::styled(" Quit", Style::default().fg(help_fg)),
            ];
            let help_line = Line::from(help_spans);
            let help_paragraph = Paragraph::new(help_line).style(Style::default().bg(help_bg));
            f.render_widget(help_paragraph, main_chunks[1]);
        }
    }
}

pub fn is_media_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg")
        || lower.ends_with(".bmp")
        || lower.ends_with(".ico")
        || lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".ogg")
        || lower.ends_with(".mov")
        || lower.ends_with(".mkv")
}

pub fn is_markdown_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".qmd")
}

pub fn is_video_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".ogg")
        || lower.ends_with(".mov")
        || lower.ends_with(".mkv")
}

pub fn open_system_default(path: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).status()?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd").args(&["/C", "start", "", path]).status()?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open").arg(path).status()?;
    }
    Ok(())
}

pub fn list_directory(path: &Path) -> Result<Vec<FileEntry>> {
    if !path.exists() {
        return Err(anyhow::anyhow!("Directory does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(anyhow::anyhow!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(path)?;

    for entry in read_dir {
        if let Ok(entry) = entry {
            let file_path = entry.path();
            let is_dir = file_path.is_dir();
            let name = entry.file_name().to_string_lossy().into_owned();

            // Skip hidden files/directories
            if name.starts_with('.') {
                continue;
            }

            entries.push(FileEntry {
                name,
                path: file_path.to_string_lossy().into_owned(),
                is_dir,
            });
        }
    }

    // Sort: directories first, then alphabetically by name (case-insensitive)
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

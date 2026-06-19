use std::path::{Path, PathBuf};
use std::env;
use std::sync::Mutex;
use std::collections::HashMap;
use std::io::Write;
use portable_pty::MasterPty;
use serde::{Serialize, Deserialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Debug)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        env::var("USERPROFILE").map(PathBuf::from).ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        env::var("HOME").map(PathBuf::from).ok()
    }
}

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "Could not find home directory".to_string())
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| e.to_string())?;

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

    // Sort: directories first, then alphabetically by name
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

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }
    if path.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", path.display()));
    }

    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.is_dir() {
        return Err(format!("Path is a directory, cannot write content to it: {}", path.display()));
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_terminal(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if !path.exists() || !path.is_dir() {
        return Err("Path does not exist or is not a directory".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(&["-a", "Terminal", &path.to_string_lossy()])
            .status()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "cmd.exe", "/K", &format!("cd /d {}", path.to_string_lossy())])
            .status()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // On Linux, try standard terminal emulators
        let terminals = [
            ("gnome-terminal", &["--working-directory"]),
            ("xfce4-terminal", &["--working-directory"]),
            ("konsole", &["--workdir"]),
            ("xterm", &["-working-directory"]),
        ];
        
        let mut spawned = false;
        for (term, args) in terminals.iter() {
            let mut cmd = std::process::Command::new(term);
            cmd.arg(args[0]).arg(&path);
            if cmd.spawn().is_ok() {
                spawned = true;
                break;
            }
        }
        
        if !spawned {
            // Fallback for generic terminal emulator launcher
            let fallback = std::process::Command::new("x-terminal-emulator")
                .args(&["-e", &format!("cd {} && exec sh", path.to_string_lossy())])
                .spawn();
            if fallback.is_err() {
                return Err("No supported terminal emulator found".to_string());
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn search_directory(path: String, query: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&path);
    if !root.exists() || !root.is_dir() {
        return Err("Invalid directory path".to_string());
    }
    
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    
    fn walk_search(dir: &Path, query_lower: &str, results: &mut Vec<FileEntry>) -> std::io::Result<()> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path_buf = entry.path();
                    let name = entry.file_name().to_string_lossy().into_owned();
                    
                    if name.starts_with('.') {
                        continue;
                    }
                    
                    let is_dir = path_buf.is_dir();
                    
                    if name.to_lowercase().contains(query_lower) {
                        results.push(FileEntry {
                            name: name.clone(),
                            path: path_buf.to_string_lossy().into_owned(),
                            is_dir,
                        });
                    }
                    
                    if is_dir {
                        let _ = walk_search(&path_buf, query_lower, results);
                    }
                }
            }
        }
        Ok(())
    }
    
    let _ = walk_search(root, &query_lower, &mut results);
    
    // Sort: directories first, then alphabetically
    results.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    
    Ok(results)
}

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Default)]
struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

#[derive(Clone, serde::Serialize)]
struct PtyDataPayload {
    session_id: String,
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct PtyExitPayload {
    session_id: String,
}

#[tauri::command]
fn spawn_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, PtySize, CommandBuilder};
    
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    };

    let mut cmd = CommandBuilder::new(&shell);
    
    #[cfg(target_os = "macos")]
    {
        if shell.ends_with("zsh") {
            cmd.args(&["-l"]);
        }
    }

    if let Some(dir) = cwd {
        let path = std::path::PathBuf::from(dir);
        if path.exists() && path.is_dir() {
            cmd.cwd(path);
        }
    }

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let mut sessions = state.sessions.lock().unwrap();
    sessions.insert(
        session_id.clone(),
        PtySession {
            writer,
            master: pair.master,
        },
    );

    let session_id_clone = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            let data = String::from_utf8_lossy(&buf[..n]).into_owned();
            let _ = app_handle.emit(
                "pty-data",
                PtyDataPayload {
                    session_id: session_id_clone.clone(),
                    data,
                },
            );
        }
        let _ = app_handle.emit(
            "pty-exit",
            PtyExitPayload {
                session_id: session_id_clone.clone(),
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn write_to_pty(
    session_id: String,
    data: String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
fn resize_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    use portable_pty::PtySize;
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
fn close_pty(session_id: String, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if sessions.remove(&session_id).is_some() {
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    app.updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map(|u| u.map(|update| update.version))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            get_home_dir,
            list_directory,
            read_file_content,
            write_file_content,
            open_terminal,
            search_directory,
            spawn_pty,
            write_to_pty,
            resize_pty,
            close_pty,
            check_for_updates,
            download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}



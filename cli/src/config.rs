use std::path::PathBuf;
use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Config {
    pub pinned_workspaces: Vec<String>,
}

impl Config {
    pub fn load() -> Self {
        if let Some(config_file) = Self::config_file_path() {
            if config_file.exists() {
                if let Ok(content) = fs::read_to_string(&config_file) {
                    if let Ok(config) = serde_json::from_str::<Config>(&content) {
                        return config;
                    }
                }
            }
        }
        Self::default()
    }

    pub fn save(&self) -> Result<(), anyhow::Error> {
        if let Some(config_file) = Self::config_file_path() {
            if let Some(parent) = config_file.parent() {
                fs::create_dir_all(parent)?;
            }
            let content = serde_json::to_string_pretty(self)?;
            fs::write(config_file, content)?;
        }
        Ok(())
    }

    fn config_file_path() -> Option<PathBuf> {
        dirs::config_dir().map(|mut p| {
            p.push("workbench-cli");
            p.push("config.json");
            p
        })
    }
}

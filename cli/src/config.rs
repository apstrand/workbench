use std::path::PathBuf;
use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    List,
    Tree,
}

impl Default for ViewMode {
    fn default() -> Self {
        ViewMode::List
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct PinnedItem {
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
}

impl<'de> Deserialize<'de> for PinnedItem {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Helper {
            String(String),
            Struct {
                path: String,
                #[serde(rename = "isDir")]
                is_dir: bool,
            },
        }

        match Helper::deserialize(deserializer)? {
            Helper::String(path) => {
                let is_dir = !std::path::Path::new(&path).is_file();
                Ok(PinnedItem { path, is_dir })
            }
            Helper::Struct { path, is_dir } => Ok(PinnedItem { path, is_dir }),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Config {
    pub pinned_workspaces: Vec<PinnedItem>,
    #[serde(default)]
    pub view_mode: ViewMode,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pinned_item_deserialization() {
        let old_json = r#"{
            "pinned_workspaces": [
                "/Users/peter/dir1",
                "/Users/peter/file1.md"
            ]
        }"#;

        let config: Config = serde_json::from_str(old_json).unwrap();
        assert_eq!(config.pinned_workspaces.len(), 2);
        assert_eq!(config.pinned_workspaces[0].path, "/Users/peter/dir1");
        assert!(config.pinned_workspaces[0].is_dir);

        let new_json = r#"{
            "pinned_workspaces": [
                { "path": "/Users/peter/dir1", "isDir": true },
                { "path": "/Users/peter/file1.md", "isDir": false }
            ],
            "view_mode": "tree"
        }"#;

        let config2: Config = serde_json::from_str(new_json).unwrap();
        assert_eq!(config2.pinned_workspaces.len(), 2);
        assert_eq!(config2.pinned_workspaces[0].path, "/Users/peter/dir1");
        assert!(config2.pinned_workspaces[0].is_dir);
        assert_eq!(config2.pinned_workspaces[1].path, "/Users/peter/file1.md");
        assert!(!config2.pinned_workspaces[1].is_dir);
        assert_eq!(config2.view_mode, ViewMode::Tree);
    }
}



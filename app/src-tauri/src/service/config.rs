use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

pub struct ConfigService;

impl ConfigService {
    fn resolve_resource_path(app: &tauri::AppHandle) -> Option<PathBuf> {
        app.path()
            .resolve(
                "resources/bin/config.json",
                tauri::path::BaseDirectory::Resource,
            )
            .ok()
            .filter(|p| p.is_file())
    }

    fn resolve_dev_path() -> Option<PathBuf> {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        log::info!("Current working directory: {:?}", cwd);

        let candidates = [
            cwd.join("resources/bin/config.json"),
            cwd.join("../config.json"),
            cwd.join("../../config.json"),
            cwd.join("../../../config.json"),
        ];
        let result = candidates.into_iter().find(|p| p.is_file());
        log::info!("Selected config path: {:?}", result);
        result
    }

    fn resolve_write_path(app: &tauri::AppHandle) -> Option<PathBuf> {
        Self::resolve_dev_path().or_else(|| Self::resolve_resource_path(app))
    }

    pub fn get_app_config(app: &tauri::AppHandle) -> Result<Value, String> {
        // 优先尝试资源目录下存在的文件，否则再走开发路径
        let path = Self::resolve_resource_path(app)
            .or_else(Self::resolve_dev_path)
            .ok_or_else(|| "config.json not found (resource/dev)".to_string())?;

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("read config.json failed: {}", e))?;
        let json: Value = serde_json::from_str(&content)
            .map_err(|e| format!("parse config.json failed: {}", e))?;

        let os_key = match std::env::consts::OS {
            "macos" => "macos",
            "windows" => "windows",
            "linux" => "linux",
            other => other,
        };

        let per_os = json
            .get(os_key)
            .cloned()
            .ok_or_else(|| format!("config.json missing key for current OS: {}", os_key))?;

        Ok(per_os)
    }

    pub fn update_selection(
        app: &tauri::AppHandle,
        category: &str,
        protocol: &str,
        name: &str,
    ) -> Result<Value, String> {
        let path = Self::resolve_write_path(app)
            .ok_or_else(|| "config.json not found (resource/dev)".to_string())?;

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("read config.json failed: {}", e))?;
        let mut json: Value = serde_json::from_str(&content)
            .map_err(|e| format!("parse config.json failed: {}", e))?;

        let os_key = match std::env::consts::OS {
            "macos" => "macos",
            "windows" => "windows",
            "linux" => "linux",
            other => other,
        };

        let arr = json
            .get_mut(os_key)
            .and_then(|os| os.get_mut(category))
            .and_then(|v| v.as_array_mut())
            .ok_or_else(|| format!("invalid config path: {}.{}", os_key, category))?;

        let mut found = false;

        for item in arr.iter_mut() {
            if let Some(mf) = item.get_mut("match_first") {
                if let Some(list) = mf.as_array_mut() {
                    list.retain(|v| v.as_str().map(|s| s != protocol).unwrap_or(true));
                }
            }
        }

        for item in arr.iter_mut() {
            let item_name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if item_name == name {
                found = true;
                if !item.get("match_first").is_some() {
                    item.as_object_mut()
                        .unwrap()
                        .insert("match_first".into(), Value::Array(vec![]));
                }
                if let Some(list) = item.get_mut("match_first").and_then(|v| v.as_array_mut()) {
                    list.push(Value::String(protocol.to_string()));
                }
                break;
            }
        }

        if !found {
            return Err(format!(
                "selected item '{}' not found under {}.{}",
                name, os_key, category
            ));
        }

        let pretty = serde_json::to_string_pretty(&json)
            .map_err(|e| format!("serialize config.json failed: {}", e))?;
        std::fs::write(&path, pretty).map_err(|e| format!("write config.json failed: {}", e))?;

        Ok(json
            .get(os_key)
            .cloned()
            .ok_or_else(|| format!("config.json missing key for current OS: {}", os_key))?)
    }
}

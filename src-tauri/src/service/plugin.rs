use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

const CATEGORIES: &[&str] = &["terminal", "remotedesktop", "filetransfer", "databases"];

pub struct PluginService;

impl PluginService {
    fn os_key() -> &'static str {
        match std::env::consts::OS {
            "macos" => "macos",
            "windows" => "windows",
            "linux" => "linux",
            other => other,
        }
    }

    fn resolve_builtin_dir(app: &AppHandle) -> Option<PathBuf> {
        let resource = app
            .path()
            .resolve("plugins/builtin", tauri::path::BaseDirectory::Resource)
            .ok()
            .filter(|p| p.join("index.json").is_file());

        if resource.is_some() {
            return resource;
        }

        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let candidates = [
            cwd.join("plugins/builtin"),
            cwd.join("../plugins/builtin"),
            cwd.join("../../plugins/builtin"),
        ];
        candidates.into_iter().find(|p| p.join("index.json").is_file())
    }

    fn resolve_defaults_path(app: &AppHandle) -> Option<PathBuf> {
        let resource = app
            .path()
            .resolve(
                "plugins/plugins-state.defaults.json",
                tauri::path::BaseDirectory::Resource,
            )
            .ok()
            .filter(|p| p.is_file());

        if resource.is_some() {
            return resource;
        }

        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let candidates = [
            cwd.join("plugins/plugins-state.defaults.json"),
            cwd.join("../plugins/plugins-state.defaults.json"),
        ];
        candidates.into_iter().find(|p| p.is_file())
    }

    fn read_json(path: &Path) -> Result<Value, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("read {} failed: {}", path.display(), e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("parse {} failed: {}", path.display(), e))
    }

    fn launch_to_arg_format(launch: &Value) -> (String, Option<Value>) {
        let launch_type = launch.get("type").and_then(|v| v.as_str()).unwrap_or("args");
        match launch_type {
            "autoit" => (
                String::new(),
                launch.get("steps").cloned(),
            ),
            "file" => {
                let template = launch
                    .get("arg_template")
                    .and_then(|v| v.as_str())
                    .unwrap_or("{file}");
                (template.to_string(), None)
            }
            _ => {
                let template = launch
                    .get("template")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                (template.to_string(), None)
            }
        }
    }

    fn resolve_path(
        plugin_id: &str,
        platform_defaults: &Value,
        platform_connect: &Value,
        user_state: &Value,
    ) -> (String, bool, bool) {
        let user_plugins = user_state.get("plugins").and_then(|v| v.as_object());
        let user_plugin = user_plugins.and_then(|m| m.get(plugin_id));

        let user_path = user_plugin
            .and_then(|p| p.get("path"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let default_path = platform_defaults
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let exec_default = platform_connect
            .get("executable")
            .and_then(|e| e.get("default"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let path = user_path
            .clone()
            .unwrap_or_else(|| {
                if !default_path.is_empty() {
                    default_path
                } else {
                    exec_default
                }
            });

        let is_internal = platform_defaults
            .get("is_internal")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let is_set = platform_defaults
            .get("is_set")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || user_path.is_some()
            || (!path.is_empty() && is_internal);

        let enabled = user_plugin
            .and_then(|p| p.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        (path, is_set && enabled, is_internal)
    }

    fn executable_type(platform_connect: &Value) -> &str {
        platform_connect
            .get("executable")
            .and_then(|e| e.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
    }

    fn user_path_exists(platform_connect: &Value, path: &str) -> bool {
        if Self::executable_type(platform_connect) != "user_path" {
            return true;
        }
        let trimmed = path.trim();
        !trimmed.is_empty() && Path::new(trimmed).is_file()
    }

    fn validate_user_path_executable(
        platform_connect: &Value,
        platform_defaults: &Value,
        user_state: &Value,
        plugin_id: &str,
    ) -> Result<(), String> {
        if Self::executable_type(platform_connect) != "user_path" {
            return Ok(());
        }

        let (path, _, _) =
            Self::resolve_path(plugin_id, platform_defaults, platform_connect, user_state);
        if Self::user_path_exists(platform_connect, &path) {
            return Ok(());
        }

        if path.trim().is_empty() {
            return Err("executable not found".to_string());
        }

        Err(format!("executable not found: {}", path.trim()))
    }

    fn build_match_first(
        plugin_id: &str,
        category: &str,
        protocols: &[Value],
        selections: &Map<String, Value>,
    ) -> Vec<Value> {
        let mut matched = Vec::new();
        for protocol in protocols {
            let Some(proto) = protocol.as_str() else {
                continue;
            };
            let key = format!("{category}:{proto}");
            if selections.get(&key).and_then(|v| v.as_str()) == Some(plugin_id) {
                matched.push(Value::String(proto.to_string()));
            }
        }
        matched
    }

    fn plugin_to_app_item(
        plugin_id: &str,
        plugin_dir: &Path,
        os_key: &str,
        selections: &Map<String, Value>,
        user_state: &Value,
    ) -> Result<Option<Value>, String> {
        let manifest = Self::read_json(&plugin_dir.join("manifest.json"))?;
        let connect = Self::read_json(&plugin_dir.join("connect.json"))?;
        let defaults = Self::read_json(&plugin_dir.join("defaults.json")).unwrap_or(json!({}));

        let platform_connect = connect
            .get("platforms")
            .and_then(|p| p.get(os_key));
        let Some(platform_connect) = platform_connect else {
            return Ok(None);
        };

        let platform_defaults = defaults
            .get("platforms")
            .and_then(|p| p.get(os_key))
            .unwrap_or(&Value::Null);

        let category = manifest
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let protocols = manifest
            .get("protocols")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let display_name = platform_connect
            .get("display_name")
            .and_then(|v| v.as_str())
            .or_else(|| manifest.get("display_name").and_then(|v| v.as_str()))
            .unwrap_or(plugin_id);

        let launch = platform_connect
            .get("launch")
            .unwrap_or(&Value::Null);
        let (arg_format, autoit) = Self::launch_to_arg_format(launch);

        let (path, is_set, is_internal) =
            Self::resolve_path(plugin_id, platform_defaults, platform_connect, user_state);

        let executable_type = Self::executable_type(platform_connect);
        let path_exists = Self::user_path_exists(platform_connect, &path);

        let match_first = Self::build_match_first(plugin_id, category, &protocols, selections);

        let is_default = platform_defaults
            .get("is_default")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let mut item = json!({
            "name": manifest.get("name").and_then(|v| v.as_str()).unwrap_or(""),
            "display_name": display_name,
            "protocol": protocols,
            "comment": manifest.get("comment").cloned().unwrap_or(json!({})),
            "download_url": manifest.get("download_url").and_then(|v| v.as_str()).unwrap_or(""),
            "type": category,
            "path": path,
            "arg_format": arg_format,
            "match_first": match_first,
            "is_internal": is_internal,
            "is_default": is_default,
            "is_set": is_set,
            "executable_type": executable_type,
            "path_exists": path_exists,
            "_plugin_id": plugin_id,
        });

        if let Some(steps) = autoit {
            item.as_object_mut()
                .unwrap()
                .insert("autoit".to_string(), steps);
        }

        Ok(Some(item))
    }

    fn load_user_state(app: &AppHandle, config_dir: &Path) -> Value {
        let state_path = config_dir.join("plugins-state.json");
        if state_path.is_file() {
            if let Ok(state) = Self::read_json(&state_path) {
                return state;
            }
        }

        if let Some(defaults_path) = Self::resolve_defaults_path(app) {
            if let Ok(state) = Self::read_json(&defaults_path) {
                let _ = fs::copy(&defaults_path, &state_path);
                return state;
            }
        }

        json!({ "version": 1, "selections": {}, "plugins": {} })
    }

    pub fn build_app_config(app: &AppHandle, config_dir: &Path) -> Result<Value, String> {
        let builtin_dir = Self::resolve_builtin_dir(app)
            .ok_or_else(|| "plugins/builtin not found".to_string())?;
        let index = Self::read_json(&builtin_dir.join("index.json"))?;
        let plugins = index
            .get("plugins")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "invalid plugins/builtin/index.json".to_string())?;

        let user_state = Self::load_user_state(app, config_dir);
        let selections = user_state
            .get("selections")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();

        let os_key = Self::os_key();
        let mut per_category: HashMap<String, Vec<Value>> = HashMap::new();
        for cat in CATEGORIES {
            per_category.insert((*cat).to_string(), Vec::new());
        }

        for entry in plugins {
            let plugin_id = entry
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "plugin entry missing id".to_string())?;
            let category = entry
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let plugin_dir = builtin_dir.join(plugin_id);
            if !plugin_dir.is_dir() {
                log::warn!("Plugin directory not found: {:?}", plugin_dir);
                continue;
            }

            if let Some(item) = Self::plugin_to_app_item(
                plugin_id,
                &plugin_dir,
                os_key,
                &selections,
                &user_state,
            )? {
                if let Some(list) = per_category.get_mut(category) {
                    list.push(item);
                }
            }
        }

        // Fallback: if no selection for a protocol, use defaults.json match_first
        Self::apply_default_match_first(&mut per_category, &builtin_dir, plugins, os_key);

        Ok(json!({
            "terminal": per_category.get("terminal").cloned().unwrap_or_default(),
            "remotedesktop": per_category.get("remotedesktop").cloned().unwrap_or_default(),
            "filetransfer": per_category.get("filetransfer").cloned().unwrap_or_default(),
            "databases": per_category.get("databases").cloned().unwrap_or_default(),
        }))
    }

    fn apply_default_match_first(
        per_category: &mut HashMap<String, Vec<Value>>,
        builtin_dir: &Path,
        plugins: &[Value],
        os_key: &str,
    ) {
        let protocols_with_selection: HashSet<String> = per_category
            .values()
            .flat_map(|items| items.iter())
            .flat_map(|item| {
                item.get("match_first")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default()
            })
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        for entry in plugins {
            let Some(plugin_id) = entry.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(category) = entry.get("category").and_then(|v| v.as_str()) else {
                continue;
            };
            let Ok(defaults) = Self::read_json(&builtin_dir.join(plugin_id).join("defaults.json"))
            else {
                continue;
            };
            let Some(platform_defaults) = defaults
                .get("platforms")
                .and_then(|p| p.get(os_key))
            else {
                continue;
            };
            let default_match = platform_defaults
                .get("match_first")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            for proto_val in default_match {
                let Some(proto) = proto_val.as_str() else {
                    continue;
                };
                if protocols_with_selection.contains(proto) {
                    continue;
                }
                if let Some(items) = per_category.get_mut(category) {
                    for item in items.iter_mut() {
                        if item.get("_plugin_id").and_then(|v| v.as_str()) == Some(plugin_id) {
                            item.as_object_mut()
                                .unwrap()
                                .entry("match_first")
                                .or_insert(json!([]))
                                .as_array_mut()
                                .unwrap()
                                .push(Value::String(proto.to_string()));
                        }
                    }
                }
            }
        }

        // strip internal _plugin_id before returning to frontend
        for items in per_category.values_mut() {
            for item in items.iter_mut() {
                if let Some(obj) = item.as_object_mut() {
                    obj.remove("_plugin_id");
                }
            }
        }
    }

    pub fn is_plugins_enabled(config: &Value) -> bool {
        config
            .get("_plugins")
            .and_then(|p| p.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }

    fn find_plugin_id_by_name(builtin_dir: &Path, name: &str, category: &str) -> Option<String> {
        let index = Self::read_json(&builtin_dir.join("index.json")).ok()?;
        index.get("plugins")?.as_array()?.iter().find_map(|entry| {
            let id = entry.get("id")?.as_str()?;
            let entry_name = entry.get("name")?.as_str()?;
            let entry_category = entry.get("category")?.as_str()?;
            if entry_name == name && entry_category == category {
                Some(id.to_string())
            } else {
                None
            }
        })
    }

    pub fn update_selection(
        app: &AppHandle,
        config_dir: &Path,
        category: &str,
        protocol: &str,
        name: &str,
        new_path: Option<String>,
    ) -> Result<Value, String> {
        let builtin_dir = Self::resolve_builtin_dir(app)
            .ok_or_else(|| "plugins/builtin not found".to_string())?;
        let plugin_id = Self::find_plugin_id_by_name(&builtin_dir, name, category).ok_or_else(|| {
            format!("plugin '{name}' not found in category '{category}'")
        })?;

        let state_path = config_dir.join("plugins-state.json");
        let mut state = Self::load_user_state(app, config_dir);

        let connect = Self::read_json(&builtin_dir.join(&plugin_id).join("connect.json"))?;
        let defaults =
            Self::read_json(&builtin_dir.join(&plugin_id).join("defaults.json")).unwrap_or(json!({}));
        let os_key = Self::os_key();
        let platform_connect = connect
            .get("platforms")
            .and_then(|p| p.get(os_key))
            .ok_or_else(|| format!("plugin '{name}' has no config for OS '{os_key}'"))?;
        let platform_defaults = defaults
            .get("platforms")
            .and_then(|p| p.get(os_key))
            .unwrap_or(&Value::Null);

        if let Some(p) = new_path {
            let trimmed = p.trim();
            if !trimmed.is_empty() {
                let state_obj = state.as_object_mut().ok_or("invalid plugins-state")?;
                let plugins = state_obj
                    .entry("plugins")
                    .or_insert(json!({}))
                    .as_object_mut()
                    .unwrap();
                let entry = plugins
                    .entry(plugin_id.clone())
                    .or_insert(json!({}))
                    .as_object_mut()
                    .unwrap();
                entry.insert("path".into(), Value::String(trimmed.to_string()));
                entry.insert("enabled".into(), Value::Bool(true));

                let pretty = serde_json::to_string_pretty(&state)
                    .map_err(|e| format!("serialize plugins-state.json failed: {}", e))?;
                fs::write(&state_path, pretty)
                    .map_err(|e| format!("write plugins-state.json failed: {}", e))?;

                return Self::build_app_config(app, config_dir);
            }
        }

        Self::validate_user_path_executable(
            platform_connect,
            platform_defaults,
            &state,
            &plugin_id,
        )?;

        let state_obj = state.as_object_mut().ok_or("invalid plugins-state")?;
        let selection_key = format!("{category}:{protocol}");
        state_obj
            .entry("selections")
            .or_insert(json!({}))
            .as_object_mut()
            .unwrap()
            .insert(selection_key, Value::String(plugin_id));

        let pretty = serde_json::to_string_pretty(&state)
            .map_err(|e| format!("serialize plugins-state.json failed: {}", e))?;
        fs::write(&state_path, pretty)
            .map_err(|e| format!("write plugins-state.json failed: {}", e))?;

        Self::build_app_config(app, config_dir)
    }
}

use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::path::BaseDirectory;
use tauri::AppHandle;
use tauri::Manager;
use zip::ZipArchive;

const CATEGORIES: &[&str] = &["terminal", "remotedesktop", "filetransfer", "databases"];

struct PluginEntry {
    id: String,
    category: String,
    plugin_dir: PathBuf,
    builtin: bool,
}

pub struct PluginService;

impl PluginService {
    fn custom_terminal_slug(raw: &str) -> String {
        let mut slug = String::new();
        let mut last_dash = false;
        for ch in raw.trim().chars() {
            let lower = ch.to_ascii_lowercase();
            if lower.is_ascii_alphanumeric() {
                slug.push(lower);
                last_dash = false;
            } else if !last_dash {
                slug.push('-');
                last_dash = true;
            }
        }
        slug.trim_matches('-').to_string()
    }

    fn os_key() -> &'static str {
        match std::env::consts::OS {
            "macos" => "macos",
            "windows" => "windows",
            "linux" => "linux",
            other => other,
        }
    }

    fn resolve_resource_dir(app: &AppHandle, candidates: &[&str], marker: &str) -> Option<PathBuf> {
        for candidate in candidates {
            let Ok(path) = app.path().resolve(candidate, BaseDirectory::Resource) else {
                continue;
            };

            if path.join(marker).is_file() {
                log::debug!("Resolved resource dir '{}' to {:?}", candidate, path);
                return Some(path);
            }
        }

        None
    }

    fn resolve_resource_file(app: &AppHandle, candidates: &[&str]) -> Option<PathBuf> {
        for candidate in candidates {
            let Ok(path) = app.path().resolve(candidate, BaseDirectory::Resource) else {
                continue;
            };

            if path.is_file() {
                log::debug!("Resolved resource file '{}' to {:?}", candidate, path);
                return Some(path);
            }
        }

        None
    }

    fn resolve_builtin_dir(app: &AppHandle) -> Option<PathBuf> {
        let os_key = Self::os_key();
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let development_candidates = [
            cwd.join("plugins").join(os_key),
            cwd.join("../plugins").join(os_key),
            cwd.join("../../plugins").join(os_key),
        ];

        if cfg!(debug_assertions) {
            if let Some(path) = development_candidates
                .iter()
                .find(|path| path.join("index.json").is_file())
            {
                return Some(path.clone());
            }
        }

        let resource_candidates = [
            format!("resources/plugins/{os_key}"),
            format!("plugins/{os_key}"),
            os_key.to_string(),
            "resources/plugins/builtin".to_string(),
            "plugins/builtin".to_string(),
            "builtin".to_string(),
        ];
        let resource_refs: Vec<&str> = resource_candidates.iter().map(String::as_str).collect();
        let resource = Self::resolve_resource_dir(app, &resource_refs, "index.json");

        if resource.is_some() {
            return resource;
        }

        let candidates = [
            development_candidates[0].clone(),
            development_candidates[1].clone(),
            development_candidates[2].clone(),
            cwd.join("plugins/builtin"),
            cwd.join("../plugins/builtin"),
            cwd.join("../../plugins/builtin"),
        ];
        candidates
            .into_iter()
            .find(|p| p.join("index.json").is_file())
    }

    fn resolve_defaults_path(app: &AppHandle) -> Option<PathBuf> {
        let os_key = Self::os_key();
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let development_candidates = [
            cwd.join("plugins")
                .join(os_key)
                .join("plugins-state.defaults.json"),
            cwd.join("../plugins")
                .join(os_key)
                .join("plugins-state.defaults.json"),
            cwd.join("../../plugins")
                .join(os_key)
                .join("plugins-state.defaults.json"),
        ];

        if cfg!(debug_assertions) {
            if let Some(path) = development_candidates.iter().find(|path| path.is_file()) {
                return Some(path.clone());
            }
        }

        let resource_candidates = [
            format!("resources/plugins/{os_key}/plugins-state.defaults.json"),
            format!("plugins/{os_key}/plugins-state.defaults.json"),
            format!("{os_key}/plugins-state.defaults.json"),
            "resources/plugins/plugins-state.defaults.json".to_string(),
            "plugins/plugins-state.defaults.json".to_string(),
            "plugins-state.defaults.json".to_string(),
        ];
        let resource_refs: Vec<&str> = resource_candidates.iter().map(String::as_str).collect();
        let resource = Self::resolve_resource_file(app, &resource_refs);

        if resource.is_some() {
            return resource;
        }

        let candidates = [
            development_candidates[0].clone(),
            development_candidates[1].clone(),
            development_candidates[2].clone(),
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

    fn read_manifest(plugin_dir: &Path) -> Result<Value, String> {
        Self::read_json(&plugin_dir.join("manifest.json"))
    }

    fn read_connect(plugin_dir: &Path) -> Result<Value, String> {
        Self::read_json(&plugin_dir.join("connect.json"))
    }

    fn normalize_plugin_id(raw: &str) -> Result<String, String> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err("plugin id is empty".to_string());
        }
        if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
            return Err(format!("invalid plugin id '{}'", trimmed));
        }
        Ok(trimmed.to_string())
    }

    fn user_plugins_dir(config_dir: &Path) -> PathBuf {
        config_dir.join("plugins")
    }

    fn icon_path(plugin_dir: &Path) -> String {
        let icon = plugin_dir.join("icon.png");
        if icon.is_file() {
            icon.to_string_lossy().to_string()
        } else {
            String::new()
        }
    }

    fn sanitize_user_state(state: &mut Value) -> bool {
        let Some(state_obj) = state.as_object_mut() else {
            return false;
        };

        let mut changed = false;
        let os_key = Self::os_key();
        if let Some(selections) = state_obj
            .get_mut("selections")
            .and_then(|v| v.as_object_mut())
        {
            for value in selections.values_mut() {
                if let Some(plugin_id) = value.as_str() {
                    if let Some(suffix) = plugin_id.strip_prefix("builtin.") {
                        *value = Value::String(format!("{os_key}.{suffix}"));
                        changed = true;
                    }
                }
            }
        }
        if let Some(plugins) = state_obj.get_mut("plugins").and_then(|v| v.as_object_mut()) {
            let legacy_entries: Vec<(String, Value)> = plugins
                .iter()
                .filter_map(|(key, value)| {
                    key.strip_prefix("builtin.")
                        .map(|suffix| (format!("{os_key}.{suffix}"), value.clone()))
                })
                .collect();
            for (key, value) in legacy_entries {
                plugins.insert(key, value);
                changed = true;
            }
            plugins.retain(|key, _| !key.starts_with("builtin."));
        }

        if Self::os_key() != "windows" {
            if let Some(selections) = state_obj
                .get_mut("selections")
                .and_then(|v| v.as_object_mut())
            {
                for key in ["terminal:ssh", "terminal:telnet"] {
                    if selections.get(key).and_then(|v| v.as_str())
                        == Some(&format!("{os_key}.putty"))
                    {
                        selections
                            .insert(key.to_string(), Value::String(format!("{os_key}.terminal")));
                        changed = true;
                    }
                }
            }
        }

        if Self::os_key() == "linux" {
            if let Some(selections) = state_obj
                .get_mut("selections")
                .and_then(|v| v.as_object_mut())
            {
                match selections.get("remotedesktop:rdp").and_then(|v| v.as_str()) {
                    Some("linux.mstsc") | Some("linux.remmina") => {
                        selections.insert(
                            "remotedesktop:rdp".to_string(),
                            Value::String("linux.xfreerdp".to_string()),
                        );
                        changed = true;
                    }
                    _ => {}
                }
            }
        }
        let should_remove_sftp_iterm = state_obj
            .get("selections")
            .and_then(|v| v.get("filetransfer:sftp"))
            .and_then(|v| v.as_str())
            == Some(&format!("{os_key}.iterm-sftp"));

        if !should_remove_sftp_iterm {
            return changed;
        }

        let has_user_override = state_obj
            .get("plugins")
            .and_then(|v| v.get(format!("{os_key}.iterm-sftp")))
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                    || obj
                        .get("path")
                        .and_then(|v| v.as_str())
                        .map(|s| !s.trim().is_empty())
                        .unwrap_or(false)
            })
            .unwrap_or(false);

        if has_user_override {
            return changed;
        }

        if let Some(selections) = state_obj
            .get_mut("selections")
            .and_then(|v| v.as_object_mut())
        {
            if selections.remove("filetransfer:sftp").is_some() {
                changed = true;
            }
        }
        changed
    }

    fn launch_to_arg_format(launch: &Value) -> (String, Option<Value>) {
        let launch_type = launch
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("args");
        match launch_type {
            "autoit" => (String::new(), launch.get("steps").cloned()),
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

    fn platform_connect(connect: &Value, os_key: &str) -> Option<Value> {
        if let Some(platform_connect) = connect.get("platforms").and_then(|p| p.get(os_key)) {
            return Some(platform_connect.clone());
        }

        if connect.get("executable").is_some() {
            return Some(connect.clone());
        }

        None
    }

    fn resolve_path(
        plugin_id: &str,
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

        let exec_default = platform_connect
            .get("executable")
            .and_then(|e| e.get("default"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let path = user_path.clone().unwrap_or(exec_default);

        let is_internal = platform_connect
            .get("is_internal")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let is_set = platform_connect
            .get("is_set")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || user_path.is_some()
            || (!path.is_empty() && is_internal && user_plugin.is_some());

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

    fn configured_path_exists(platform_connect: &Value, path: &str) -> bool {
        let executable_type = Self::executable_type(platform_connect);
        let trimmed = path.trim();
        match executable_type {
            "user_path" => !trimmed.is_empty() && Path::new(trimmed).is_file(),
            "application_bundle" => !trimmed.is_empty() && Path::new(trimmed).is_dir(),
            _ => true,
        }
    }

    fn validate_configured_executable(
        platform_connect: &Value,
        user_state: &Value,
        plugin_id: &str,
    ) -> Result<(), String> {
        if !matches!(
            Self::executable_type(platform_connect),
            "user_path" | "application_bundle"
        ) {
            return Ok(());
        }

        let (path, _, _) = Self::resolve_path(plugin_id, platform_connect, user_state);
        if Self::configured_path_exists(platform_connect, &path) {
            return Ok(());
        }

        if path.trim().is_empty() {
            return Err("executable not found: (empty path)".to_string());
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

    fn build_enabled_protocols(
        plugin_id: &str,
        category: &str,
        protocols: &[Value],
        selections: &Map<String, Value>,
        enabled_selections: &Map<String, Value>,
    ) -> Vec<Value> {
        let mut enabled = Vec::new();
        for protocol in protocols {
            let Some(proto) = protocol.as_str() else {
                continue;
            };
            let key = format!("{category}:{proto}");
            let explicitly_enabled = enabled_selections
                .get(&key)
                .and_then(|value| value.as_array())
                .map(|items| items.iter().any(|item| item.as_str() == Some(plugin_id)));
            let is_enabled = explicitly_enabled.unwrap_or_else(|| {
                selections.get(&key).and_then(|value| value.as_str()) == Some(plugin_id)
            });
            if is_enabled {
                enabled.push(Value::String(proto.to_string()));
            }
        }
        enabled
    }

    fn plugin_to_app_item(
        plugin_entry: &PluginEntry,
        os_key: &str,
        selections: &Map<String, Value>,
        user_state: &Value,
    ) -> Result<Option<Value>, String> {
        let manifest = Self::read_manifest(&plugin_entry.plugin_dir)?;
        let connect = Self::read_connect(&plugin_entry.plugin_dir)?;

        let Some(platform_connect) = Self::platform_connect(&connect, os_key) else {
            return Ok(None);
        };

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
            .unwrap_or(plugin_entry.id.as_str());

        let launch = platform_connect.get("launch").unwrap_or(&Value::Null);
        let (arg_format, autoit) = Self::launch_to_arg_format(launch);

        let (path, mut is_set, is_internal) =
            Self::resolve_path(&plugin_entry.id, &platform_connect, user_state);

        let executable_type = Self::executable_type(&platform_connect);
        let path_exists = Self::configured_path_exists(&platform_connect, &path);

        let match_first =
            Self::build_match_first(&plugin_entry.id, category, &protocols, selections);
        let enabled_selections = user_state
            .get("enabled_selections")
            .and_then(|value| value.as_object())
            .cloned()
            .unwrap_or_default();
        let enabled_protocols = Self::build_enabled_protocols(
            &plugin_entry.id,
            category,
            &protocols,
            selections,
            &enabled_selections,
        );
        if !enabled_protocols.is_empty() {
            is_set = true;
        }

        let is_default = platform_connect
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
            "launch_type": launch.get("type").and_then(|v| v.as_str()).unwrap_or("args"),
            "open_with": launch.get("open_with").and_then(|v| v.as_str()).unwrap_or(""),
            "launch_driver": launch.get("driver").and_then(|v| v.as_str()).unwrap_or(""),
            "application_id": launch.get("application_id").and_then(|v| v.as_str()).unwrap_or(""),
            "script_path": launch.get("script").and_then(|v| v.as_str()).unwrap_or(""),
            "script_interpreter": launch.get("interpreter").and_then(|v| v.as_str()).unwrap_or(""),
            "use_ssh_helper": launch.get("use_ssh_helper").and_then(|v| v.as_bool()).unwrap_or(false),
            "protocol_aliases": launch.get("protocol_aliases").cloned().unwrap_or(json!({})),
            "protocol_templates": launch.get("protocol_templates").cloned().unwrap_or(json!({})),
            "env": platform_connect.get("env").cloned().unwrap_or(json!({})),
            "match_first": match_first,
            "enabled_protocols": enabled_protocols,
            "is_internal": is_internal,
            "is_default": is_default,
            "is_set": is_set,
            "executable_type": executable_type,
            "path_exists": path_exists,
            "plugin_id": plugin_entry.id,
            "plugin_dir": plugin_entry.plugin_dir,
            "builtin": plugin_entry.builtin,
            "icon_path": Self::icon_path(&plugin_entry.plugin_dir),
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
            if let Ok(mut state) = Self::read_json(&state_path) {
                if Self::sanitize_user_state(&mut state) {
                    if let Ok(pretty) = serde_json::to_string_pretty(&state) {
                        let _ = fs::write(&state_path, pretty);
                    }
                }
                return state;
            }
        }

        if let Some(defaults_path) = Self::resolve_defaults_path(app) {
            if let Ok(mut state) = Self::read_json(&defaults_path) {
                Self::sanitize_user_state(&mut state);
                if let Ok(pretty) = serde_json::to_string_pretty(&state) {
                    let _ = fs::write(&state_path, pretty);
                } else {
                    let _ = fs::copy(&defaults_path, &state_path);
                }
                return state;
            }
        }

        json!({ "version": 1, "selections": {}, "plugins": {} })
    }

    fn builtin_entries(app: &AppHandle) -> Result<Vec<PluginEntry>, String> {
        let builtin_dir = Self::resolve_builtin_dir(app)
            .ok_or_else(|| "platform plugins directory not found".to_string())?;
        let index = Self::read_json(&builtin_dir.join("index.json"))?;
        let plugins = index
            .get("plugins")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "invalid platform plugins index.json".to_string())?;

        let mut entries = Vec::new();
        for entry in plugins {
            let plugin_id = entry
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "plugin entry missing id".to_string())?;
            let category = entry
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let plugin_dir = builtin_dir.join(plugin_id);
            if !plugin_dir.is_dir() {
                log::warn!("Plugin directory not found: {:?}", plugin_dir);
                continue;
            }
            entries.push(PluginEntry {
                id: plugin_id.to_string(),
                category,
                plugin_dir,
                builtin: true,
            });
        }
        Ok(entries)
    }

    fn installed_entries(
        config_dir: &Path,
        builtin_ids: &HashSet<String>,
    ) -> Result<Vec<PluginEntry>, String> {
        let user_dir = Self::user_plugins_dir(config_dir);
        if !user_dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut dirs: Vec<PathBuf> = fs::read_dir(&user_dir)
            .map_err(|e| format!("read {} failed: {}", user_dir.display(), e))?
            .filter_map(|entry| entry.ok().map(|item| item.path()))
            .filter(|path| path.is_dir())
            .collect();
        dirs.sort();

        let mut entries = Vec::new();
        for plugin_dir in dirs {
            let manifest = match Self::read_manifest(&plugin_dir) {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("Skip invalid installed plugin {:?}: {}", plugin_dir, error);
                    continue;
                }
            };
            let raw_id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let plugin_id = match Self::normalize_plugin_id(raw_id) {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("Skip installed plugin {:?}: {}", plugin_dir, error);
                    continue;
                }
            };
            if builtin_ids.contains(&plugin_id) {
                log::warn!(
                    "Skip installed plugin '{}' because it conflicts with builtin plugin",
                    plugin_id
                );
                continue;
            }
            let category = manifest
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            entries.push(PluginEntry {
                id: plugin_id,
                category,
                plugin_dir,
                builtin: false,
            });
        }
        Ok(entries)
    }

    fn all_plugin_entries(app: &AppHandle, config_dir: &Path) -> Result<Vec<PluginEntry>, String> {
        let mut builtin = Self::builtin_entries(app)?;
        let builtin_ids: HashSet<String> = builtin.iter().map(|entry| entry.id.clone()).collect();
        let mut installed = Self::installed_entries(config_dir, &builtin_ids)?;
        builtin.append(&mut installed);
        Ok(builtin)
    }

    pub fn build_app_config(app: &AppHandle, config_dir: &Path) -> Result<Value, String> {
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

        for entry in Self::all_plugin_entries(app, config_dir)? {
            if let Some(item) = Self::plugin_to_app_item(&entry, os_key, &selections, &user_state)?
            {
                if let Some(list) = per_category.get_mut(&entry.category) {
                    list.push(item);
                }
            }
        }

        Ok(json!({
            "terminal": per_category.get("terminal").cloned().unwrap_or_default(),
            "remotedesktop": per_category.get("remotedesktop").cloned().unwrap_or_default(),
            "filetransfer": per_category.get("filetransfer").cloned().unwrap_or_default(),
            "databases": per_category.get("databases").cloned().unwrap_or_default(),
        }))
    }

    pub fn list_plugins(app: &AppHandle, config_dir: &Path) -> Result<Value, String> {
        let user_state = Self::load_user_state(app, config_dir);
        let os_key = Self::os_key();
        let mut items = Vec::new();

        for entry in Self::all_plugin_entries(app, config_dir)? {
            let manifest = Self::read_manifest(&entry.plugin_dir)?;
            let connect = Self::read_connect(&entry.plugin_dir)?;
            let platform_connect = Self::platform_connect(&connect, os_key);
            let protocols = manifest
                .get("protocols")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let display_name = platform_connect
                .as_ref()
                .and_then(|value| value.get("display_name"))
                .and_then(|v| v.as_str())
                .or_else(|| manifest.get("display_name").and_then(|v| v.as_str()))
                .unwrap_or(entry.id.as_str());
            let path = platform_connect
                .as_ref()
                .map(|value| Self::resolve_path(&entry.id, value, &user_state).0)
                .unwrap_or_default();
            let executable_type = platform_connect
                .as_ref()
                .map(|value| Self::executable_type(value).to_string())
                .unwrap_or_default();
            let path_exists = platform_connect
                .as_ref()
                .map(|value| Self::configured_path_exists(value, &path))
                .unwrap_or(false);
            let enabled = user_state
                .get("plugins")
                .and_then(|v| v.get(&entry.id))
                .and_then(|v| v.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            items.push(json!({
                "id": entry.id,
                "name": manifest.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                "display_name": display_name,
                "version": manifest.get("version").and_then(|v| v.as_str()).unwrap_or(""),
                "category": entry.category,
                "protocols": protocols,
                "builtin": entry.builtin,
                "enabled": enabled,
                "path": path,
                "path_exists": path_exists,
                "executable_type": executable_type,
                "icon_path": Self::icon_path(&entry.plugin_dir),
                "plugin_dir": entry.plugin_dir.to_string_lossy().to_string(),
                "download_url": manifest.get("download_url").and_then(|v| v.as_str()).unwrap_or(""),
                "comment": manifest.get("comment").cloned().unwrap_or(json!({})),
            }));
        }

        Ok(Value::Array(items))
    }

    pub fn is_plugins_enabled(config: &Value) -> bool {
        config
            .get("_plugins")
            .and_then(|p| p.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    }

    fn find_plugin_by_selector(
        app: &AppHandle,
        config_dir: &Path,
        category: &str,
        name: &str,
        plugin_id: Option<&str>,
    ) -> Result<PluginEntry, String> {
        let entries = Self::all_plugin_entries(app, config_dir)?;
        if let Some(plugin_id) = plugin_id {
            let normalized = Self::normalize_plugin_id(plugin_id)?;
            if let Some(entry) = entries.into_iter().find(|entry| entry.id == normalized) {
                return Ok(entry);
            }
            return Err(format!("plugin '{}' not found", normalized));
        }

        entries
            .into_iter()
            .find(|entry| {
                if entry.category != category {
                    return false;
                }
                match Self::read_manifest(&entry.plugin_dir) {
                    Ok(manifest) => manifest
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(|entry_name| entry_name == name)
                        .unwrap_or(false),
                    Err(_) => false,
                }
            })
            .ok_or_else(|| format!("plugin '{name}' not found in category '{category}'"))
    }

    pub fn update_selection(
        app: &AppHandle,
        config_dir: &Path,
        category: &str,
        protocol: &str,
        name: &str,
        plugin_id: Option<&str>,
        new_path: Option<String>,
        enabled: bool,
    ) -> Result<Value, String> {
        let plugin_entry =
            Self::find_plugin_by_selector(app, config_dir, category, name, plugin_id)?;

        let state_path = config_dir.join("plugins-state.json");
        let mut state = Self::load_user_state(app, config_dir);

        let os_key = Self::os_key();
        let connect = Self::read_connect(&plugin_entry.plugin_dir)?;
        let platform_connect = Self::platform_connect(&connect, os_key).ok_or_else(|| {
            format!(
                "plugin '{}' has no config for OS '{os_key}'",
                plugin_entry.id
            )
        })?;

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
                    .entry(plugin_entry.id.clone())
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

        if enabled {
            Self::validate_configured_executable(&platform_connect, &state, &plugin_entry.id)?;
        }

        let state_obj = state.as_object_mut().ok_or("invalid plugins-state")?;
        let selection_key = format!("{category}:{protocol}");
        let previous_preferred = state_obj
            .get("selections")
            .and_then(|value| value.get(&selection_key))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let remaining_enabled: Vec<String>;
        {
            let enabled_selections = state_obj
                .entry("enabled_selections")
                .or_insert(json!({}))
                .as_object_mut()
                .unwrap();
            let enabled_plugins = enabled_selections
                .entry(selection_key.clone())
                .or_insert_with(|| {
                    if previous_preferred.is_empty() {
                        json!([])
                    } else {
                        json!([previous_preferred])
                    }
                })
                .as_array_mut()
                .unwrap();
            if enabled {
                enabled_plugins.clear();
                enabled_plugins.push(Value::String(plugin_entry.id.clone()));
            } else {
                enabled_plugins.retain(|value| value.as_str() != Some(plugin_entry.id.as_str()));
            }
            remaining_enabled = enabled_plugins
                .iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect();
        }
        {
            let selections = state_obj
                .entry("selections")
                .or_insert(json!({}))
                .as_object_mut()
                .unwrap();
            let preferred = selections
                .get(&selection_key)
                .and_then(|value| value.as_str())
                .unwrap_or("");

            if enabled {
                selections.insert(selection_key, Value::String(plugin_entry.id.clone()));
            } else if preferred == plugin_entry.id {
                selections.insert(
                    selection_key,
                    Value::String(remaining_enabled.first().cloned().unwrap_or_default()),
                );
            }
        }
        if enabled {
            let entry = state_obj
                .entry("plugins")
                .or_insert(json!({}))
                .as_object_mut()
                .unwrap()
                .entry(plugin_entry.id)
                .or_insert(json!({}))
                .as_object_mut()
                .unwrap();
            entry.insert("enabled".into(), Value::Bool(true));
        }

        let pretty = serde_json::to_string_pretty(&state)
            .map_err(|e| format!("serialize plugins-state.json failed: {}", e))?;
        fs::write(&state_path, pretty)
            .map_err(|e| format!("write plugins-state.json failed: {}", e))?;

        Self::build_app_config(app, config_dir)
    }

    fn unique_pending_dir(root: &Path) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or(0);
        root.join(format!(".plugin-install-{stamp}"))
    }

    fn safe_archive_relative_path(name: &str) -> Result<PathBuf, String> {
        let mut path = PathBuf::new();
        for component in Path::new(name).components() {
            match component {
                Component::Normal(value) => path.push(value),
                Component::CurDir => {}
                Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                    return Err(format!("unsafe plugin archive entry '{}'", name));
                }
            }
        }
        if path.as_os_str().is_empty() {
            return Err(format!("empty plugin archive entry '{}'", name));
        }
        Ok(path)
    }

    fn extract_plugin_archive(source: &Path, pending_dir: &Path) -> Result<(), String> {
        let file = fs::File::open(source)
            .map_err(|e| format!("open {} failed: {}", source.display(), e))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("open plugin archive {} failed: {}", source.display(), e))?;
        fs::create_dir_all(pending_dir)
            .map_err(|e| format!("create {} failed: {}", pending_dir.display(), e))?;

        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|e| format!("read plugin archive entry failed: {}", e))?;
            let relative = Self::safe_archive_relative_path(entry.name())?;
            let destination = pending_dir.join(relative);

            if entry.is_dir() {
                fs::create_dir_all(&destination)
                    .map_err(|e| format!("create {} failed: {}", destination.display(), e))?;
                continue;
            }

            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("create {} failed: {}", parent.display(), e))?;
            }

            let mut output = fs::File::create(&destination)
                .map_err(|e| format!("create {} failed: {}", destination.display(), e))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|e| format!("write {} failed: {}", destination.display(), e))?;
            output
                .flush()
                .map_err(|e| format!("flush {} failed: {}", destination.display(), e))?;
        }

        Ok(())
    }

    fn validate_installed_plugin(app: &AppHandle, pending_dir: &Path) -> Result<String, String> {
        let manifest = Self::read_manifest(pending_dir)?;
        let connect = Self::read_connect(pending_dir)?;
        let plugin_id =
            Self::normalize_plugin_id(manifest.get("id").and_then(|v| v.as_str()).unwrap_or(""))?;
        let builtin_ids: HashSet<String> = Self::builtin_entries(app)?
            .into_iter()
            .map(|entry| entry.id)
            .collect();
        if builtin_ids.contains(&plugin_id) {
            return Err(format!(
                "plugin '{}' conflicts with builtin plugin and cannot be installed",
                plugin_id
            ));
        }
        if Self::platform_connect(&connect, Self::os_key()).is_none() {
            return Err(format!(
                "plugin '{}' does not provide a '{}' platform configuration",
                plugin_id,
                Self::os_key()
            ));
        }
        Ok(plugin_id)
    }

    fn clear_plugin_from_state(state: &mut Value, plugin_id: &str) {
        let Some(state_obj) = state.as_object_mut() else {
            return;
        };

        if let Some(plugins) = state_obj.get_mut("plugins").and_then(|v| v.as_object_mut()) {
            plugins.remove(plugin_id);
        }

        if let Some(enabled) = state_obj
            .get_mut("enabled_selections")
            .and_then(|v| v.as_object_mut())
        {
            for values in enabled.values_mut() {
                if let Some(items) = values.as_array_mut() {
                    items.retain(|value| value.as_str() != Some(plugin_id));
                }
            }
        }

        if let Some(selections) = state_obj
            .get_mut("selections")
            .and_then(|v| v.as_object_mut())
        {
            let keys: Vec<String> = selections
                .iter()
                .filter_map(|(key, value)| {
                    (value.as_str() == Some(plugin_id)).then_some(key.clone())
                })
                .collect();
            for key in keys {
                selections.insert(key, Value::String(String::new()));
            }
        }
    }

    pub fn create_custom_terminal(
        app: &AppHandle,
        config_dir: &Path,
        name: &str,
        path: &str,
        template: &str,
    ) -> Result<Value, String> {
        let display_name = name.trim();
        if display_name.is_empty() {
            return Err("custom terminal name is required".to_string());
        }

        let executable_path = path.trim();
        if executable_path.is_empty() {
            return Err("custom terminal path is required".to_string());
        }

        let launch_template = template.trim();
        if launch_template.is_empty() {
            return Err("custom terminal launch template is required".to_string());
        }

        let slug = Self::custom_terminal_slug(display_name);
        if slug.is_empty() {
            return Err("custom terminal name must contain letters or numbers".to_string());
        }

        let plugin_id = format!("custom.terminal.{slug}");
        let user_dir = Self::user_plugins_dir(config_dir);
        fs::create_dir_all(&user_dir)
            .map_err(|e| format!("create {} failed: {}", user_dir.display(), e))?;

        let target_dir = user_dir.join(&plugin_id);
        if target_dir.exists() {
            return Err(format!("custom terminal '{}' already exists", display_name));
        }

        let os_key = Self::os_key();
        let manifest = json!({
            "id": plugin_id,
            "name": slug.replace('-', "_"),
            "display_name": display_name,
            "version": "1.0.0",
            "min_client_version": "4.0.0",
            "author": "User",
            "homepage": "",
            "download_url": "",
            "category": "terminal",
            "protocols": ["ssh", "telnet"],
            "builtin": false,
            "comment": {
                "zh": "用户自定义终端",
                "en": "User-defined terminal"
            }
        });
        let mut platforms = Map::new();
        platforms.insert(
            os_key.to_string(),
            json!({
                "match_first": [],
                "is_default": false,
                "is_set": false,
                "is_internal": false,
                "executable": {
                    "type": "user_path",
                    "default": executable_path,
                    "required": false
                },
                "launch": {
                    "type": "args",
                    "use_ssh_helper": true,
                    "template": launch_template
                },
                "display_name": display_name
            }),
        );
        let connect = Value::Object(Map::from_iter([(
            "platforms".to_string(),
            Value::Object(platforms),
        )]));

        fs::create_dir_all(&target_dir)
            .map_err(|e| format!("create {} failed: {}", target_dir.display(), e))?;
        let result = (|| -> Result<Value, String> {
            fs::write(
                target_dir.join("manifest.json"),
                serde_json::to_string_pretty(&manifest)
                    .map_err(|e| format!("serialize manifest.json failed: {}", e))?,
            )
            .map_err(|e| format!("write manifest.json failed: {}", e))?;
            fs::write(
                target_dir.join("connect.json"),
                serde_json::to_string_pretty(&connect)
                    .map_err(|e| format!("serialize connect.json failed: {}", e))?,
            )
            .map_err(|e| format!("write connect.json failed: {}", e))?;
            Self::list_plugins(app, config_dir)
        })();

        if result.is_err() && target_dir.exists() {
            let _ = fs::remove_dir_all(&target_dir);
        }

        result
    }

    pub fn install_plugin(
        app: &AppHandle,
        config_dir: &Path,
        archive_path: &str,
    ) -> Result<Value, String> {
        let archive = PathBuf::from(archive_path.trim());
        if !archive.is_file() {
            return Err(format!("plugin archive not found: {}", archive.display()));
        }

        let user_dir = Self::user_plugins_dir(config_dir);
        fs::create_dir_all(&user_dir)
            .map_err(|e| format!("create {} failed: {}", user_dir.display(), e))?;

        let pending_dir = Self::unique_pending_dir(config_dir);
        if pending_dir.exists() {
            let _ = fs::remove_dir_all(&pending_dir);
        }

        let result = (|| -> Result<Value, String> {
            Self::extract_plugin_archive(&archive, &pending_dir)?;
            let plugin_id = Self::validate_installed_plugin(app, &pending_dir)?;
            let target_dir = user_dir.join(&plugin_id);
            if target_dir.exists() {
                fs::remove_dir_all(&target_dir)
                    .map_err(|e| format!("remove {} failed: {}", target_dir.display(), e))?;
            }
            fs::rename(&pending_dir, &target_dir)
                .map_err(|e| format!("move plugin into {} failed: {}", target_dir.display(), e))?;
            Self::list_plugins(app, config_dir)
        })();

        if pending_dir.exists() {
            let _ = fs::remove_dir_all(&pending_dir);
        }

        result
    }

    pub fn uninstall_plugin(
        app: &AppHandle,
        config_dir: &Path,
        plugin_id: &str,
    ) -> Result<Value, String> {
        let plugin_id = Self::normalize_plugin_id(plugin_id)?;
        let plugin = Self::find_plugin_by_selector(app, config_dir, "", "", Some(&plugin_id))?;
        if plugin.builtin {
            return Err(format!(
                "builtin plugin '{}' cannot be uninstalled",
                plugin_id
            ));
        }

        fs::remove_dir_all(&plugin.plugin_dir)
            .map_err(|e| format!("remove {} failed: {}", plugin.plugin_dir.display(), e))?;

        let state_path = config_dir.join("plugins-state.json");
        let mut state = Self::load_user_state(app, config_dir);
        Self::clear_plugin_from_state(&mut state, &plugin_id);
        let pretty = serde_json::to_string_pretty(&state)
            .map_err(|e| format!("serialize plugins-state.json failed: {}", e))?;
        fs::write(&state_path, pretty)
            .map_err(|e| format!("write plugins-state.json failed: {}", e))?;

        Self::list_plugins(app, config_dir)
    }
}

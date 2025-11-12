use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

pub struct ConfigService;

impl ConfigService {
    /// 获取用户配置目录中的 config.json 路径
    fn get_user_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        // 使用系统配置目录 + 自定义应用名 "jumpserver-client"
        let config_dir = app
            .path()
            .config_dir()
            .map_err(|e| format!("Failed to get config directory: {}", e))?
            .join("jumpserver-client");

        // 确保配置目录存在
        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
            log::info!("Created config directory: {:?}", config_dir);
        }

        Ok(config_dir.join("config.json"))
    }

    /// 获取资源目录中的 config.json 路径（作为默认模板）
    fn resolve_resource_path(app: &tauri::AppHandle) -> Option<PathBuf> {
        app.path()
            .resolve(
                "resources/bin/config.json",
                tauri::path::BaseDirectory::Resource,
            )
            .ok()
            .filter(|p| p.is_file())
    }

    /// 开发环境下的配置路径
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
        log::info!("Selected dev config path: {:?}", result);
        result
    }

    /// 获取配置版本号
    fn get_config_version(config: &Value) -> i64 {
        config.get("version").and_then(|v| v.as_i64()).unwrap_or(1)
    }

    /// 合并用户配置项中的自定义设置（如 match_first）
    fn merge_app_items(user_items: &Value, default_items: &Value) -> Value {
        if !user_items.is_array() || !default_items.is_array() {
            return default_items.clone();
        }

        let user_arr = user_items.as_array().unwrap();
        let default_arr = default_items.as_array().unwrap();

        let mut result = default_arr.clone();

        // 遍历用户配置，保留用户的 match_first 等自定义字段
        for user_item in user_arr {
            if let Some(user_name) = user_item.get("name").and_then(|v| v.as_str()) {
                // 在默认配置中查找对应的项
                for result_item in result.iter_mut() {
                    if let Some(result_name) = result_item.get("name").and_then(|v| v.as_str()) {
                        if result_name == user_name {
                            // 保留用户的 match_first 设置
                            if let Some(match_first) = user_item.get("match_first") {
                                result_item
                                    .as_object_mut()
                                    .unwrap()
                                    .insert("match_first".to_string(), match_first.clone());
                            }
                            // 保留用户的 path 设置（如果用户自定义了路径）
                            if let Some(user_path) = user_item.get("path") {
                                if let Some(user_path_str) = user_path.as_str() {
                                    if !user_path_str.is_empty() {
                                        // 检查默认配置的 path 是否不同
                                        let default_path = result_item
                                            .get("path")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        // 如果用户设置了不同的路径，则保留
                                        if user_path_str != default_path {
                                            result_item
                                                .as_object_mut()
                                                .unwrap()
                                                .insert("path".to_string(), user_path.clone());
                                        }
                                    }
                                }
                            }
                            // 保留用户的 is_set 状态
                            if let Some(is_set) = user_item.get("is_set") {
                                result_item
                                    .as_object_mut()
                                    .unwrap()
                                    .insert("is_set".to_string(), is_set.clone());
                            }
                            break;
                        }
                    }
                }
            }
        }

        Value::Array(result)
    }

    /// 合并操作系统级别的配置
    fn merge_os_config(user_os: &Value, default_os: &Value) -> Value {
        if !user_os.is_object() || !default_os.is_object() {
            return default_os.clone();
        }

        let mut result = default_os.clone();
        let result_obj = result.as_object_mut().unwrap();

        // 合并每个类别（terminal, remotedesktop, filetransfer, databases）
        for category in ["terminal", "remotedesktop", "filetransfer", "databases"] {
            if let (Some(user_items), Some(default_items)) =
                (user_os.get(category), default_os.get(category))
            {
                let merged = Self::merge_app_items(user_items, default_items);
                result_obj.insert(category.to_string(), merged);
            }
        }

        result
    }

    /// 合并配置文件，保留用户的自定义设置
    fn merge_configs(user_config: Value, default_config: Value) -> Value {
        let default_version = Self::get_config_version(&default_config);

        let mut merged = default_config.clone();
        let merged_obj = merged.as_object_mut().unwrap();

        // 更新版本号为默认配置的版本
        merged_obj.insert("version".to_string(), json!(default_version));

        // 保留核心结构字段（从默认配置）
        for key in ["filename", "windowBounds", "defaultSetting"] {
            if let Some(value) = default_config.get(key) {
                merged_obj.insert(key.to_string(), value.clone());
            }
        }

        // 合并每个操作系统的配置
        for os_key in ["windows", "macos", "linux"] {
            if let (Some(user_os), Some(default_os)) =
                (user_config.get(os_key), default_config.get(os_key))
            {
                let merged_os = Self::merge_os_config(user_os, default_os);
                merged_obj.insert(os_key.to_string(), merged_os);
            } else if let Some(default_os) = default_config.get(os_key) {
                // 如果用户配置中没有该操作系统，使用默认配置
                merged_obj.insert(os_key.to_string(), default_os.clone());
            }
        }

        merged
    }

    /// 更新用户配置（如果默认配置版本更高）
    fn update_user_config_if_needed(
        user_config_path: &PathBuf,
        default_config_path: &PathBuf,
    ) -> Result<(), String> {
        // 读取默认配置
        let default_content = std::fs::read_to_string(default_config_path)
            .map_err(|e| format!("Failed to read default config: {}", e))?;
        let default_config: Value = serde_json::from_str(&default_content)
            .map_err(|e| format!("Failed to parse default config: {}", e))?;

        // 读取用户配置
        let user_content = std::fs::read_to_string(user_config_path)
            .map_err(|e| format!("Failed to read user config: {}", e))?;
        let user_config: Value = serde_json::from_str(&user_content)
            .map_err(|e| format!("Failed to parse user config: {}", e))?;

        let default_version = Self::get_config_version(&default_config);
        let user_version = Self::get_config_version(&user_config);

        log::info!(
            "Config versions - User: {}, Default: {}",
            user_version,
            default_version
        );

        // 如果默认配置版本更高，则合并配置
        if default_version > user_version {
            log::info!(
                "Upgrading config from version {} to {}",
                user_version,
                default_version
            );

            let merged_config = Self::merge_configs(user_config, default_config);

            // 写入合并后的配置
            let pretty = serde_json::to_string_pretty(&merged_config)
                .map_err(|e| format!("Failed to serialize merged config: {}", e))?;
            std::fs::write(user_config_path, pretty)
                .map_err(|e| format!("Failed to write merged config: {}", e))?;

            log::info!(
                "Config upgraded successfully to version {}",
                default_version
            );
        } else {
            log::info!("User config is up to date, no upgrade needed");
        }

        Ok(())
    }

    /// 确保用户配置文件存在，如果不存在则从模板复制
    fn ensure_user_config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let user_config_path = Self::get_user_config_path(app)?;
        let template_path = Self::resolve_resource_path(app)
            .or_else(Self::resolve_dev_path)
            .ok_or_else(|| "config.json template not found (resource/dev)".to_string())?;

        // 如果用户配置文件不存在，从模板复制
        if !user_config_path.exists() {
            log::info!(
                "Copying config template from {:?} to {:?}",
                template_path,
                user_config_path
            );
            std::fs::copy(&template_path, &user_config_path)
                .map_err(|e| format!("Failed to copy config template: {}", e))?;
            log::info!("Initial config created successfully");
        } else {
            // 如果用户配置已存在，检查是否需要更新
            log::info!(
                "User config exists at {:?}, checking for updates",
                user_config_path
            );
            if let Err(e) = Self::update_user_config_if_needed(&user_config_path, &template_path) {
                log::warn!("Failed to update user config: {}", e);
                // 不阻断流程，即使更新失败也继续使用现有配置
            }
        }

        Ok(user_config_path)
    }

    pub fn get_app_config(app: &tauri::AppHandle) -> Result<Value, String> {
        // 确保用户配置文件存在，并从用户配置目录读取
        let path = Self::ensure_user_config(app)?;

        log::info!("Reading config from: {:?}", path);

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
        new_path: Option<String>,
    ) -> Result<Value, String> {
        // 确保用户配置文件存在，并写入到用户配置目录
        let config_path = Self::ensure_user_config(app)?;

        log::info!("Updating config at: {:?}", config_path);

        let content = std::fs::read_to_string(&config_path)
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

        // 如果传入了路径，则只更新对应项的 path 与 is_set，不改变 match_first
        if let Some(p) = new_path.clone() {
            let trimmed = p.trim().to_string();
            if !trimmed.is_empty() {
                let mut found = false;
                for item in arr.iter_mut() {
                    let item_name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    if item_name == name {
                        found = true;
                        // 更新 path
                        item.as_object_mut()
                            .unwrap()
                            .insert("path".into(), Value::String(trimmed.clone()));
                        // 标记为已设置
                        item.as_object_mut()
                            .unwrap()
                            .insert("is_set".into(), Value::Bool(true));
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
                std::fs::write(&config_path, pretty)
                    .map_err(|e| format!("write config.json failed: {}", e))?;

                log::info!("Config path updated successfully at: {:?}", config_path);

                return Ok(json
                    .get(os_key)
                    .cloned()
                    .ok_or_else(|| format!("config.json missing key for current OS: {}", os_key))?);
            }
        }

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
        std::fs::write(&config_path, pretty)
            .map_err(|e| format!("write config.json failed: {}", e))?;

        log::info!("Config updated successfully at: {:?}", config_path);

        Ok(json
            .get(os_key)
            .cloned()
            .ok_or_else(|| format!("config.json missing key for current OS: {}", os_key))?)
    }
}

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use percent_encoding::percent_decode_str;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::service::config::ConfigService;

#[derive(Debug, Deserialize)]
struct Endpoint {
    host: String,
    port: u16,
}

#[derive(Debug, Deserialize)]
struct Token {
    id: String,
    value: String,
}

#[derive(Debug, Default, Deserialize)]
struct ConnectionFile {
    #[serde(default)]
    name: String,
    #[serde(default)]
    content: String,
}

#[derive(Debug, Default, Deserialize)]
struct AssetInfo {
    #[serde(default)]
    db_name: String,
}

#[derive(Debug, Default, Deserialize)]
struct Asset {
    #[serde(default)]
    info: AssetInfo,
}

#[derive(Debug, Deserialize)]
struct LaunchPayload {
    protocol: String,
    #[serde(default)]
    client: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    command: String,
    endpoint: Endpoint,
    token: Token,
    #[serde(default)]
    file: ConnectionFile,
    #[serde(default)]
    asset: Asset,
}

#[derive(Debug, Clone)]
struct Application {
    plugin_id: String,
    name: String,
    display_name: String,
    path: String,
    arg_format: String,
    launch_type: String,
    launch_driver: String,
    application_id: String,
    use_ssh_helper: bool,
    protocol_aliases: HashMap<String, String>,
    protocol_templates: HashMap<String, String>,
    env: HashMap<String, String>,
    is_internal: bool,
}

fn decode_payload(raw: &str) -> Result<LaunchPayload, String> {
    let encoded = raw
        .strip_prefix("jms://")
        .ok_or_else(|| "invalid local client URL scheme".to_string())?;
    let decoded = BASE64_STANDARD
        .decode(encoded)
        .map_err(|error| format!("decode local client payload failed: {error}"))?;
    serde_json::from_slice(&decoded)
        .map_err(|error| format!("parse local client payload failed: {error}"))
}

fn string_field(item: &Value, key: &str) -> String {
    item.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn string_list_contains(item: &Value, key: &str, expected: &str) -> bool {
    item.get(key)
        .and_then(Value::as_array)
        .map(|values| values.iter().any(|value| value.as_str() == Some(expected)))
        .unwrap_or(false)
}

fn resolve_application(app: &AppHandle, payload: &LaunchPayload) -> Result<Application, String> {
    let config = ConfigService::get_app_config(app)?;
    let categories = ["terminal", "filetransfer", "remotedesktop", "databases"];
    let mut preferred: Option<&Value> = None;

    for category in categories {
        let Some(items) = config.get(category).and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            if !string_list_contains(item, "protocol", &payload.protocol)
                || !item.get("is_set").and_then(Value::as_bool).unwrap_or(false)
            {
                continue;
            }

            if !payload.client.is_empty() && string_field(item, "name") == payload.client {
                preferred = Some(item);
                break;
            }
            if payload.client.is_empty()
                && string_list_contains(item, "match_first", &payload.protocol)
            {
                preferred = Some(item);
                break;
            }
        }
        if preferred.is_some() {
            break;
        }
    }

    let item = preferred.ok_or_else(|| {
        format!(
            "no configured application selected for protocol '{}'{}",
            payload.protocol,
            if payload.client.is_empty() {
                String::new()
            } else {
                format!(" and client '{}'", payload.client)
            }
        )
    })?;

    Ok(Application {
        plugin_id: string_field(item, "plugin_id"),
        name: string_field(item, "name"),
        display_name: string_field(item, "display_name"),
        path: string_field(item, "path"),
        arg_format: string_field(item, "arg_format"),
        launch_type: string_field(item, "launch_type"),
        launch_driver: string_field(item, "launch_driver"),
        application_id: string_field(item, "application_id"),
        use_ssh_helper: item
            .get("use_ssh_helper")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        protocol_aliases: item
            .get("protocol_aliases")
            .and_then(Value::as_object)
            .map(|aliases| {
                aliases
                    .iter()
                    .filter_map(|(key, value)| {
                        value.as_str().map(|value| (key.clone(), value.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default(),
        protocol_templates: item
            .get("protocol_templates")
            .and_then(Value::as_object)
            .map(|templates| {
                templates
                    .iter()
                    .filter_map(|(key, value)| {
                        value.as_str().map(|value| (key.clone(), value.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default(),
        env: item
            .get("env")
            .and_then(Value::as_object)
            .map(|values| {
                values
                    .iter()
                    .filter_map(|(key, value)| {
                        value.as_str().map(|value| (key.clone(), value.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default(),
        is_internal: item
            .get("is_internal")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn sanitized_name(raw: &str) -> String {
    let decoded = percent_decode_str(raw).decode_utf8_lossy().to_string();
    decoded.replace(' ', "").replace([':', '-'], "_")
}

fn decoded_name(payload: &LaunchPayload) -> String {
    sanitized_name(&payload.name)
}

fn username(payload: &LaunchPayload) -> String {
    if ["ssh", "sftp", "telnet"].contains(&payload.protocol.as_str()) {
        format!("JMS-{}", payload.token.id)
    } else {
        payload.token.id.clone()
    }
}

fn variables(payload: &LaunchPayload) -> HashMap<&'static str, String> {
    let database = if payload.protocol == "oracle" {
        username(payload)
    } else {
        payload.asset.info.db_name.clone()
    };
    let mut values = HashMap::from([
        ("name", decoded_name(payload)),
        ("protocol", payload.protocol.clone()),
        ("username", username(payload)),
        ("value", payload.token.value.clone()),
        ("host", payload.endpoint.host.clone()),
        ("port", payload.endpoint.port.to_string()),
        ("dbname", database),
        ("url", navicat_url(payload)),
    ]);
    if payload.protocol == "sqlserver" {
        values.insert("dbeaver_protocol", "mssql_jdbc_ms_new".to_string());
    } else {
        values.insert("dbeaver_protocol", payload.protocol.clone());
    }
    values
}

fn navicat_url(payload: &LaunchPayload) -> String {
    let protocol = match payload.protocol.as_str() {
        "oracle" => "ora",
        "sqlserver" => "mssql",
        "postgresql" => "pgsql",
        value => value,
    };
    format!(
        "navicat://conn.{protocol}?Conn.Host={}&Conn.Name={}&Conn.Port={}&Conn.Username={}",
        payload.endpoint.host,
        decoded_name(payload),
        payload.endpoint.port,
        username(payload)
    )
}

fn render(template: &str, values: &HashMap<&str, String>) -> String {
    let mut rendered = template.to_string();
    for (key, value) in values {
        rendered = rendered.replace(&format!("{{{key}}}"), value);
    }
    rendered
}

fn is_terminal_driver(driver: &str) -> bool {
    matches!(driver, "terminal" | "iterm2" | "linux-terminal")
}

fn prepare_driver(
    app: &AppHandle,
    application: &Application,
    payload: &LaunchPayload,
    values: &mut HashMap<&'static str, String>,
) -> Result<(), String> {
    if application.launch_driver != "resp" {
        return Ok(());
    }

    let config_dir = app
        .path()
        .config_dir()
        .map_err(|error| error.to_string())?
        .join("jumpserver-client");
    let rdm_dir = config_dir.join(".rdm");
    fs::create_dir_all(&rdm_dir).map_err(|error| error.to_string())?;
    let connection = serde_json::json!([{
        "host": payload.endpoint.host,
        "port": payload.endpoint.port.to_string(),
        "name": decoded_name(payload),
        "auth": format!("{}@{}", payload.token.id, payload.token.value),
        "ssh_agent_path": "",
        "ssh_password": "",
        "ssh_private_key_path": "",
        "timeout_connect": "60000",
        "timeout_execute": "60000"
    }]);
    fs::write(
        rdm_dir.join("connections.json"),
        serde_json::to_vec(&connection).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    values.insert("config_file", config_dir.to_string_lossy().to_string());
    Ok(())
}

fn helper_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let platform = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "darwin-arm64",
        ("macos", _) => "darwin-amd64",
        ("linux", "aarch64") => "linux-arm64",
        ("linux", _) => "linux-amd64",
        _ => "windows",
    };
    let name = if cfg!(windows) {
        "client.exe"
    } else {
        "client"
    };
    let mut candidates = Vec::new();
    for relative in [
        format!("resources/bin/{platform}/{name}"),
        format!("bin/{platform}/{name}"),
    ] {
        if let Ok(path) = app.path().resolve(relative, BaseDirectory::Resource) {
            candidates.push(path);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("resources/bin").join(platform).join(name));
        candidates.push(
            cwd.join("src-tauri/resources/bin")
                .join(platform)
                .join(name),
        );
    }
    candidates
}

fn helper_path(app: &AppHandle) -> Result<PathBuf, String> {
    helper_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "SSH helper executable not found".to_string())
}

fn spawn(mut command: Command) -> Result<(), String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("launch application failed: {error}"))
}

fn apple_script_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "macos")]
fn launch_terminal(
    app: &AppHandle,
    application: &Application,
    arguments: &str,
    use_ssh_helper: bool,
) -> Result<(), String> {
    let shell_command = if use_ssh_helper {
        let helper = helper_path(app)?;
        format!(
            "{} {}",
            shell_words::quote(&helper.to_string_lossy()),
            arguments
        )
    } else {
        arguments.to_string()
    };
    let application_id = apple_script_string(&application.application_id);
    let command = apple_script_string(&shell_command);
    let script = match application.launch_driver.as_str() {
        "terminal" => format!(
            "tell application id \"{application_id}\"\nactivate\ndo script \"{command}\"\nend tell"
        ),
        "iterm2" => format!(
            "tell application id \"{application_id}\"\nactivate\nset targetWindow to (create window with default profile)\ntell current session of targetWindow to write text \"{command}\"\nend tell"
        ),
        driver => return Err(format!("unsupported macOS terminal driver: {driver}")),
    };
    let mut process = Command::new("osascript");
    process.args(["-s", "h", "-e", &script]);
    spawn(process)
}

#[cfg(target_os = "linux")]
fn launch_terminal(
    app: &AppHandle,
    application: &Application,
    arguments: &str,
    use_ssh_helper: bool,
) -> Result<(), String> {
    let snippet = if use_ssh_helper {
        let helper = helper_path(app)?;
        format!(
            "{} {}",
            shell_words::quote(&helper.to_string_lossy()),
            arguments
        )
    } else {
        arguments.to_string()
    };
    let terminal = if application.path.trim().is_empty() {
        "x-terminal-emulator"
    } else {
        application.path.as_str()
    };
    let mut process = Command::new(terminal);
    process.args(["-e", "bash", "-lc", &snippet]);
    spawn(process)
}

#[cfg(windows)]
fn launch_terminal(
    app: &AppHandle,
    application: &Application,
    arguments: &str,
    _use_ssh_helper: bool,
) -> Result<(), String> {
    launch_executable(app, application, arguments, &HashMap::new())
}

fn resolve_executable(app: &AppHandle, application: &Application) -> Result<PathBuf, String> {
    let configured = PathBuf::from(application.path.trim());
    if configured.is_absolute() && configured.exists() {
        return Ok(configured);
    }
    if application.is_internal {
        let name = application.path.trim();
        if !application.plugin_id.is_empty() {
            let os = if cfg!(target_os = "macos") {
                "darwin"
            } else if cfg!(target_os = "windows") {
                "windows"
            } else {
                "linux"
            };
            if let Ok(candidate) = app.path().resolve(
                format!("resources/plugins/{os}/{}/{}", application.plugin_id, name),
                BaseDirectory::Resource,
            ) {
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
        for helper in helper_candidates(app) {
            if let Some(dir) = helper.parent() {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
        if !name.is_empty() {
            return Ok(PathBuf::from(name));
        }
    }
    Err(format!(
        "configured application '{}' not found at '{}'",
        application.display_name, application.path
    ))
}

fn launch_executable(
    app: &AppHandle,
    application: &Application,
    arguments: &str,
    values: &HashMap<&str, String>,
) -> Result<(), String> {
    let executable = resolve_executable(app, application)?;
    let args = shell_words::split(arguments)
        .map_err(|error| format!("parse application arguments failed: {error}"))?
        .into_iter()
        .flat_map(|argument| argument.split('*').map(str::to_string).collect::<Vec<_>>());
    let mut process = Command::new(executable);
    process.args(args);
    for (key, template) in &application.env {
        process.env(key, render(template, values));
    }
    spawn(process)
}

fn write_connection_file(app: &AppHandle, payload: &LaunchPayload) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .config_dir()
        .map_err(|error| error.to_string())?
        .join("jumpserver-client");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let extension = if payload.protocol == "rdp" {
        "rdp"
    } else {
        "vnc"
    };
    let base = if payload.file.name.trim().is_empty() {
        decoded_name(payload)
    } else {
        sanitized_name(&payload.file.name)
    };
    let path = dir.join(format!("{base}.{extension}"));
    fs::write(&path, &payload.file.content).map_err(|error| error.to_string())?;
    Ok(path)
}

fn launch_file(
    app: &AppHandle,
    application: &Application,
    payload: &LaunchPayload,
) -> Result<(), String> {
    let file = write_connection_file(app, payload)?;
    #[cfg(target_os = "macos")]
    {
        let mut process = Command::new("open");
        process.args(["-a", application.path.as_str()]);
        process.arg(file);
        return spawn(process);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let args = render(
            &application.arg_format,
            &HashMap::from([("file", file.to_string_lossy().to_string())]),
        );
        return launch_executable(app, application, &args, &HashMap::new());
    }
}

pub fn launch_local_application(app: AppHandle, raw: String) -> Result<(), String> {
    let payload = decode_payload(&raw)?;
    let application = resolve_application(&app, &payload)?;
    let mut values = variables(&payload);
    if let Some(alias) = application.protocol_aliases.get(&payload.protocol) {
        values.insert("protocol", alias.clone());
    }
    prepare_driver(&app, &application, &payload, &mut values)?;
    if !payload.command.trim().is_empty() {
        if !is_terminal_driver(&application.launch_driver) {
            return Err("selected application cannot open command payloads".into());
        }
        return launch_terminal(&app, &application, &payload.command, false);
    }
    let template = application
        .protocol_templates
        .get(&payload.protocol)
        .map(String::as_str)
        .unwrap_or(&application.arg_format);
    let arguments = render(template, &values);

    log::info!(
        "Launching configured application: name={}, protocol={}, driver={}, type={}",
        application.name,
        payload.protocol,
        application.launch_driver,
        application.launch_type
    );

    match application.launch_type.as_str() {
        "file" => launch_file(&app, &application, &payload),
        "args" if is_terminal_driver(&application.launch_driver) => {
            launch_terminal(&app, &application, &arguments, application.use_ssh_helper)
        }
        "args" => launch_executable(&app, &application, &arguments, &values),
        launch_type => Err(format!(
            "unsupported application launch type: {launch_type}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_client_selection() {
        let encoded = BASE64_STANDARD.encode(
            br#"{"protocol":"ssh","client":"iterm","name":"root","endpoint":{"host":"localhost","port":2222},"token":{"id":"id","value":"secret"},"asset":{},"file":{}}"#,
        );
        let payload = decode_payload(&format!("jms://{encoded}")).unwrap();
        assert_eq!(payload.client, "iterm");
        assert_eq!(username(&payload), "JMS-id");
    }

    #[test]
    fn renders_plugin_template() {
        let values = HashMap::from([
            ("username", "JMS-id".to_string()),
            ("host", "localhost".to_string()),
            ("port", "2222".to_string()),
        ]);
        assert_eq!(
            render("{username}@{host} -p {port}", &values),
            "JMS-id@localhost -p 2222"
        );
    }
}

use super::web_proxy_credentials::{
    create_credential_session, normalized_origin, WebCredentialSession, WebCredentials,
};
use super::web_proxy_recording::{WebProxyRecordingManager, WebProxyRecordingState};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    Emitter, LogicalPosition, LogicalSize, Manager, Runtime, State, Webview, WebviewUrl, Window,
};
use url::Url;
use zeroize::Zeroize;

const MAIN_WINDOW_LABEL: &str = "main";
const ASSET_WINDOW_LABEL_PREFIX: &str = "asset-";
const VIEW_LABEL_PREFIX: &str = "web-proxy-";
const AUTOFILL_SCHEME: &str = "jumpserver-autofill";
const OPEN_LINKS_IN_SAME_VIEW_SCRIPT: &str = r#"
document.addEventListener("click", (event) => {
  const target = event.target;
  const anchor = target instanceof Element ? target.closest("a[href]") : null;
  if (anchor && anchor.target.toLowerCase() === "_blank") {
    anchor.target = "_self";
  }
}, true);
"#;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebProxyState {
    label: String,
    url: String,
    title: String,
    loading: bool,
    error: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebProxyAutofillState {
    label: String,
    status: String,
    message: String,
}

fn emit_autofill_state<R: Runtime>(webview: &Webview<R>, status: &str, message: impl Into<String>) {
    let _ = webview.window().emit(
        "web-proxy-autofill-state",
        WebProxyAutofillState {
            label: webview.label().to_string(),
            status: status.to_string(),
            message: message.into(),
        },
    );
}

fn selector_lookup_script() -> &'static str {
    r#"
const findElement = (selector) => {
  const separator = selector.indexOf("=");
  const kind = selector.slice(0, separator).trim().toLowerCase();
  const value = selector.slice(separator + 1);
  if (kind === "id") return document.getElementById(value);
  if (kind === "name") return document.getElementsByName(value)[0];
  if (kind === "type") return document.querySelector('[type="' + CSS.escape(value) + '"]');
  if (kind === "class_name") return document.getElementsByClassName(value)[0];
  if (kind === "css" || kind === "css_selector") return document.querySelector(value);
  if (kind === "xpath") return document.evaluate(value, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
};
"#
}

fn build_autofill_probe_script(label: &str, session: &WebCredentialSession) -> String {
    let (username_selector, password_selector, submit_selector) = session.selectors();
    let selectors = serde_json::json!({
        "username": username_selector,
        "password": password_selector,
        "submit": submit_selector,
    });
    let ready_url = serde_json::to_string(&format!("{AUTOFILL_SCHEME}://ready/{label}"))
        .unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"(() => {{
{lookup}
const selectors = {selectors};
const readyURL = {ready_url};
const visible = (element) => {{
  if (!(element instanceof Element) || !element.isConnected || element.getClientRects().length === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}};
const elementsReady = () => {{
  if (document.readyState !== "complete") return false;
  const username = selectors.username ? findElement(selectors.username) : null;
  const password = findElement(selectors.password);
  const submit = findElement(selectors.submit);
  const usernameReady = !selectors.username || (username instanceof HTMLInputElement && ["text", "email", "tel"].includes(username.type) && !username.disabled && visible(username));
  const passwordReady = password instanceof HTMLInputElement && password.type === "password" && !password.disabled && visible(password);
  const submitReady = ((submit instanceof HTMLButtonElement && !submit.disabled) || submit instanceof HTMLAnchorElement || (submit instanceof HTMLInputElement && ["submit", "button"].includes(submit.type) && !submit.disabled)) && visible(submit);
  return usernameReady && passwordReady && submitReady;
}};
let readySince = 0;
let finished = false;
const finish = () => {{
  if (finished) return;
  finished = true;
  observer.disconnect();
  clearInterval(interval);
  location.href = readyURL;
}};
const check = () => {{
  if (!elementsReady()) {{
    readySince = 0;
    return;
  }}
  if (!readySince) readySince = performance.now();
  if (performance.now() - readySince >= 300) finish();
}};
const observer = new MutationObserver(check);
observer.observe(document.documentElement, {{ childList: true, subtree: true, attributes: true }});
const interval = setInterval(check, 50);
check();
setTimeout(() => {{
  if (finished) return;
  observer.disconnect();
  clearInterval(interval);
}}, 15000);
}})()"#,
        lookup = selector_lookup_script(),
        selectors = selectors,
        ready_url = ready_url,
    )
}

fn build_autofill_script(
    label: &str,
    session: &WebCredentialSession,
    credentials: &WebCredentials,
) -> Result<String, String> {
    let (username_selector, password_selector, submit_selector) = session.selectors();
    let payload = serde_json::to_string(&serde_json::json!({
        "username": credentials.username,
        "password": credentials.password,
        "usernameSelector": username_selector,
        "passwordSelector": password_selector,
        "submitSelector": submit_selector,
    }))
    .map_err(|_| "构造 Web 代填脚本失败".to_string())?;
    let timeout_url = serde_json::to_string(&format!("{AUTOFILL_SCHEME}://timeout/{label}"))
        .unwrap_or_else(|_| "\"\"".to_string());
    Ok(format!(
        r#"(() => {{
{lookup}
let payload = {payload};
const timeoutURL = {timeout_url};
const username = payload.usernameSelector ? findElement(payload.usernameSelector) : null;
const password = findElement(payload.passwordSelector);
const submit = findElement(payload.submitSelector);
if ((payload.usernameSelector && !(username instanceof HTMLInputElement)) || !(password instanceof HTMLInputElement) || !submit) {{
  payload.username = "";
  payload.password = "";
  return false;
}}
const overlay = document.createElement("div");
overlay.setAttribute("data-jms-secure-login", "true");
Object.assign(overlay.style, {{ position: "fixed", inset: "0", zIndex: "2147483647", cursor: "wait", background: "transparent" }});
document.documentElement.appendChild(overlay);
let internalAction = false;
const blockedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress", "touchstart", "touchend"];
const blocker = (event) => {{
  if (internalAction) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}};
for (const name of blockedEvents) document.addEventListener(name, blocker, true);
const setValue = (element, value) => {{
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", {{ bubbles: true }}));
  element.dispatchEvent(new Event("change", {{ bubbles: true }}));
}};
if (username) setValue(username, payload.username);
setValue(password, payload.password);
payload.username = "";
payload.password = "";
setTimeout(() => {{
  for (const name of blockedEvents) document.removeEventListener(name, blocker, true);
  overlay.remove();
  if (!password.isConnected) return;
  if (username?.isConnected) setValue(username, "");
  setValue(password, "");
  location.href = timeoutURL;
}}, 20000);
internalAction = true;
try {{
  const form = submit.closest("form");
  if (submit instanceof HTMLAnchorElement && form instanceof HTMLFormElement) {{
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", {{ bubbles: true, cancelable: true }}));
  }} else {{
    submit.click();
  }}
}} finally {{
  internalAction = false;
}}
return true;
}})()"#,
        lookup = selector_lookup_script(),
        payload = payload,
        timeout_url = timeout_url,
    ))
}

fn validate_host_window<R: Runtime>(window: &Window<R>) -> Result<(), String> {
    if !is_valid_host_window_label(window.label()) {
        return Err("Web Proxy command called from an invalid host window".to_string());
    }
    Ok(())
}

fn is_valid_host_window_label(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL
        || label
            .strip_prefix(ASSET_WINDOW_LABEL_PREFIX)
            .is_some_and(|suffix| !suffix.is_empty())
}

fn validate_label(label: &str) -> Result<(), String> {
    if !label.starts_with(VIEW_LABEL_PREFIX)
        || !label.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '/' | ':')
        })
    {
        return Err("invalid Web Proxy view label".to_string());
    }
    Ok(())
}

fn parse_target(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| format!("invalid Website URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Website URL must be HTTP/HTTPS and must not contain credentials".to_string());
    }
    Ok(url)
}

fn parse_proxy(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| format!("invalid Koko Web Proxy URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "socks5")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(
            "Koko Web Proxy URL must be HTTP/SOCKS5 and must not contain credentials".to_string(),
        );
    }
    Ok(url)
}

fn emit_state<R: Runtime>(webview: &Webview<R>, url: &Url, title: String, loading: bool) {
    let _ = webview.window().emit(
        "web-proxy-state",
        WebProxyState {
            label: webview.label().to_string(),
            url: url.to_string(),
            title,
            loading,
            error: String::new(),
        },
    );
}

fn managed_view<R: Runtime>(window: &Window<R>, label: &str) -> Result<Webview<R>, String> {
    validate_host_window(window)?;
    validate_label(label)?;
    let view = window
        .app_handle()
        .get_webview(label)
        .ok_or_else(|| "Web Proxy view not found".to_string())?;
    if view.window().label() != window.label() {
        return Err("Web Proxy view belongs to a different host window".to_string());
    }
    Ok(view)
}

#[tauri::command]
pub fn create_web_proxy_view(
    window: Window,
    recordings: State<'_, WebProxyRecordingManager>,
    label: String,
    target_url: String,
    proxy_url: String,
    token_id: String,
    token_value: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<WebProxyState, String> {
    validate_host_window(&window)?;
    validate_label(&label)?;
    if window.app_handle().get_webview(&label).is_some() {
        return Err("Web Proxy view label already exists".to_string());
    }

    let target = parse_target(&target_url)?;
    let proxy = parse_proxy(&proxy_url)?;
    let redirect_view: Arc<Mutex<Option<Webview>>> = Arc::new(Mutex::new(None));
    let redirect_view_for_popup = Arc::clone(&redirect_view);
    let redirect_view_for_autofill = Arc::clone(&redirect_view);
    let autofill_session: Arc<Mutex<Option<WebCredentialSession>>> = Arc::new(Mutex::new(None));
    let autofill_session_for_navigation = Arc::clone(&autofill_session);
    let autofill_session_for_load = Arc::clone(&autofill_session);
    let current_url = Arc::new(Mutex::new(target.clone()));
    let current_url_for_navigation = Arc::clone(&current_url);
    let current_url_for_load = Arc::clone(&current_url);
    let current_url_for_title = Arc::clone(&current_url);
    let page_loaded = Arc::new(AtomicBool::new(false));
    let page_loaded_for_load = Arc::clone(&page_loaded);
    let recordings = recordings.inner().clone();
    let recordings_for_navigation = recordings.clone();
    let recordings_for_load = recordings.clone();
    let autofill_label = label.clone();

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target.clone()))
        .proxy_url(proxy.clone())
        .incognito(true)
        .general_autofill_enabled(false)
        .initialization_script_for_all_frames(OPEN_LINKS_IN_SAME_VIEW_SCRIPT)
        .on_navigation(move |url| {
            if url.scheme() == AUTOFILL_SCHEME && url.host_str() == Some("timeout") {
                if url.path().trim_start_matches('/') == autofill_label {
                    if let Ok(guard) = redirect_view_for_autofill.lock() {
                        if let Some(view) = guard.as_ref() {
                            recordings_for_navigation.set_paused(
                                view.app_handle(),
                                view.label(),
                                "autofill",
                                false,
                                "账号代填已结束，继续录像",
                            );
                            emit_autofill_state(
                                view,
                                "error",
                                "已触发登录，但页面在 20 秒内没有离开密码阶段",
                            );
                        }
                    }
                }
                return false;
            }
            if url.scheme() == AUTOFILL_SCHEME && url.host_str() == Some("ready") {
                if url.path().trim_start_matches('/') != autofill_label {
                    return false;
                }
                let session = autofill_session_for_navigation
                    .lock()
                    .ok()
                    .and_then(|mut guard| guard.take());
                let view = redirect_view_for_autofill
                    .lock()
                    .ok()
                    .and_then(|guard| guard.clone());
                let current_url = current_url_for_navigation
                    .lock()
                    .ok()
                    .map(|guard| guard.clone());
                if let (Some(mut session), Some(view), Some(current_url)) =
                    (session, view, current_url)
                {
                    recordings_for_navigation.set_paused(
                        view.app_handle(),
                        view.label(),
                        "autofill",
                        true,
                        "账号代填期间暂停录像",
                    );
                    emit_autofill_state(&view, "filling", "正在安全代填并提交");
                    let recordings_for_autofill = recordings_for_navigation.clone();
                    tauri::async_runtime::spawn(async move {
                        recordings_for_autofill
                            .wait_for_pending_capture(view.label())
                            .await;
                        let credentials = match session.release(&current_url).await {
                            Ok(credentials) => credentials,
                            Err(error) => {
                                recordings_for_autofill.set_paused(
                                    view.app_handle(),
                                    view.label(),
                                    "autofill",
                                    false,
                                    "账号代填失败，继续录像",
                                );
                                emit_autofill_state(&view, "error", error);
                                return;
                            }
                        };
                        let script =
                            match build_autofill_script(view.label(), &session, &credentials) {
                                Ok(script) => script,
                                Err(error) => {
                                    recordings_for_autofill.set_paused(
                                        view.app_handle(),
                                        view.label(),
                                        "autofill",
                                        false,
                                        "账号代填失败，继续录像",
                                    );
                                    emit_autofill_state(&view, "error", error);
                                    return;
                                }
                            };
                        let state_view = view.clone();
                        let recordings_for_result = recordings_for_autofill.clone();
                        if let Err(error) = view.eval_with_callback(script, move |result| {
                            if result.trim() == "true" {
                                emit_autofill_state(
                                    &state_view,
                                    "submitted",
                                    "已触发页面的登录提交动作",
                                );
                            } else {
                                recordings_for_result.set_paused(
                                    state_view.app_handle(),
                                    state_view.label(),
                                    "autofill",
                                    false,
                                    "账号代填失败，继续录像",
                                );
                                emit_autofill_state(
                                    &state_view,
                                    "error",
                                    "登录元素在代填前发生变化",
                                );
                            }
                        }) {
                            recordings_for_autofill.set_paused(
                                view.app_handle(),
                                view.label(),
                                "autofill",
                                false,
                                "账号代填失败，继续录像",
                            );
                            emit_autofill_state(&view, "error", error.to_string());
                        }
                    });
                }
                return false;
            }
            if matches!(url.scheme(), "http" | "https") {
                if let Ok(mut guard) = current_url_for_navigation.lock() {
                    *guard = url.clone();
                }
                return true;
            }
            false
        })
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https") {
                if let Ok(guard) = redirect_view_for_popup.lock() {
                    if let Some(view) = guard.as_ref() {
                        let navigation_view = view.clone();
                        let _ = view.run_on_main_thread(move || {
                            let _ = navigation_view.navigate(url);
                        });
                    }
                }
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                recordings_for_load.set_paused(
                    webview.app_handle(),
                    webview.label(),
                    "autofill",
                    false,
                    "页面已离开密码阶段，继续录像",
                );
            }
            if let Ok(mut guard) = current_url_for_load.lock() {
                *guard = payload.url().clone();
            }
            page_loaded_for_load.store(
                payload.event() == PageLoadEvent::Finished,
                Ordering::Release,
            );
            emit_state(
                &webview,
                payload.url(),
                String::new(),
                payload.event() == PageLoadEvent::Started,
            );
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let script = autofill_session_for_load.lock().ok().and_then(|guard| {
                let session = guard.as_ref()?;
                if normalized_origin(payload.url()).ok().as_deref() != Some(session.origin()) {
                    return None;
                }
                Some(build_autofill_probe_script(webview.label(), session))
            });
            if let Some(script) = script {
                let _ = webview.eval(script);
            }
        })
        .on_document_title_changed(move |webview, title| {
            if let Ok(url) = current_url_for_title.lock() {
                emit_state(&webview, &url, title, false);
            }
        });

    let view = window
        .add_child(
            builder,
            LogicalPosition::new(x.max(0.0), y.max(0.0)),
            LogicalSize::new(width.max(1.0), height.max(1.0)),
        )
        .map_err(|error| format!("create Web Proxy view failed: {error}"))?;
    *redirect_view
        .lock()
        .map_err(|_| "initialize Web Proxy popup handler failed".to_string())? = Some(view.clone());

    let credential_view = view.clone();
    let credential_store = Arc::clone(&autofill_session);
    let credential_proxy = proxy.clone();
    let credential_target = target.clone();
    let credential_current_url = Arc::clone(&current_url);
    let credential_page_loaded = Arc::clone(&page_loaded);
    tauri::async_runtime::spawn(async move {
        let mut token_value = token_value;
        let result = create_credential_session(
            &credential_proxy,
            &credential_target,
            &token_id,
            &token_value,
        )
        .await;
        token_value.zeroize();
        match result {
            Ok(Some(session)) => {
                let current_origin = credential_current_url
                    .lock()
                    .ok()
                    .and_then(|url| normalized_origin(&url).ok());
                let script = if credential_page_loaded.load(Ordering::Acquire)
                    && current_origin.as_deref() == Some(session.origin())
                {
                    Some(build_autofill_probe_script(
                        credential_view.label(),
                        &session,
                    ))
                } else {
                    None
                };
                if let Ok(mut guard) = credential_store.lock() {
                    *guard = Some(session);
                }
                emit_autofill_state(&credential_view, "ready", "等待登录元素");
                if let Some(script) = script {
                    let _ = credential_view.eval(script);
                }
            }
            Ok(None) => emit_autofill_state(&credential_view, "unavailable", "资产未启用账号代填"),
            Err(error) => emit_autofill_state(&credential_view, "error", error),
        }
    });

    Ok(WebProxyState {
        label,
        url: target.to_string(),
        title: String::new(),
        loading: true,
        error: String::new(),
    })
}

#[tauri::command]
pub fn set_web_proxy_view_active(
    window: Window,
    recordings: State<'_, WebProxyRecordingManager>,
    label: String,
    active: bool,
) -> Result<(), String> {
    let view = managed_view(&window, &label)?;
    recordings.set_paused(
        window.app_handle(),
        &label,
        "inactive",
        !active,
        if active {
            "Website 标签已激活，继续录像"
        } else {
            "Website 标签在后台，暂停录像"
        },
    );
    if active {
        view.show().and_then(|_| view.set_focus())
    } else {
        view.hide()
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_web_proxy_view_bounds(
    window: Window,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let view = managed_view(&window, &label)?;
    view.set_position(LogicalPosition::new(x.max(0.0), y.max(0.0)))
        .and_then(|_| view.set_size(LogicalSize::new(width.max(1.0), height.max(1.0))))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn navigate_web_proxy_view(
    window: Window,
    label: String,
    target_url: String,
) -> Result<(), String> {
    managed_view(&window, &label)?
        .navigate(parse_target(&target_url)?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reload_web_proxy_view(window: Window, label: String) -> Result<(), String> {
    managed_view(&window, &label)?
        .reload()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn history_web_proxy_view(
    window: Window,
    label: String,
    direction: String,
) -> Result<(), String> {
    let script = match direction.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        _ => return Err("invalid history direction".to_string()),
    };
    managed_view(&window, &label)?
        .eval(script)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_web_proxy_recording(
    window: Window,
    recordings: State<'_, WebProxyRecordingManager>,
    label: String,
    target_url: String,
    proxy_url: String,
    width: u32,
    height: u32,
) -> Result<WebProxyRecordingState, String> {
    managed_view(&window, &label)?;
    recordings
        .start(
            window.app_handle().clone(),
            label,
            target_url,
            proxy_url,
            width,
            height,
        )
        .await
}

#[tauri::command]
pub async fn stop_web_proxy_recording(
    window: Window,
    recordings: State<'_, WebProxyRecordingManager>,
    label: String,
) -> Result<Option<WebProxyRecordingState>, String> {
    managed_view(&window, &label)?;
    recordings.finish(window.app_handle(), &label).await
}

#[tauri::command]
pub async fn close_web_proxy_view(
    window: Window,
    recordings: State<'_, WebProxyRecordingManager>,
    label: String,
) -> Result<(), String> {
    let view = managed_view(&window, &label)?;
    let recording_result = recordings.finish(window.app_handle(), &label).await;
    let close_result = view.close().map_err(|error| error.to_string());
    if let Err(error) = recording_result {
        log::warn!("Failed to finish Web recording for {label}: {error}");
    }
    close_result
}

#[cfg(test)]
mod tests {
    use super::{is_valid_host_window_label, parse_proxy, parse_target, validate_label};

    #[test]
    fn validates_web_proxy_trust_boundary_inputs() {
        assert!(parse_target("https://example.com/login").is_ok());
        assert!(parse_target("file:///etc/passwd").is_err());
        assert!(parse_target("https://user:secret@example.com").is_err());
        assert!(parse_proxy("http://127.0.0.1:5001").is_ok());
        assert!(parse_proxy("https://127.0.0.1:5001").is_err());
        assert!(parse_proxy("http://user:secret@127.0.0.1:5001").is_err());
        assert!(validate_label("web-proxy-1234").is_ok());
        assert!(validate_label("other-view").is_err());
        assert!(is_valid_host_window_label("main"));
        assert!(is_valid_host_window_label("asset-1234-1720000000000"));
        assert!(!is_valid_host_window_label("asset-"));
        assert!(!is_valid_host_window_label("settings"));
        assert!(!is_valid_host_window_label("web-proxy-1234"));
    }
}

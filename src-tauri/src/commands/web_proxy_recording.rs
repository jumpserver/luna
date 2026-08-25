use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, Webview};
use tokio::sync::Mutex as AsyncMutex;
use url::Url;

const RECORDING_PATH: &str = "/_jumpserver/web-recordings";
const CAPTURE_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebProxyRecordingState {
    label: String,
    status: String,
    frame_count: usize,
    message: String,
    path: String,
}

#[derive(Default, Clone)]
pub(crate) struct WebProxyRecordingManager {
    inner: Arc<WebProxyRecordingManagerInner>,
}

#[derive(Default)]
struct WebProxyRecordingManagerInner {
    sessions: Mutex<HashMap<String, Arc<WebRecordingSession>>>,
    pause_reasons: Mutex<HashMap<String, HashSet<String>>>,
}

struct WebRecordingSession {
    label: String,
    id: String,
    endpoint: Url,
    app: AppHandle,
    client: reqwest::Client,
    started_at: Instant,
    paused: AtomicBool,
    stopped: AtomicBool,
    frame_count: AtomicUsize,
    capture_gate: AsyncMutex<()>,
}

#[derive(Deserialize)]
struct StartRecordingResponse {
    id: String,
}

#[derive(Deserialize)]
struct AddFrameResponse {
    frame_count: usize,
}

#[derive(Deserialize)]
struct FinishRecordingResponse {
    path: String,
    frame_count: usize,
}

impl WebProxyRecordingManager {
    pub(crate) fn has_sessions(&self) -> bool {
        self.inner
            .sessions
            .lock()
            .map(|sessions| !sessions.is_empty())
            .unwrap_or(false)
    }

    pub(crate) async fn finish_all(&self, app: &AppHandle) {
        let labels = self
            .inner
            .sessions
            .lock()
            .map(|sessions| sessions.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for label in labels {
            if let Err(error) = self.finish(app, &label).await {
                log::warn!("Failed to finish Web recording for {label}: {error}");
            }
        }
    }

    pub(crate) async fn start(
        &self,
        app: AppHandle,
        label: String,
        target_url: String,
        proxy_url: String,
        width: u32,
        height: u32,
    ) -> Result<WebProxyRecordingState, String> {
        if width == 0 || height == 0 || width > 8192 || height > 8192 {
            return Err("Web 录像尺寸无效".to_string());
        }
        if self
            .inner
            .sessions
            .lock()
            .map_err(|_| "读取 Web 录像状态失败".to_string())?
            .contains_key(&label)
        {
            return Err("当前 Website 标签已在录像".to_string());
        }

        let target = parse_http_url(&target_url, "Website 地址")?;
        let proxy = parse_http_url(&proxy_url, "Koko Web Proxy 地址")?;
        let endpoint = proxy
            .join(RECORDING_PATH)
            .map_err(|error| format!("构造 Koko 录像地址失败: {error}"))?;
        let client = recording_client()?;
        let response = client
            .post(endpoint.clone())
            .json(&serde_json::json!({
                "target_url": target,
                "width": width,
                "height": height,
            }))
            .send()
            .await
            .map_err(|error| format!("启动 Koko Web 录像失败: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "启动 Koko Web 录像失败: HTTP {}",
                response.status()
            ));
        }
        let started: StartRecordingResponse = response
            .json()
            .await
            .map_err(|error| format!("解析 Koko Web 录像响应失败: {error}"))?;
        if started.id.is_empty() {
            return Err("Koko 返回的 Web 录像 ID 为空".to_string());
        }

        let paused = self
            .inner
            .pause_reasons
            .lock()
            .map(|reasons| reasons.get(&label).is_some_and(|items| !items.is_empty()))
            .unwrap_or(false);
        let session = Arc::new(WebRecordingSession {
            label: label.clone(),
            id: started.id,
            endpoint,
            app: app.clone(),
            client,
            started_at: Instant::now(),
            paused: AtomicBool::new(paused),
            stopped: AtomicBool::new(false),
            frame_count: AtomicUsize::new(0),
            capture_gate: AsyncMutex::new(()),
        });
        self.inner
            .sessions
            .lock()
            .map_err(|_| "保存 Web 录像状态失败".to_string())?
            .insert(label, Arc::clone(&session));

        let initial = session.state(
            if paused { "paused" } else { "recording" },
            "Web 录像已开始",
            "",
        );
        emit_recording_state(&app, initial.clone());
        tauri::async_runtime::spawn(recording_loop(session));
        Ok(initial)
    }

    pub(crate) fn set_paused(
        &self,
        app: &AppHandle,
        label: &str,
        reason: &str,
        paused: bool,
        message: &str,
    ) {
        let mut is_paused = paused;
        if let Ok(mut labels) = self.inner.pause_reasons.lock() {
            if paused {
                labels
                    .entry(label.to_string())
                    .or_default()
                    .insert(reason.to_string());
            } else if let Some(reasons) = labels.get_mut(label) {
                reasons.remove(reason);
                if reasons.is_empty() {
                    labels.remove(label);
                }
            }
            is_paused = labels.get(label).is_some_and(|items| !items.is_empty());
        }
        let session = self
            .inner
            .sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(label).cloned());
        if let Some(session) = session {
            session.paused.store(is_paused, Ordering::Release);
            emit_recording_state(
                app,
                session.state(if is_paused { "paused" } else { "recording" }, message, ""),
            );
        }
    }

    pub(crate) async fn wait_for_pending_capture(&self, label: &str) {
        let session = self
            .inner
            .sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(label).cloned());
        if let Some(session) = session {
            let _guard = session.capture_gate.lock().await;
        }
    }

    pub(crate) async fn finish(
        &self,
        app: &AppHandle,
        label: &str,
    ) -> Result<Option<WebProxyRecordingState>, String> {
        if let Ok(mut labels) = self.inner.pause_reasons.lock() {
            labels.remove(label);
        }
        let session = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "读取 Web 录像状态失败".to_string())?
            .remove(label);
        let Some(session) = session else {
            return Ok(None);
        };

        session.stopped.store(true, Ordering::Release);
        emit_recording_state(app, session.state("finishing", "正在生成 Web 录像", ""));
        let _capture_guard = session.capture_gate.lock().await;
        let duration_ms = session.started_at.elapsed().as_millis().min(86_400_000) as u64;
        if session.frame_count.load(Ordering::Acquire) == 0 {
            let _ = session
                .client
                .delete(recording_session_url(&session)?)
                .send()
                .await;
            let state = session.state("finished", "录像时间过短，未生成文件", "");
            emit_recording_state(app, state.clone());
            return Ok(Some(state));
        }

        let response = session
            .client
            .post(
                recording_session_url(&session)?
                    .join("finish")
                    .map_err(|error| error.to_string())?,
            )
            .timeout(Duration::from_secs(120))
            .json(&serde_json::json!({ "duration_ms": duration_ms }))
            .send()
            .await
            .map_err(|error| format!("结束 Koko Web 录像失败: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "结束 Koko Web 录像失败: HTTP {}",
                response.status()
            ));
        }
        let finished: FinishRecordingResponse = response
            .json()
            .await
            .map_err(|error| format!("解析 Koko Web 录像结果失败: {error}"))?;
        session
            .frame_count
            .store(finished.frame_count, Ordering::Release);
        let state = session.state("finished", "Web 录像已生成", &finished.path);
        emit_recording_state(app, state.clone());
        Ok(Some(state))
    }
}

impl WebRecordingSession {
    fn state(&self, status: &str, message: &str, path: &str) -> WebProxyRecordingState {
        WebProxyRecordingState {
            label: self.label.clone(),
            status: status.to_string(),
            frame_count: self.frame_count.load(Ordering::Acquire),
            message: message.to_string(),
            path: path.to_string(),
        }
    }

    async fn capture_once(&self) -> Result<(), String> {
        let webview = self
            .app
            .get_webview(&self.label)
            .ok_or_else(|| "Web Proxy 视图已关闭".to_string())?;
        let jpeg = capture_webview_jpeg(webview).await?;
        if jpeg.len() > 2 << 20 {
            return Err("Web 录像截图超过 2 MiB".to_string());
        }
        let timestamp_ms = self.started_at.elapsed().as_millis().min(86_400_000) as u64;
        let url = recording_session_url(self)?
            .join(&format!("frames?timestamp_ms={timestamp_ms}"))
            .map_err(|error| error.to_string())?;
        let response = self
            .client
            .post(url)
            .header(reqwest::header::CONTENT_TYPE, "image/jpeg")
            .body(jpeg)
            .send()
            .await
            .map_err(|error| format!("上传 Web 录像帧失败: {error}"))?;
        if !response.status().is_success() {
            return Err(format!("上传 Web 录像帧失败: HTTP {}", response.status()));
        }
        let frame: AddFrameResponse = response
            .json()
            .await
            .map_err(|error| format!("解析 Web 录像帧响应失败: {error}"))?;
        self.frame_count.store(frame.frame_count, Ordering::Release);
        emit_recording_state(&self.app, self.state("recording", "正在录制 Website", ""));
        Ok(())
    }
}

async fn recording_loop(session: Arc<WebRecordingSession>) {
    let mut interval = tokio::time::interval(CAPTURE_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    interval.tick().await;
    loop {
        interval.tick().await;
        if session.stopped.load(Ordering::Acquire) {
            return;
        }
        if session.paused.load(Ordering::Acquire) {
            continue;
        }
        let _guard = session.capture_gate.lock().await;
        if session.stopped.load(Ordering::Acquire) || session.paused.load(Ordering::Acquire) {
            continue;
        }
        if let Err(error) = session.capture_once().await {
            session.stopped.store(true, Ordering::Release);
            emit_recording_state(&session.app, session.state("error", &error, ""));
            return;
        }
    }
}

fn emit_recording_state(app: &AppHandle, state: WebProxyRecordingState) {
    let _ = app.emit("web-proxy-recording-state", state);
}

fn recording_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .no_proxy()
        .build()
        .map_err(|error| error.to_string())
}

fn recording_session_url(session: &WebRecordingSession) -> Result<Url, String> {
    let base = if session.endpoint.path().ends_with('/') {
        session.endpoint.clone()
    } else {
        let mut endpoint = session.endpoint.clone();
        endpoint.set_path(&format!("{}/", endpoint.path()));
        endpoint
    };
    base.join(&format!("{}/", session.id))
        .map_err(|error| error.to_string())
}

fn parse_http_url(value: &str, label: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| format!("{label}无效: {error}"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(format!("{label}必须是不含凭据的 HTTP/HTTPS URL"));
    }
    Ok(url)
}

#[cfg(target_os = "macos")]
async fn capture_webview_jpeg(webview: Webview) -> Result<Vec<u8>, String> {
    use block2::RcBlock;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey, NSImage,
        NSImageCompressionFactor,
    };
    use objc2_foundation::{NSDictionary, NSError, NSNumber};
    use objc2_web_kit::WKWebView;
    use tokio::sync::oneshot;

    let (sender, receiver) = oneshot::channel::<Result<Vec<u8>, String>>();
    let sender = Arc::new(Mutex::new(Some(sender)));
    webview
        .with_webview(move |platform| unsafe {
            let native = &*platform.inner().cast::<WKWebView>();
            let callback_sender = Arc::clone(&sender);
            let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                let result = if !error.is_null() || image.is_null() {
                    Err("WKWebView 截图失败".to_string())
                } else {
                    let image = &*image;
                    image
                        .TIFFRepresentation()
                        .ok_or_else(|| "转换 Web 截图失败".to_string())
                        .and_then(|tiff| {
                            NSBitmapImageRep::imageRepWithData(&tiff)
                                .ok_or_else(|| "读取 Web 截图失败".to_string())
                        })
                        .and_then(|bitmap| {
                            let quality = NSNumber::new_f64(0.7);
                            bitmap.setProperty_withValue(NSImageCompressionFactor, Some(&quality));
                            let properties =
                                NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::new();
                            bitmap
                                .representationUsingType_properties(
                                    NSBitmapImageFileType::JPEG,
                                    &properties,
                                )
                                .map(|data| data.to_vec())
                                .ok_or_else(|| "生成 Web 录像 JPEG 失败".to_string())
                        })
                };
                if let Ok(mut sender) = callback_sender.lock() {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(result);
                    }
                }
            });
            native.takeSnapshotWithConfiguration_completionHandler(None, &callback);
        })
        .map_err(|error| format!("调用 WKWebView 截图失败: {error}"))?;
    tokio::time::timeout(Duration::from_secs(10), receiver)
        .await
        .map_err(|_| "WKWebView 截图超时".to_string())?
        .map_err(|_| "WKWebView 截图回调已关闭".to_string())?
}

#[cfg(not(target_os = "macos"))]
async fn capture_webview_jpeg(_webview: Webview) -> Result<Vec<u8>, String> {
    // ponytail: Native Web recording capture currently supports WKWebView on macOS;
    // add WebView2 CapturePreview and WebKitGTK snapshot implementations for other desktops.
    Err("当前平台尚未支持 Web Proxy 原生录像截图".to_string())
}

#[cfg(test)]
mod tests {
    use super::parse_http_url;

    #[test]
    fn validates_recording_control_urls() {
        assert!(parse_http_url("http://127.0.0.1:5001", "proxy").is_ok());
        assert!(parse_http_url("https://example.com/login", "target").is_ok());
        assert!(parse_http_url("file:///tmp/frame.jpg", "target").is_err());
        assert!(parse_http_url("http://user:secret@127.0.0.1", "proxy").is_err());
    }
}

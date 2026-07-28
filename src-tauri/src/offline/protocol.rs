use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
};

use tauri::{
    http::{
        header::{
            ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_LENGTH, CONTENT_RANGE,
            CONTENT_TYPE, RANGE,
        },
        Method, Request, Response, StatusCode,
    },
    AppHandle, Manager,
};

use super::{package::load_manifest, recording::RecordingMediaType, storage::OfflineStorage};

struct RequestedEntry<'a> {
    recording_id: &'a str,
    entry_id: &'a str,
}

fn parse_entry_path(path: &str) -> Option<RequestedEntry<'_>> {
    let mut segments = path.split('/').filter(|segment| !segment.is_empty());

    match (
        segments.next(),
        segments.next(),
        segments.next(),
        segments.next(),
        segments.next(),
    ) {
        (Some("recordings"), Some(recording_id), Some("entries"), Some(entry_id), None) => {
            Some(RequestedEntry {
                recording_id,
                entry_id,
            })
        }
        _ => None,
    }
}

fn media_content_type(media_type: RecordingMediaType) -> &'static str {
    match media_type {
        RecordingMediaType::Mp4 => "video/mp4",
        RecordingMediaType::Cast | RecordingMediaType::Gua | RecordingMediaType::Part => {
            "text/plain; charset=utf-8"
        }
    }
}

/// 解析单段 HTTP Range。
///
/// 返回值包含首尾字节，且两端都是闭区间。
fn parse_range(value: &str, file_length: u64) -> Result<(u64, u64), ()> {
    if file_length == 0 {
        return Err(());
    }

    let value = value.strip_prefix("bytes=").ok_or(())?;
    if value.contains(',') {
        // 播放器只需要单段 Range；多段响应需要 multipart body。
        return Err(());
    }

    let (start, end) = value.split_once('-').ok_or(())?;

    if start.is_empty() {
        let suffix_length = end.parse::<u64>().map_err(|_| ())?;
        if suffix_length == 0 {
            return Err(());
        }

        let length = suffix_length.min(file_length);
        return Ok((file_length - length, file_length - 1));
    }

    let start = start.parse::<u64>().map_err(|_| ())?;
    if start >= file_length {
        return Err(());
    }

    let end = if end.is_empty() {
        file_length - 1
    } else {
        end.parse::<u64>().map_err(|_| ())?.min(file_length - 1)
    };

    if end < start {
        return Err(());
    }

    Ok((start, end))
}

fn response(status: StatusCode, content_type: &'static str, body: Vec<u8>) -> Response<Vec<u8>> {
    match Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(CONTENT_LENGTH, body.len().to_string())
        .body(body)
    {
        Ok(response) => response,
        Err(_) => Response::new(b"response construction failed".to_vec()),
    }
}

fn error_response(status: StatusCode, message: &'static str) -> Response<Vec<u8>> {
    response(
        status,
        "text/plain; charset=utf-8",
        message.as_bytes().to_vec(),
    )
}

fn read_entry_response(storage: &OfflineStorage, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error_response(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }

    let Some(requested) = parse_entry_path(request.uri().path()) else {
        return error_response(StatusCode::BAD_REQUEST, "invalid offline entry URL");
    };

    let manifest = match load_manifest(storage, requested.recording_id) {
        Ok(manifest) => manifest,
        Err(_) => return error_response(StatusCode::NOT_FOUND, "recording not found"),
    };
    let Some(manifest_entry) = manifest
        .entries()
        .iter()
        .find(|entry| entry.entry_id == requested.entry_id)
    else {
        return error_response(StatusCode::NOT_FOUND, "recording entry not found");
    };

    let entry_path = match storage.resolve_entry(requested.recording_id, requested.entry_id) {
        Ok(path) => path,
        Err(_) => return error_response(StatusCode::NOT_FOUND, "recording entry not found"),
    };
    let mut file = match File::open(&entry_path) {
        Ok(file) => file,
        Err(_) => return error_response(StatusCode::NOT_FOUND, "recording entry not found"),
    };
    let file_length = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "read failed"),
    };

    let requested_range = request
        .headers()
        .get(RANGE)
        .and_then(|header| header.to_str().ok());
    let (status, start, end) = match requested_range {
        Some(value) => match parse_range(value, file_length) {
            Ok((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
            Err(()) => {
                let mut response =
                    error_response(StatusCode::RANGE_NOT_SATISFIABLE, "invalid byte range");
                if let Ok(value) = format!("bytes */{file_length}").parse() {
                    response.headers_mut().insert(CONTENT_RANGE, value);
                }
                return response;
            }
        },
        None if file_length > 0 => (StatusCode::OK, 0, file_length - 1),
        None => (StatusCode::OK, 0, 0),
    };

    let response_length = if file_length == 0 { 0 } else { end - start + 1 };
    let mut body = Vec::new();

    if request.method() != Method::HEAD && response_length > 0 {
        if file.seek(SeekFrom::Start(start)).is_err() {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, "read failed");
        }

        let mut limited_reader = file.take(response_length);
        body.reserve(response_length.min(8 * 1024 * 1024) as usize);
        if limited_reader.read_to_end(&mut body).is_err() || body.len() as u64 != response_length {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, "read failed");
        }
    }

    let mut builder = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, media_content_type(manifest_entry.media_type))
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, response_length.to_string());

    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(CONTENT_RANGE, format!("bytes {start}-{end}/{file_length}"));
    }

    match builder.body(body) {
        Ok(response) => response,
        Err(_) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "response construction failed",
        ),
    }
}

pub(crate) fn handle_request(app: &AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(storage) = app.try_state::<OfflineStorage>() else {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "offline storage is not initialized",
        );
    };

    read_entry_response(&storage, &request)
}

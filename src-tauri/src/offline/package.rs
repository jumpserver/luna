use super::{
    recording::{RecordingEntry, RecordingManifest, RecordingMediaType, RecordingMetadata},
    storage::{OfflineStorage, PendingRecording, StorageError},
};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::error::Error;
use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{fmt, io};
use tar::Archive;

const MANIFEST_FILE_NAME: &str = "manifest.json";
const REPLAY_METADATA_SUFFIX: &str = ".replay.json";
const REPLAY_GZIP_SUFFIX: &str = ".replay.gz";
const PART_GZIP_SUFFIX: &str = ".part.gz";
const CAST_GZIP_SUFFIX: &str = ".cast.gz";
const CAST_SUFFIX: &str = ".cast";
const MP4_SUFFIX: &str = ".mp4";

// 如果以后确实需要导入超过 4 GiB 的单个录像文件，
// 应升级为用户可配置的离线存储配额。
const MAX_EXTRACTED_ENTRY_BYTES: u64 = 4_u64 * 1024 * 1024 * 1024;

/// replay.json 只是描述信息，不应是大型文件。
///
/// 又不会因为恶意 metadata 消耗大量内存
const MAX_METADATA_BYTES: u64 = 1024 * 1024;

/// 单个录像包解压后的媒体文件总大小上限：16 GiB
///
/// ponytail: 当前使用固定上限；如果以后需要支持超大型录像，
/// 升级方向应是从应用配置中读取，而不是直接移除限制
const MAX_PACKAGE_BYTES: u64 = 16 * 1024 * 1024 * 1024;

/// 防止 TAR 中包含大量空文件，耗尽文件系统 inode
const MAX_MEDIA_ENTRIES: usize = 10_000;

static RECORDING_ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PackageEntryKind {
    Metadata,

    Media {
        media_type: RecordingMediaType,

        // 只有 .part 才有索引
        part_index: Option<u32>,
    },
}

#[derive(Debug)]
pub(crate) enum PackageError {
    InvalidReplayMetadata(serde_json::Error),

    InvalidManifest(serde_json::Error),

    SerializeManifest(serde_json::Error),

    UnsupportedSource(PathBuf),

    NoMediaEntries(PathBuf),

    /// 解压后的 entry 超过允许大小。
    EntryTooLarge {
        source_name: String,
        maximum_bytes: u64,
    },

    /// 打开文件、写文件、解压或 flush 失败。
    Io {
        operation: &'static str,
        path: PathBuf,
        source: io::Error,
    },

    Storage(StorageError),

    MetadataTooLarge {
        source_name: String,
        maximum_bytes: u64,
    },

    DuplicateReplayMetadata {
        source_name: String,
    },

    TooManyMediaEntries {
        maximum_entries: usize,
    },

    PackageTooLarge {
        maximum_bytes: u64,
    },
}

/// 一个已经成功写入 pending 目录的媒体文件。
///
/// 这里只保存“提取阶段”能够确定的数据。
#[derive(Debug)]
pub struct ExtractedMediaEntry {
    /// Rust 内部生成的安全文件名，例如 entry-00000000。
    ///
    /// 不直接使用 TAR 内部路径，可以避免：
    /// - 路径穿越
    /// - 重名覆盖
    /// - 不同平台文件名不兼容
    entry_id: String,

    /// TAR 中原始文件名，仅作为描述信息。
    source_name: String,

    media_type: RecordingMediaType,

    /// 实际写入磁盘的数据大小。
    ///
    /// 对 `.gz` 来说，这是解压后的大小。
    byte_length: u64,

    /// 分片序号，例如 replay.cast.3.gz 中的 3。
    part_index: Option<u32>,
}

/// TAR 遍历完成后的中间结果。
///
/// TAR entry 本身不能存入这个结构，因为 entry 借用了 Archive。
/// 所以必须在循环中立即读取，并转换成完全拥有所有权的数据。
#[derive(Debug, Default)]
struct ExtractedPackage {
    metadata: Option<ParsedReplayMetadata>,
    media: Vec<ExtractedMediaEntry>,
}

/// 分类后的 TAR entry
#[derive(Debug, Clone, PartialEq, Eq)]
struct ClassifiedPackageEntry {
    /// 只保留 basename，不保留 TAR 内部目录。
    ///
    /// 这个名称只能用于展示，不能直接作为 storage 写入路径。
    source_name: String,

    kind: PackageEntryKind,
}

/// replay.json 中 files 数组的一项。
///
/// 这些时间信息属于具体媒体文件，不属于整条录像
#[derive(Debug, Deserialize)]
struct RawReplayFile {
    name: Option<String>,
    start: Option<u64>,
    end: Option<u64>,
    duration: Option<u64>,
}

/// replay.json 经过解析和转换后的结果
///
/// metadata 是录像级信息；files 保留每个媒体文件的时间信息，
/// 后续创建 RecordingEntry 时会用它们填充 start_ms、end_ms 等字段
#[derive(Debug)]
struct ParsedReplayMetadata {
    metadata: RecordingMetadata,
    files: Vec<RawReplayFile>,
}

/// replay.json 在磁盘上的原始数据结构
///
/// 这是输入格式，不是播放器最终使用的数据模型
/// serde 会把 JSON 字段反序列化到这个结构中
#[derive(Debug, Deserialize)]
struct RawReplayMetadata {
    id: Option<String>,
    user: Option<String>,
    asset: Option<String>,
    account: Option<String>,
    protocol: Option<String>,
    login_from: Option<String>,
    remote_addr: Option<String>,
    date_start: Option<String>,
    date_end: Option<String>,
    duration: Option<String>,
    command_amount: Option<u64>,

    #[serde(default)]
    files: Vec<RawReplayFile>,
}

impl fmt::Display for PackageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidReplayMetadata(source) => {
                write!(formatter, "invalid replay metadata: {source}")
            }

            Self::InvalidManifest(source) => {
                write!(formatter, "invalid offline recording manifest: {source}")
            }

            Self::SerializeManifest(source) => {
                write!(
                    formatter,
                    "serialize offline recording manifest failed: {source}"
                )
            }

            Self::UnsupportedSource(path) => {
                write!(
                    formatter,
                    "unsupported offline recording file: {}",
                    path.display()
                )
            }

            Self::NoMediaEntries(path) => {
                write!(
                    formatter,
                    "no supported media entries found in {}",
                    path.display()
                )
            }

            Self::EntryTooLarge {
                source_name,
                maximum_bytes,
            } => {
                write!(
                    formatter,
                    "package entry exceeds {maximum_bytes} bytes: {source_name}"
                )
            }

            Self::Io {
                operation,
                path,
                source,
            } => {
                write!(
                    formatter,
                    "{operation} failed for {}: {source}",
                    path.display()
                )
            }

            Self::Storage(source) => {
                write!(formatter, "offline storage error: {source}")
            }
            Self::MetadataTooLarge {
                source_name,
                maximum_bytes,
            } => {
                write!(
                    formatter,
                    "metadata entry {source_name:?} exceeds the {maximum_bytes} byte limit"
                )
            }
            Self::DuplicateReplayMetadata { source_name } => {
                write!(
                    formatter,
                    "package contains more than one replay metadata entry; duplicate: {source_name:?}"
                )
            }
            Self::TooManyMediaEntries { maximum_entries } => {
                write!(
                    formatter,
                    "package contains more than {maximum_entries} media entries"
                )
            }
            Self::PackageTooLarge { maximum_bytes } => {
                write!(
                    formatter,
                    "extracted package exceeds the {maximum_bytes} byte limit"
                )
            }
        }
    }
}

impl Error for PackageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidReplayMetadata(source) => Some(source),
            Self::InvalidManifest(source) | Self::SerializeManifest(source) => Some(source),
            Self::Io { source, .. } => Some(source),
            Self::Storage(source) => Some(source),
            Self::UnsupportedSource(_)
            | Self::NoMediaEntries(_)
            | Self::EntryTooLarge { .. }
            | Self::MetadataTooLarge { .. }
            | Self::DuplicateReplayMetadata { .. }
            | Self::TooManyMediaEntries { .. }
            | Self::PackageTooLarge { .. } => None,
        }
    }
}

impl From<StorageError> for PackageError {
    fn from(source: StorageError) -> Self {
        Self::Storage(source)
    }
}

impl PackageError {
    fn io(operation: &'static str, path: &Path, source: io::Error) -> Self {
        Self::Io {
            operation,
            path: path.to_path_buf(),
            source,
        }
    }
}

impl From<RawReplayMetadata> for ParsedReplayMetadata {
    fn from(raw: RawReplayMetadata) -> Self {
        Self {
            metadata: RecordingMetadata {
                source_id: raw.id,
                user: raw.user,
                asset: raw.asset,
                account: raw.account,
                protocol: raw.protocol,
                login_from: raw.login_from,
                remote_addr: raw.remote_addr,
                date_start: raw.date_start,
                date_end: raw.date_end,
                duration: raw.duration,
                command_amount: raw.command_amount,
            },
            files: raw.files,
        }
    }
}

fn parse_replay_metadata(bytes: &[u8]) -> Result<ParsedReplayMetadata, PackageError> {
    let raw = serde_json::from_slice::<RawReplayMetadata>(bytes)
        .map_err(PackageError::InvalidReplayMetadata)?;

    Ok(raw.into())
}

fn classify_entry_path(path: &Path) -> Option<ClassifiedPackageEntry> {
    let file_name = path.file_name()?.to_str()?;
    let lowercase_name = file_name.to_ascii_lowercase();

    let kind = if lowercase_name.ends_with(REPLAY_METADATA_SUFFIX) {
        PackageEntryKind::Metadata
    } else if lowercase_name.ends_with(PART_GZIP_SUFFIX) {
        PackageEntryKind::Media {
            media_type: RecordingMediaType::Part,
            part_index: Some(parse_part_index(&lowercase_name)?),
        }
    } else if lowercase_name.ends_with(REPLAY_GZIP_SUFFIX) {
        PackageEntryKind::Media {
            media_type: RecordingMediaType::Gua,
            part_index: None,
        }
    } else if lowercase_name.ends_with(CAST_GZIP_SUFFIX) || lowercase_name.ends_with(CAST_SUFFIX) {
        PackageEntryKind::Media {
            media_type: RecordingMediaType::Cast,
            part_index: None,
        }
    } else if lowercase_name.ends_with(MP4_SUFFIX) {
        PackageEntryKind::Media {
            media_type: RecordingMediaType::Mp4,
            part_index: None,
        }
    } else {
        return None;
    };

    Some(ClassifiedPackageEntry {
        source_name: file_name.to_owned(),
        kind,
    })
}

/// 从 `<recording-id>.<index>.part.gz` 中解析数字索引。
///
/// 示例：
///
/// ```text
/// session-id.0.part.gz  -> Some(0)
/// session-id.12.part.gz -> Some(12)
/// session-id.x.part.gz  -> None
/// ```
fn parse_part_index(file_name: &str) -> Option<u32> {
    // strip_suffix 删除已确认的 `.part.gz`。
    let stem = file_name.strip_suffix(PART_GZIP_SUFFIX)?;

    // rsplit_once 从最后一个点分割：
    //
    // "session-id.12" -> ("session-id", "12")
    let (recording_name, raw_index) = stem.rsplit_once('.')?;

    // 不接受 `.0.part.gz` 这种缺少录像名称的文件。
    if recording_name.is_empty() {
        return None;
    }

    raw_index.parse::<u32>().ok()
}

/// 把 reader 流式复制到 writer，并限制最终写入大小。
///
/// 这里读取 `最大值 + 1` 个字节，是为了区分：
///
/// - 文件大小刚好等于上限
/// - 文件真实大小超过上限
fn copy_entry_with_limit<R, W>(
    reader: R,
    writer: &mut W,
    source_name: &str,
    destination: &Path,
) -> Result<u64, PackageError>
where
    R: Read,
    W: Write,
{
    // take() 不会一次性分配这么大的内存。
    // 它只是包装原始 reader，并记录还允许读取多少字节。
    let mut limited_reader = reader.take(MAX_EXTRACTED_ENTRY_BYTES + 1);

    let written = io::copy(&mut limited_reader, writer)
        .map_err(|source| PackageError::io("copy package entry", destination, source))?;

    if written > MAX_EXTRACTED_ENTRY_BYTES {
        return Err(PackageError::EntryTooLarge {
            source_name: source_name.to_owned(),
            maximum_bytes: MAX_EXTRACTED_ENTRY_BYTES,
        });
    }

    Ok(written)
}

/// 将一个 TAR 媒体 entry 写入临时存储。
///
/// `.gz` 文件会边读取、边解压、边写入磁盘；
/// MP4 和未压缩 cast 文件会原样复制。
///
/// 返回值是最终写入磁盘的字节数，而不是 TAR 中压缩文件的大小
///
/// 压缩文件：
/// tar::Entry → GzDecoder → io::copy → BufWriter → File
///
/// 未压缩文件：
/// tar::Entry → io::copy → BufWriter → File
fn write_media_entry<R>(
    reader: R,
    source_name: &str,
    destination: &Path,
) -> Result<u64, PackageError>
where
    R: Read,
{
    let output_file = File::create(destination)
        .map_err(|source| PackageError::io("create extracted entry", destination, source))?;

    // BufWriter 减少系统调用次数。
    // 上层每次写较小数据时，它先缓存在内存中，再批量写入磁盘
    let mut writer = BufWriter::new(output_file);

    let byte_length = if source_name.to_ascii_lowercase().ends_with(".gz") {
        // GzDecoder 本身实现 Read
        //
        // 当 copy_entry_with_limit 从 decoder 读取数据时，
        // decoder 会按需从 TAR entry 中取得压缩数据并解压
        let decoder = GzDecoder::new(reader);
        copy_entry_with_limit(decoder, &mut writer, source_name, destination)?
    } else {
        // MP4、普通 .cast 文件不需要解压，直接复制。
        copy_entry_with_limit(reader, &mut writer, source_name, destination)?
    };

    // 确保 BufWriter 中尚未写出的数据真正提交给 File
    writer
        .flush()
        .map_err(|source| PackageError::io("flush extracted entry", destination, source))?;

    Ok(byte_length)
}

/// 读取 replay.json，同时限制其最大内存占用
fn read_metadata_entry<R: Read>(
    reader: R,
    source_name: &str,
    tar_path: &Path,
) -> Result<Vec<u8>, PackageError> {
    // 多读取一个字节，用来判断文件是否超过限制。
    let mut limited_reader = reader.take(MAX_METADATA_BYTES + 1);
    let mut bytes = Vec::new();

    limited_reader.read_to_end(&mut bytes).map_err(|source| {
        PackageError::io("read replay metadata from tar entry", tar_path, source)
    })?;

    if bytes.len() as u64 > MAX_METADATA_BYTES {
        return Err(PackageError::MetadataTooLarge {
            source_name: source_name.to_owned(),
            maximum_bytes: MAX_METADATA_BYTES,
        });
    }

    Ok(bytes)
}

/// 将 TAR 中支持的内容提取到 pending 工作目录。
///
/// 此函数只负责：
/// 1. 遍历 TAR；
/// 2. 分类 entry；
/// 3. 写入 pending 目录；
/// 4. 返回提取结果。
///
/// 它不负责生成 manifest，也不负责 commit。
fn extract_tar_to_pending(
    tar_path: &Path,
    pending: &PendingRecording,
) -> Result<ExtractedPackage, PackageError> {
    let tar_file = File::open(tar_path)
        .map_err(|source| PackageError::io("open tar package", tar_path, source))?;

    let mut archive = Archive::new(tar_file);

    let entries = archive
        .entries()
        .map_err(|source| PackageError::io("read tar package", tar_path, source))?;

    let mut extracted = ExtractedPackage::default();
    let mut total_byte_length = 0_u64;

    for entry_result in entries {
        // Entry 借用了 archive，因此必须在本次循环中处理完毕。
        let mut entry =
            entry_result.map_err(|source| PackageError::io("read tar entry", tar_path, source))?;

        // 只处理普通文件。
        //
        // 目录、符号链接和硬链接都不需要提取，尤其不能跟随符号链接，
        // 否则可能突破 pending 工作目录的边界。
        if !entry.header().entry_type().is_file() {
            continue;
        }

        // entry.path() 返回 Cow<Path>，它可能借用 entry 内部的数据。
        //
        // 后面读取 entry 时需要可变借用，因此这里调用 into_owned()，
        // 把路径转换成独立的 PathBuf，避免同时持有不可变和可变借用。
        let entry_path: PathBuf = entry
            .path()
            .map_err(|source| PackageError::io("read tar entry path", tar_path, source))?
            .into_owned();

        let Some(classified) = classify_entry_path(&entry_path) else {
            // TAR 中无关的文件直接忽略。
            continue;
        };

        match classified.kind {
            PackageEntryKind::Metadata => {
                if extracted.metadata.is_some() {
                    return Err(PackageError::DuplicateReplayMetadata {
                        source_name: classified.source_name,
                    });
                }

                let metadata_bytes =
                    read_metadata_entry(&mut entry, &classified.source_name, tar_path)?;

                extracted.metadata = Some(parse_replay_metadata(&metadata_bytes)?);
            }

            PackageEntryKind::Media {
                media_type,
                part_index,
            } => {
                if extracted.media.len() >= MAX_MEDIA_ENTRIES {
                    return Err(PackageError::TooManyMediaEntries {
                        maximum_entries: MAX_MEDIA_ENTRIES,
                    });
                }

                // 使用遍历顺序生成内部 ID。
                //
                // source_name 只用于展示和诊断，绝不作为实际磁盘路径。
                let entry_id = format!("entry-{:08}", extracted.media.len());

                // PendingRecording 统一负责验证 entry_id 并构造安全路径。
                let destination = pending.entry_path(&entry_id)?;

                // write_media_entry 会：
                // - 对 .gz 使用流式 GzipDecoder；
                // - 对普通文件直接流式复制；
                // - 限制单文件大小；
                // - 返回实际写入字节数。
                let byte_length =
                    write_media_entry(&mut entry, &classified.source_name, &destination)?;

                // checked_add 同时处理 u64 溢出。
                let next_total = total_byte_length.checked_add(byte_length).ok_or(
                    PackageError::PackageTooLarge {
                        maximum_bytes: MAX_PACKAGE_BYTES,
                    },
                )?;

                if next_total > MAX_PACKAGE_BYTES {
                    return Err(PackageError::PackageTooLarge {
                        maximum_bytes: MAX_PACKAGE_BYTES,
                    });
                }

                total_byte_length = next_total;

                extracted.media.push(ExtractedMediaEntry {
                    entry_id,
                    source_name: classified.source_name,
                    media_type,
                    byte_length,
                    part_index,
                });
            }
        }
    }

    Ok(extracted)
}

/// 将一个普通媒体文件写入 pending 目录。
fn extract_single_file_to_pending(
    source_path: &Path,
    pending: &PendingRecording,
) -> Result<ExtractedPackage, PackageError> {
    let classified = classify_entry_path(source_path)
        .ok_or_else(|| PackageError::UnsupportedSource(source_path.to_path_buf()))?;

    let PackageEntryKind::Media {
        media_type,
        part_index,
    } = classified.kind
    else {
        // 单独的 replay.json 没有可播放内容，不能形成一条录像。
        return Err(PackageError::UnsupportedSource(source_path.to_path_buf()));
    };

    let source_file = File::open(source_path)
        .map_err(|source| PackageError::io("open recording file", source_path, source))?;
    let entry_id = "entry-00000000".to_owned();
    let destination = pending.entry_path(&entry_id)?;
    let byte_length = write_media_entry(source_file, &classified.source_name, &destination)?;

    Ok(ExtractedPackage {
        metadata: None,
        media: vec![ExtractedMediaEntry {
            entry_id,
            source_name: classified.source_name,
            media_type,
            byte_length,
            part_index,
        }],
    })
}

fn replay_file_name(file: &RawReplayFile) -> Option<&str> {
    Path::new(file.name.as_deref()?)
        .file_name()
        .and_then(|name| name.to_str())
}

fn build_manifest(
    recording_id: String,
    label: String,
    source_path: &Path,
    mut extracted: ExtractedPackage,
) -> Result<RecordingManifest, PackageError> {
    if extracted.media.is_empty() {
        return Err(PackageError::NoMediaEntries(source_path.to_path_buf()));
    }

    // TAR 内部顺序不可靠。分片播放器需要按文件名中的数字索引播放。
    extracted.media.sort_by_key(|entry| {
        (
            entry.media_type != RecordingMediaType::Part,
            entry.part_index.unwrap_or(u32::MAX),
        )
    });

    let part_total = extracted
        .media
        .iter()
        .filter(|entry| entry.media_type == RecordingMediaType::Part)
        .count() as u32;

    let (metadata, replay_files) = extracted
        .metadata
        .map(|parsed| (parsed.metadata, parsed.files))
        .unwrap_or_default();

    let mut manifest = RecordingManifest::new(recording_id, label, metadata);

    for media in extracted.media {
        let file_metadata = replay_files
            .iter()
            .find(|file| replay_file_name(file) == Some(media.source_name.as_str()));

        manifest.push_entry(RecordingEntry {
            entry_id: media.entry_id,
            source_name: media.source_name,
            media_type: media.media_type,
            byte_length: media.byte_length,
            part_index: media.part_index,
            part_total: (media.media_type == RecordingMediaType::Part && part_total > 1)
                .then_some(part_total),
            start_ms: file_metadata.and_then(|file| file.start),
            end_ms: file_metadata.and_then(|file| file.end),
            duration_ms: file_metadata.and_then(|file| file.duration),
        });
    }

    Ok(manifest)
}

fn write_manifest(
    pending: &PendingRecording,
    manifest: &RecordingManifest,
) -> Result<(), PackageError> {
    let manifest_path = pending.directory().join(MANIFEST_FILE_NAME);
    let manifest_file = File::create(&manifest_path)
        .map_err(|source| PackageError::io("create recording manifest", &manifest_path, source))?;
    let mut writer = BufWriter::new(manifest_file);

    serde_json::to_writer_pretty(&mut writer, manifest).map_err(PackageError::SerializeManifest)?;
    writer
        .flush()
        .map_err(|source| PackageError::io("flush recording manifest", &manifest_path, source))
}

fn next_recording_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let sequence = RECORDING_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed);

    format!("recording-{timestamp}-{sequence}")
}

fn recording_label(source_path: &Path) -> String {
    let file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("offline-recording");
    let lowercase_name = file_name.to_ascii_lowercase();

    for suffix in [
        ".replay.tar",
        ".tar",
        CAST_GZIP_SUFFIX,
        CAST_SUFFIX,
        REPLAY_GZIP_SUFFIX,
        PART_GZIP_SUFFIX,
        MP4_SUFFIX,
    ] {
        if lowercase_name.ends_with(suffix) {
            return file_name[..file_name.len() - suffix.len()].to_owned();
        }
    }

    file_name.to_owned()
}

/// 导入 TAR 或单个媒体文件，并在全部写入成功后原子提交。
pub(crate) fn import_recording(
    storage: &OfflineStorage,
    source_path: &Path,
) -> Result<RecordingManifest, PackageError> {
    let recording_id = next_recording_id();
    let pending = storage.begin_recording(&recording_id)?;
    let is_tar = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase().ends_with(".tar"))
        .unwrap_or(false);

    let extracted = if is_tar {
        extract_tar_to_pending(source_path, &pending)?
    } else {
        extract_single_file_to_pending(source_path, &pending)?
    };

    let manifest = build_manifest(
        recording_id,
        recording_label(source_path),
        source_path,
        extracted,
    )?;
    write_manifest(&pending, &manifest)?;

    // commit_recording 按值取得 pending 的所有权。
    // 成功后目录从 .pending-* 原子重命名为正式 recording 目录；
    // 之前任意一步失败，PendingRecording::drop 都会清理临时目录。
    storage.commit_recording(pending)?;

    Ok(manifest)
}

pub(crate) fn load_manifest(
    storage: &OfflineStorage,
    recording_id: &str,
) -> Result<RecordingManifest, PackageError> {
    let manifest_path = storage.resolve_manifest(recording_id)?;
    let file = File::open(&manifest_path)
        .map_err(|source| PackageError::io("open recording manifest", &manifest_path, source))?;

    serde_json::from_reader(file).map_err(PackageError::InvalidManifest)
}

pub(crate) fn list_recordings(
    storage: &OfflineStorage,
) -> Result<Vec<RecordingManifest>, PackageError> {
    let mut manifests = storage
        .recording_ids()?
        .into_iter()
        .map(|recording_id| load_manifest(storage, &recording_id))
        .collect::<Result<Vec<_>, _>>()?;

    manifests.sort_by(|left, right| right.recording_id().cmp(left.recording_id()));
    Ok(manifests)
}

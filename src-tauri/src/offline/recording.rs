use serde::{Deserialize, Serialize};

pub(crate) const MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RecordingMediaType {
    /// 完整的 Guacamole 指令流
    Gua,

    /// 分段的 Guacamole 指令流
    Part,

    /// Asciinema cast 文本录像
    Cast,

    /// 已编码的视频文件
    Mp4,
}

/// 录像级别的元数据
///
/// 这些信息描述整个会话，不属于某一个具体 entry
/// 字段使用 Option，是因为单独导入 MP4、cast 等文件时，
/// 可能没有同时提供 replay.json
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RecordingMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) user: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) asset: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) account: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) protocol: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) login_from: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) remote_addr: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) date_start: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) date_end: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) duration: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) command_amount: Option<u64>,
}

/// 一条可以被播放器打开的媒体记录。
///
/// 一个 TAR 可能产生多个 RecordingEntry，例如多个 `.part.gz`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RecordingEntry {
    /// 后端生成的安全 ID，同时也是 entries/ 下的文件名。
    ///
    /// 只能把这个字段交给 OfflineStorage::resolve_entry。
    pub(crate) entry_id: String,

    /// 输入文件的原始名称，只用于界面显示。
    ///
    /// 该字段属于不可信数据，不能直接拼接成文件路径。
    pub(crate) source_name: String,

    pub(crate) media_type: RecordingMediaType,

    /// 最终写入磁盘的字节数。
    pub(crate) byte_length: u64,

    /// 当前分段在源文件中的零基索引。
    ///
    /// 例如 `session.0.part.gz` 对应 part_index = 0。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) part_index: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) part_total: Option<u32>,

    /// replay.json 中记录的开始时间，单位为毫秒。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) start_ms: Option<u64>,

    /// replay.json 中记录的结束时间，单位为毫秒。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) end_ms: Option<u64>,

    /// 当前 entry 的持续时间，单位为毫秒。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) duration_ms: Option<u64>,
}

/// 一条已经完成解析并可以提交的离线录像描述。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RecordingManifest {
    version: u32,
    recording_id: String,
    label: String,
    metadata: RecordingMetadata,
    entries: Vec<RecordingEntry>,
}

impl RecordingManifest {
    pub(crate) fn new(recording_id: String, label: String, metadata: RecordingMetadata) -> Self {
        Self {
            version: MANIFEST_VERSION,
            recording_id,
            label,
            metadata,
            entries: Vec::new(),
        }
    }

    pub(crate) fn push_entry(&mut self, entry: RecordingEntry) {
        self.entries.push(entry);
    }

    pub(crate) fn recording_id(&self) -> &str {
        &self.recording_id
    }

    pub(crate) fn entries(&self) -> &[RecordingEntry] {
        &self.entries
    }
}

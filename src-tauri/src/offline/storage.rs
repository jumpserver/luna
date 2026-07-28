use std::error::Error;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use std::{fmt, fs, io};

const ENTRIES_DIR_NAME: &str = "entries";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const PENDING_PREFIX: &str = ".pending-";
const MAX_IDENTIFIER_LENGTH: usize = 128;

#[derive(Debug)]
pub enum StorageError {
    InvalidIdentifier {
        kind: &'static str,
        value: String,
    },
    RecordingAlreadyExists(String),
    RecordingNotFound(String),
    EntryNotFound {
        recording_id: String,
        entry_id: String,
    },
    UnexpectedFileType(PathBuf),
    PathEscapesStorage(PathBuf),
    Io {
        operation: &'static str,
        path: PathBuf,
        source: std::io::Error,
    },
}

impl StorageError {
    fn io(operation: &'static str, path: &Path, source: io::Error) -> Self {
        Self::Io {
            operation,
            path: path.to_path_buf(),
            source,
        }
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidIdentifier { kind, value } => {
                write!(formatter, "invalid {kind} identifier: {value}")
            }
            Self::RecordingAlreadyExists(id) => {
                write!(formatter, "recording already exists: {id}")
            }
            Self::RecordingNotFound(id) => {
                write!(formatter, "recording not found: {id}")
            }
            Self::EntryNotFound {
                recording_id,
                entry_id,
            } => {
                write!(
                    formatter,
                    "recording entry not found: {recording_id}/{entry_id}"
                )
            }
            Self::UnexpectedFileType(path) => {
                write!(formatter, "unexpected file type: {}", path.display())
            }
            Self::PathEscapesStorage(path) => {
                write!(
                    formatter,
                    "resolved path escapes offline storage: {}",
                    path.display()
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
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct OfflineStorage {
    root: PathBuf,
}

#[derive(Debug)]
pub struct PendingRecording {
    id: String,
    working_dir: PathBuf,
    final_dir: PathBuf,
    cleanup_on_drop: bool,
}

impl OfflineStorage {
    pub fn open(root: PathBuf) -> Result<Self, StorageError> {
        // 递归创建一个目录及其所有父组件
        fs::create_dir_all(&root)
            .map_err(|error| StorageError::io("create storage directory", &root, error))?;

        // 返回路径的规范、绝对形式
        let root = fs::canonicalize(&root)
            .map_err(|error| StorageError::io("resolve storage directory", &root, error))?;

        Ok(Self { root })
    }

    pub fn begin_recording(&self, recording_id: &str) -> Result<PendingRecording, StorageError> {
        validate_identifier("recording", recording_id)?;

        let final_dir = self.root.join(recording_id);
        let working_dir = self.root.join(format!("{PENDING_PREFIX}{recording_id}"));
        if final_dir.exists() || working_dir.exists() {
            return Err(StorageError::RecordingAlreadyExists(
                recording_id.to_owned(),
            ));
        }

        fs::create_dir(&working_dir).map_err(|error| {
            StorageError::io("create pending recording directory", &working_dir, error)
        })?;

        let entries_dir = working_dir.join(ENTRIES_DIR_NAME);
        if let Err(error) = fs::create_dir(&entries_dir) {
            let _ = fs::remove_dir_all(&working_dir);

            return Err(StorageError::io(
                "create recording entries directory",
                &entries_dir,
                error,
            ));
        }

        Ok(PendingRecording {
            id: recording_id.to_owned(),
            working_dir,
            final_dir,
            cleanup_on_drop: true,
        })
    }

    /// 将临时录像目录提交为正式录像目录。
    ///
    /// `pending` 按值传入，表示该函数取得 PendingRecording 的所有权。
    /// 提交之后，调用方不能继续使用原来的 pending。
    pub fn commit_recording(&self, mut pending: PendingRecording) -> Result<(), StorageError> {
        if pending.final_dir.exists() {
            return Err(StorageError::RecordingAlreadyExists(pending.id.clone()));
        }

        fs::rename(&pending.working_dir, &pending.final_dir).map_err(|error| {
            StorageError::io("commit recording directory", &pending.working_dir, error)
        })?;

        // 提交已经完成，不再让 PendingRecording::drop 清理临时目录。
        //
        // 当前代码即使不设置它，也不会删除 final_dir：
        // 因为 Drop 删除的是已经被 rename 掉的 working_dir。
        // 但从状态语义上必须关闭清理开关。
        pending.cleanup_on_drop = false;

        Ok(())
    }

    pub fn resolve_entry(
        &self,
        recording_id: &str,
        entry_id: &str,
    ) -> Result<PathBuf, StorageError> {
        validate_identifier("recording", recording_id)?;
        validate_identifier("entry", entry_id)?;

        let entries_dir = self.root.join(recording_id).join(ENTRIES_DIR_NAME);
        let canonical_entries_dir = fs::canonicalize(&entries_dir).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                StorageError::RecordingNotFound(recording_id.to_owned())
            } else {
                StorageError::io("resolve recording entries directory", &entries_dir, error)
            }
        })?;

        // canonicalize 会解析符号链接
        // 如果 entries/ 被替换成指向缓存目录之外的链接，必须拒绝读取
        if !canonical_entries_dir.starts_with(&self.root) {
            return Err(StorageError::PathEscapesStorage(canonical_entries_dir));
        }

        let candidate = entries_dir.join(entry_id);
        let metadata = fs::symlink_metadata(&candidate).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                StorageError::EntryNotFound {
                    recording_id: recording_id.to_owned(),
                    entry_id: entry_id.to_owned(),
                }
            } else {
                StorageError::io("inspect recording entry", &candidate, error)
            }
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(StorageError::UnexpectedFileType(candidate));
        }

        let canonical_candidate = fs::canonicalize(&candidate)
            .map_err(|error| StorageError::io("resolve recording entry", &candidate, error))?;

        if !canonical_candidate.starts_with(&canonical_entries_dir) {
            return Err(StorageError::PathEscapesStorage(canonical_candidate));
        }

        Ok(canonical_candidate)
    }

    pub fn resolve_manifest(&self, recording_id: &str) -> Result<PathBuf, StorageError> {
        validate_identifier("recording", recording_id)?;

        let recording_dir = self.root.join(recording_id);
        let canonical_recording_dir = fs::canonicalize(&recording_dir).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                StorageError::RecordingNotFound(recording_id.to_owned())
            } else {
                StorageError::io("resolve recording directory", &recording_dir, error)
            }
        })?;

        if !canonical_recording_dir.starts_with(&self.root) {
            return Err(StorageError::PathEscapesStorage(canonical_recording_dir));
        }

        let manifest_path = recording_dir.join(MANIFEST_FILE_NAME);
        let metadata = fs::symlink_metadata(&manifest_path).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                StorageError::RecordingNotFound(recording_id.to_owned())
            } else {
                StorageError::io("inspect recording manifest", &manifest_path, error)
            }
        })?;

        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(StorageError::UnexpectedFileType(manifest_path));
        }

        let canonical_manifest = fs::canonicalize(&manifest_path).map_err(|error| {
            StorageError::io("resolve recording manifest", &manifest_path, error)
        })?;

        if !canonical_manifest.starts_with(&canonical_recording_dir) {
            return Err(StorageError::PathEscapesStorage(canonical_manifest));
        }

        Ok(canonical_manifest)
    }

    pub fn recording_ids(&self) -> Result<Vec<String>, StorageError> {
        let entries = fs::read_dir(&self.root)
            .map_err(|error| StorageError::io("read storage directory", &self.root, error))?;
        let mut recording_ids = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|error| {
                StorageError::io("read storage directory entry", &self.root, error)
            })?;
            let file_type = entry.file_type().map_err(|error| {
                StorageError::io("inspect recording directory type", &entry.path(), error)
            })?;

            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }

            let Some(recording_id) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };

            if recording_id.starts_with(PENDING_PREFIX)
                || validate_identifier("recording", &recording_id).is_err()
            {
                continue;
            }

            recording_ids.push(recording_id);
        }

        Ok(recording_ids)
    }

    pub fn remove_recording(&self, recording_id: &str) -> Result<(), StorageError> {
        validate_identifier("recording", recording_id)?;

        let recording_dir = self.root.join(recording_id);
        let metadata = match fs::symlink_metadata(&recording_dir) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(());
            }
            Err(error) => {
                return Err(StorageError::io(
                    "inspect recording directory",
                    &recording_dir,
                    error,
                ));
            }
        };

        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(StorageError::UnexpectedFileType(recording_dir));
        }

        fs::remove_dir_all(&recording_dir).map_err(|error| {
            StorageError::io("remove recording directory", &recording_dir, error)
        })?;

        Ok(())
    }

    pub fn cleanup_stale(&self, maximum_age: Duration) -> Result<(), StorageError> {
        let entries = fs::read_dir(&self.root)
            .map_err(|error| StorageError::io("read storage directory", &self.root, error))?;

        for entry in entries {
            let entry = entry.map_err(|error| {
                StorageError::io("read storage directory entry", &self.root, error)
            })?;

            let file_name = entry.file_name();
            let Some(file_name) = file_name.to_str() else {
                continue;
            };

            if !file_name.starts_with(PENDING_PREFIX) {
                continue;
            }

            // DirEntry::file_type 不会跟随符号链接
            // 清理程序只处理我们创建的真实 pending 目录
            let file_type = entry.file_type().map_err(|error| {
                StorageError::io("inspect pending recording type", &entry.path(), error)
            })?;
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }

            let metadata = entry.metadata().map_err(|error| {
                StorageError::io("inspect pending recording", &entry.path(), error)
            })?;

            if !metadata.is_dir() {
                continue;
            }

            let modified = metadata.modified().map_err(|error| {
                StorageError::io(
                    "read pending recording modification time",
                    &entry.path(),
                    error,
                )
            })?;

            let is_stale = SystemTime::now()
                .duration_since(modified)
                .map(|age| age >= maximum_age)
                .unwrap_or(false);

            if is_stale {
                fs::remove_dir_all(entry.path()).map_err(|error| {
                    StorageError::io("remove stale pending recording", &entry.path(), error)
                })?;
            }
        }

        Ok(())
    }
}

impl PendingRecording {
    pub fn directory(&self) -> &Path {
        &self.working_dir
    }

    pub fn entries_directory(&self) -> PathBuf {
        self.working_dir.join(ENTRIES_DIR_NAME)
    }

    pub fn entry_path(&self, entry_id: &str) -> Result<PathBuf, StorageError> {
        validate_identifier("entry", entry_id)?;

        Ok(self.entries_directory().join(entry_id))
    }
}

impl Drop for PendingRecording {
    fn drop(&mut self) {
        if self.cleanup_on_drop {
            let _ = fs::remove_dir_all(&self.working_dir);
        }
    }
}

fn validate_identifier(kind: &'static str, value: &str) -> Result<(), StorageError> {
    let valid_length = !value.is_empty() && value.len() <= MAX_IDENTIFIER_LENGTH;

    let valid_characters = value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_');

    if !valid_length || !valid_characters {
        return Err(StorageError::InvalidIdentifier {
            kind,
            value: value.to_owned(),
        });
    }

    Ok(())
}

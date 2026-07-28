## `storage.rs`

### `working_dir`

`working_dir` 用于状态管理，因为在解压文件时不能直接将文件解压入最终目录。假设解压 TAR 时写到一半发生错误：

```txt
rec-001/
└── entries/
    ├── entry-0001    已完成
    └── entry-0002    只写了一半
```

如果播放器扫描到 rec-001，它会把损坏的录像当成正常录像。因此录像会暂时写到 `.pending-rec-001/`，全部解析、解压、写入成功后，执行：

```rs
fs::rename(".pending-rec-001", "rec-001")
```

而且 `working_dir` 和 `final_dir` 都位于同一个 root 下，通常能保证 rename 是同文件系统的原子操作

### `entries_dir`

`entries_dir` 表示录像里的媒体内容，当前前端 TAR 解析代码本来就可能得到多个文件。例如：

```txt
record.replay.json
record.0.part.gz
record.1.part.gz
```

后续会标准化为：

```txt
rec-001/
├── manifest.json
└── entries/
    ├── entry-0001
    └── entry-0002
```

## 当前完整流程

```txt
本地 TAR / cast / cast.gz / replay.gz / part.gz / MP4
  → import_offline_recording
  → 创建 .pending-<recording-id>/
  → Rust 顺序读取 TAR，并流式解压 gzip
  → 写入 entries/entry-*
  → 生成 manifest.json
  → rename 为正式录像目录
  → 返回 RecordingManifest
```

任意一步失败时，`PendingRecording::drop` 会删除未完成目录。播放器不会看到半成品。

## Tauri 调用入口

- `import_offline_recording(filePath)`：导入一个 TAR 或媒体文件。
- `list_offline_recordings()`：读取已经提交的 manifest。
- `remove_offline_recording(recordingId)`：删除一条离线录像。
- `get_offline_entry_url(recordingId, entryId)`：返回播放器使用的 custom protocol URL。

播放器只持有 `recording_id`、`entry_id` 和 URL，不接触缓存目录的真实路径。

## 读取

媒体通过 `offline` custom protocol 读取：

```txt
offline://localhost/recordings/<recording-id>/entries/<entry-id>
```

Windows 下 Tauri 会使用：

```txt
http://offline.localhost/recordings/<recording-id>/entries/<entry-id>
```

协议读取会再次验证 ID、manifest 和目标文件，并支持单段 HTTP Range。MP4 可以按需读取字节区间，不需要通过 IPC 传递大块二进制。

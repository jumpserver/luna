# 录像转码模块 (Transcode)

## 功能概述

将 JumpServer Guacamole 协议的会话录像（`.tar` 归档文件）转码为 H.264 MP4 视频文件。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri Command: transcode_replays                           │
│  (mod.rs)                                                   │
│  - 接收 tar 文件路径列表 + 输出目录                          │
│  - 解压 tar → 提取 replay.json + .part.gz                   │
│  - gzip 解压得到原始 guacamole 数据                          │
│  - 调用 transcode_to_mp4 生成视频                           │
│  - 通过 Tauri 事件向前端报告进度                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  parser.rs   │  │ renderer.rs  │  │  transcode.rs    │
│              │  │              │  │                  │
│ Guacamole    │  │ 图层画布渲染 │  │ 编码+封装管线    │
│ 协议解析器   │  │              │  │                  │
└──────────────┘  └──────────────┘  └──────────────────┘
```

### 模块说明

| 文件 | 职责 |
|------|------|
| `mod.rs` | Tauri command 入口、tar 解压、gzip 解压、进度事件 |
| `parser.rs` | 解析 Guacamole 协议的 length-prefixed 指令格式 |
| `renderer.rs` | 维护多图层画布，处理 `size`/`img`/`blob`/`cfill` 绘图指令，合成 RGB 帧 |
| `transcode.rs` | 流式管线：回放一帧 → RGB→YUV420 → openh264 编码 → 立即写入 MP4 mdat |

### 转码流程（单遍流式）

```
tar 文件
  ├─ <uuid>.replay.json     ← 会话元数据 (serde 解析)
  └─ <uuid>.0.part.gz       ← gzip 压缩的 guacamole 录像
         │
         ▼ (flate2 解压)
    guacamole 原始指令流
         │
         ▼ (parser.rs 逐条解析 + renderer.rs 回放绘图指令)
    到达采样 tick 时合成一帧 RGB
         │
         ▼ (立即: RGB→YUV420 → openh264 编码 → 4 字节长度前缀 NAL)
    直接追加到 MP4 mdat 段
         │
         ▼ (全部帧写完后回填 mdat size、追加 moov)
    MP4 文件 (ftyp + mdat + moov)
```

任意时刻内存中只驻留 **一帧 RGB + 一帧 H.264 码流**；仅累积每帧
`u32` 大小和关键帧索引（数百帧仅 KB 级）。

### 关键设计

- **采样即编码、编码即写盘**: 不再批量收集 RGB 帧与码流，而是回放一帧立刻编码、立刻写入 MP4 `mdat`，最后 `seek` 回填 mdat 大小并追加 `moov`，峰值内存仅为单帧量级
- **openh264**: 纯 Rust 绑定的 H.264 编码器，无需外部 ffmpeg 二进制
- **MP4 封装**: 手动构建 ISOBMFF box 结构，无第三方 muxer 依赖
- **帧采样策略**: 每 200ms 采样一帧，最多 600 帧，避免长录像产生过多帧
- **并发**: 动态计算 CPU 上限与可用内存上限，取两者较小值作为当前最大并发数，并通过 `tokio::task::spawn_blocking` 在线程池中并发转码多个录像包
- **进度报告**: 通过 Tauri `emit("transcode-progress", ...)` 事件通知前端

## 前端调用

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 监听进度
await listen('transcode-progress', (event) => {
  const { file, index, total, progress, message } = event.payload;
  console.log(`[${index + 1}/${total}] ${file}: ${progress.toFixed(0)}% - ${message}`);
});

// 调用转码
const results = await invoke('transcode_replays', {
  tarPaths: ['/path/to/recording1.tar', '/path/to/recording2.tar'],
  outputDir: '/path/to/output'
});

// results: Array<{ id, input, output, success, error? }>
```

## 测试方法

### 1. 准备测试数据

确保有以下文件：
- 一个 `.tar` 录像归档文件（包含 `.replay.json` 和 `.part.gz`）
- 或解压后的 `.part` 文件用于验证 guacamole 数据格式

### 2. 单元测试 parser

在 `src-tauri/` 下运行：

```bash
cargo test --lib transcode::parser
```

### 3. 手动测试转码

创建测试脚本 `test_transcode.rs`（放在 `src-tauri/src/bin/` 下）：

```rust
use std::path::PathBuf;

fn main() {
    // 读取 guacamole 原始数据
    let guac_data = std::fs::read("/path/to/uuid.0.part")
        .expect("read guacamole data");

    let output = PathBuf::from("/tmp/test_output.mp4");

    jumpserver_client_lib::transcode::transcode::transcode_to_mp4(
        &guac_data,
        &output,
        |pct| println!("progress: {:.1}%", pct),
    ).expect("transcode failed");

    println!("output: {:?}", output);
}
```

### 4. 通过 Tauri dev 模式测试

```bash
cd src-tauri
cargo tauri dev
```

在前端页面调用 `invoke('transcode_replays', ...)` 传入真实的 tar 文件路径。

### 5. 验证输出

```bash
# 检查 MP4 文件结构
ffprobe -show_format -show_streams /tmp/test_output.mp4

# 播放测试
open /tmp/test_output.mp4       # macOS
xdg-open /tmp/test_output.mp4   # Linux
```

### 6. 验证 MP4 box 结构

```bash
# 使用 mp4dump 或 Bento4 工具检查 box 结构是否完整
mp4dump /tmp/test_output.mp4
# 应看到: ftyp, mdat, moov > trak > mdia > minf > stbl > (stsd/avc1/avcC, stts, stsz, stsc, stco)
```

## 依赖

| crate | 用途 |
|-------|------|
| `openh264` | H.264 视频编码 |
| `flate2` | gzip 解压 `.part.gz` |
| `tar` | 解压 `.tar` 归档 |
| `image` | PNG 解码（guacamole `blob` 指令中的 base64 PNG） |
| `tokio` | 异步运行时 + `spawn_blocking` |
| `serde` / `serde_json` | replay.json 解析 |

## 已知限制

- 仅支持 Guacamole 协议录像（RDP/VNC 通过 Guacamole 网关的场景）
- 画布尺寸从录像首条 `size` 指令获取，不支持录像中途分辨率变化
- 不支持音频轨道（guacamole `audio` 指令被忽略）
- 帧采样为固定间隔，非事件驱动，可能在静态画面产生冗余帧

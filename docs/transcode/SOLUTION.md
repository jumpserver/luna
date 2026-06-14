# 录像转码模块 (Transcode)

## 功能概述

将 JumpServer Guacamole 协议的会话录像（`.tar` 归档文件）转码为 H.264 MP4 视频文件。

支持三个平台的原生硬件/软件编码：

| 平台 | 编码器 | 编码方式 |
|------|--------|----------|
| macOS | VideoToolbox | 硬件加速（GPU/ANE） |
| Linux | OpenH264 | 软件编码（CPU） |
| Windows | IMFSinkWriter | 系统级管道（自动选择硬件/软件编码器） |

## 架构

```
┌──────────────────────────────────────────────────────────────────────┐
│  Tauri Command: transcode_replays                                    │
│  (mod.rs)                                                            │
│  - 接收 tar 文件路径列表 + 输出目录 + 用户配置                        │
│  - 解压 tar → 提取 replay.json + .part.gz                            │
│  - gzip 解压得到原始 guacamole 数据                                   │
│  - 调用 transcode_to_mp4 生成视频                                    │
│  - 通过 Tauri emit("transcode-progress") 向前端报告进度               │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
  │  parser.rs   │  │ renderer.rs  │  │  transcode.rs    │
  │              │  │              │  │                  │
  │ Guacamole    │  │ 多图层画布   │  │ 编码+封装管线    │
  │ 协议解析器   │  │ 渲染器       │  │ (平台分支)       │
  └──────────────┘  └──────────────┘  └───────┬──────────┘
                                              │
                           ┌──────────────────┼─────────────────────┐
                           ▼                  ▼                     ▼
                  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
                  │  macOS / Linux │  │    Windows     │  │  encoder.rs      │
                  │                │  │                │  │                  │
                  │  多线程 chunk  │  │  单线程        │  │  平台编码器      │
                  │  并行编码      │  │  Sink Writer   │  │  抽象            │
                  │  + 手工 MP4    │  │  直写          │  │                  │
                  └────────────────┘  └────────────────┘  └──────────────────┘
```

### 模块说明

| 文件 | 职责 |
|------|------|
| `mod.rs` | Tauri command 入口、tar/gzip 解压、进度事件、分辨率/码率/功率配置 |
| `parser.rs` | 零拷贝解析 Guacamole 协议的 length-prefixed 指令格式 |
| `renderer.rs` | 维护多图层画布，处理 `size`/`img`/`blob`/`cfill`/`rect`/`copy` 绘图指令，合成 RGB 帧 |
| `transcode.rs` | 编码管线：帧时间线构建、渲染调度、缩放、编码、MP4 封装（按平台分支） |
| `encoder.rs` | 平台编码器抽象：macOS VideoToolbox / Linux OpenH264 / Windows IMFSinkWriter |

## 转码流程

### 共享阶段（所有平台）

```
tar 文件
  ├─ <uuid>.replay.json     ← 会话元数据 (serde_json 解析)
  └─ <uuid>.0.part.gz       ← gzip 压缩的 guacamole 录像（可多 part）
         │
         ▼ (flate2 解压，按 part 序号拼接)
    guacamole 原始指令流
         │
         ├─► scan_max_canvas_size    扫描全部 size 指令，获取最大画布尺寸
         ├─► parse_and_build_timeline 按 100ms 间隔采样帧时间线
         │
         ▼
    FrameInfo 列表 (timestamp + instruction_offset)
```

### macOS / Linux 编码路径

```
FrameInfo 列表
    │
    ▼ (按 chunk 分割，每 chunk 50 帧)
    │
    ├─► chunk 0: 主线程编码 → 提取 canonical SPS/PPS
    │
    ├─► chunk 1..N: std::thread::spawn 多线程并行
    │     每个线程:
    │       1. 从 instruction_offset 恢复 parser + renderer 状态
    │       2. 逐帧 composite → RGB
    │       3. fast_image_resize 缩放至目标分辨率
    │       4. RGB → I420/YUV420 转换
    │       5. VideoToolbox / OpenH264 编码 → NAL units
    │       6. 帧去重 (FNV-1a hash)，相同帧记录 repeat_count
    │
    ▼ (收集所有 ChunkResult)
    │
    ▼ write_mp4_faststart:
       1. 写入临时文件: mdat (裸 H.264 NAL 流 + 4 字节长度前缀)
       2. 追加 moov (手动构建 ISOBMFF box)
       3. 重排为 faststart 布局: ftyp → moov → mdat
       4. 删除临时文件

输出: MP4 文件 (ftyp + moov + mdat)
```

### Windows 编码路径

```
FrameInfo 列表
    │
    ▼ (单线程单遍渲染)
    │
    ├─► SinkWriterEncoder::new(output_path, w, h, bitrate, fps)
    │     1. CoInitializeEx + MFStartup
    │     2. MFCreateSinkWriterFromURL → IMFSinkWriter
    │     3. 配置输出类型: H.264 + High Profile + 码率
    │     4. AddStream → 获取 stream_index
    │     5. 配置输入类型: RGB24 (BGR DIB 字节序)
    │     6. BeginWriting
    │
    ├─► 逐帧循环:
    │     1. parser 回放至 sync 时间点
    │     2. renderer.composite_into → RGB 帧
    │     3. fast_image_resize 缩放至目标分辨率
    │     4. 帧去重 (FNV-1a hash)
    │     5. write_frame: RGB→BGR 交换 + 垂直翻转 → IMFMediaBuffer → IMFSample → WriteSample
    │        Sink Writer 内部自动完成: BGR→NV12 色彩转换 → H.264 编码 → MP4 封装
    │
    ├─► SinkWriterEncoder::finalize → Finalize
    │
    ▼

输出: MP4 文件 (由系统 MP4 Muxer Sink 生成)
```

## 关键设计

### 帧采样策略

- 固定 10fps 输出，每 100ms 一个采样点
- 首遍扫描 guac 指令流构建 `FrameInfo` 时间线
- 最多 600 帧（长录像自动降采样）

### 帧去重

- 对每帧 RGB 数据计算 FNV-1a 哈希（步长 8 像素采样）
- 连续相同帧不重复编码，而是记录 `repeat_count`
- macOS/Linux: 在 MP4 `stts` box 中写入重复计数
- Windows: 重复调用 `WriteSample` 写入相同帧数据

### 分辨率对齐

- 编码宽高对齐到 16 的倍数（`& !15`）
- 确保 H.264 宏块（16×16）完整对齐，避免编码器内部填充导致的画质劣化

### 码率计算

```rust
// 针对屏幕录制内容优化（文字、图标、细线条）
bitrate = pixels × 5 bps    // 5 bits per pixel
clamp(800 Kbps, 20 Mbps)
```

| 分辨率 | 码率 |
|--------|------|
| 1920×1080 | 10.4 Mbps |
| 1280×768 | 4.9 Mbps |
| 1024×768 | 3.9 Mbps |
| 640×360 | 1.2 Mbps |

### 并行编码（macOS / Linux）

- 帧列表按 chunk 分割（每 chunk 50 帧）
- 首 chunk 主线程编码以提取 canonical SPS/PPS
- 剩余 chunk 分配到 `min(可用 CPU × cpu_fraction, chunk 数)` 个线程并行
- 每个线程独立创建 encoder 实例，独立解析 guac 指令恢复渲染状态

### Windows 单线程管线

- IMFSinkWriter 封装了完整的编码+封装管道，内部自动选择最优编码器（硬件优先）
- 单线程逐帧渲染→写入，无需手工管理 NAL/MP4
- 硬件加速时编码器吞吐远高于渲染速度，单线程不构成瓶颈

### MP4 封装（macOS / Linux）

- 手工构建 ISOBMFF box：`ftyp` → `moov` → `mdat`
- faststart 布局：moov 置于 mdat 之前，支持流式播放
- 两遍写入：先写临时文件（mdat + moov），再重排为最终布局

## 平台编码器详情

### macOS — VideoToolbox

```
RGB → I420 (手工转换，BT.601 矩阵)
    → shiguredo_video_toolbox crate
    → Hardware Encoder (GPU/ANE)
    → NAL units (Annex B)
    → 手工拆分 + 4 字节长度前缀
```

- Profile: Baseline + CAVLC
- GOP: 50 帧 (5 秒@10fps)
- 优先编码速度 (`prioritize_encoding_speed_over_quality: true`)

### Linux — OpenH264

```
RGB → YUV420 (openh264 crate 内置 RgbSliceU8 → YUVBuffer)
    → openh264::Encoder
    → NAL units (Annex B)
    → split_annex_b 手工拆分
    → 4 字节长度前缀
```

- 纯软件编码，CPU 密集型
- 支持多线程 chunk 并行

### Windows — IMFSinkWriter

```
RGB → BGR (逐像素 R/B 交换，DIB 字节序)
    → 垂直翻转 (top-down → bottom-up)
    → IMFMediaBuffer → IMFSample
    → IMFSinkWriter::WriteSample
    → [系统内部] Color Converter DSP (BGR→NV12)
    → [系统内部] H.264 Encoder MFT (硬件优先: QSV/NVENC/AMF)
    → [系统内部] MP4 Muxer Sink
```

- Profile: High (CABAC 熵编码)
- 编码器由系统自动选择，优先硬件
- 无需手工管理 NAL、SPS/PPS、MP4 box

## 前端配置

### 用户可选参数

| 参数 | 选项 | 说明 | 平台影响 |
|------|------|------|----------|
| `filename_style` | `original` / `friendly` / `friendly_uuid` | 输出文件命名格式 | 全平台 |
| `output_resolution` | `original` / `p1080` / `p720` / `p360` | 输出分辨率 | 全平台 |
| `transcode_power` | `auto` / `full` / `fast` / `medium` / `low` | CPU 使用率 | macOS/Linux 有效；Windows 固定 `auto` |

### 进度事件

通过 Tauri `emit("transcode-progress", TranscodeProgress)` 发送：

```typescript
interface TranscodeProgress {
  file: string;          // 文件名或 session ID
  index: number;         // 当前文件在批次中的索引
  total: number;         // 批次总文件数
  progress: number;      // 0–100
  message: string;       // 状态描述
  success?: boolean;     // 完成时设置
  output?: string;       // 输出文件路径
  duration?: number;     // 转码耗时（秒）
  metadata?: ReplayMetadata;  // 会话元数据（首次事件时发送）
}
```

## 依赖

| crate | 用途 | 平台 |
|-------|------|------|
| `flate2` | gzip 解压 `.part.gz` | 全平台 |
| `tar` | 解压 `.tar` 归档 | 全平台 |
| `image` | PNG/JPEG/WebP 解码（guacamole `blob` 指令） | 全平台 |
| `fast_image_resize` | 双线性插值缩放 | 全平台 |
| `base64` | guacamole `blob` 指令中的 base64 解码 | 全平台 |
| `serde` / `serde_json` | replay.json 解析 | 全平台 |
| `tokio` | 异步运行时 + `spawn_blocking` | 全平台 |
| `num_cpus` | 动态计算并行线程数 | macOS / Linux |
| `shiguredo_video_toolbox` | VideoToolbox 硬件编码器 | macOS |
| `openh264` | OpenH264 软件编码器 | Linux |
| `windows` (MediaFoundation) | IMFSinkWriter 系统级编码管道 | Windows |

## 已知限制

- 仅支持 Guacamole 协议录像（RDP/VNC/SSH 通过 Guacamole 网关的场景）
- 画布尺寸取录像中 `size` 指令的最大值，不支持录像中途分辨率动态切换
- 不支持音频轨道（guacamole `audio` 指令被忽略）
- 帧采样为固定间隔，非事件驱动，静态画面会产生冗余帧（通过帧去重缓解）
- Windows 路径为单线程编码，不支持 chunk 并行

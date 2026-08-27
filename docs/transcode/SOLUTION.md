# 录像转码模块（Electron / Node）

## 架构

录像转码运行在 Electron 主进程，不要求用户安装 Node、系统 FFmpeg、Go 或 Rust：

```text
Vue transcode store
  -> Desktop Bridge: transcode_replays
  -> electron/replay-transcoder.mjs
     -> tar-stream + node:zlib 解包
     -> electron/replay-codec.mjs 解析 Guacamole 指令并渲染 RGBA 帧
     -> 设置页按需下载的 FFmpeg 插件
     -> H.264 / yuv420p / fast-start MP4
```

主安装包不包含 FFmpeg。用户在“设置 → 通用”中下载当前平台与架构对应的插件，文件存放在 Electron `userData/plugins/ffmpeg/`。下载器固定版本与 URL，支持 GitHub 和镜像回退，流式计算压缩包 SHA-256，解压后执行 `ffmpeg -version`，校验成功才写入插件 manifest。运行时只读取该目录，不查询系统 `PATH`。

## 输入

每个 `.tar` 录像包包含：

- `<uuid>.replay.json`：会话元数据。
- `<uuid>.<N>.part.gz`：按序号排列的 gzip Guacamole 指令流。

读取 tar 时只收集上述文件，不把条目路径写入磁盘；metadata 与单个 part 分别有大小上限。所有 part 按数字序号排序后解压并拼接。

## 渲染与编码

`electron/replay-codec.mjs` 实现 Guacamole 的字节长度指令解析，并处理录像需要的 `size`、`img`、`blob`、`end`、`copy` 与 `cfill` 图层操作。`sync` 指令按 10 FPS 建立时间线。

Electron `nativeImage` 负责 PNG/JPEG/WebP 解码和帧缩放；RGBA 原始帧通过 stdin 流式写入已安装的 FFmpeg 插件。输出使用 `libx264`、`yuv420p` 与 `+faststart`，完成后再用原子式临时文件重命名替换目标文件。

分辨率支持 `original`、`p1080`、`p720`、`p360`。`transcode_power` 会将 `auto`、`full`、`fast`、`medium`、`low` 映射为不同 FFmpeg 线程数。

## 进度协议

主进程继续发送 `transcode-progress`，保持前端协议不变：

```ts
interface TranscodeProgress {
  file: string;
  index: number;
  total: number;
  progress: number;
  message: string;
  success?: boolean;
  output?: string;
  duration?: number;
  metadata?: ReplayMetadata;
}
```

首个事件包含 metadata，终态事件为 `progress: 100` 并带 `success`。批量调用返回每个输入对应的 `TranscodeResult`，单个文件失败不会阻止后续任务。

## 构建与验证

```bash
pnpm install                   # 安装 Node 依赖，不下载 FFmpeg
pnpm electron:prepare          # 准备 Electron 资源
pnpm test:electron             # parser / renderer / SSH helper 单元测试
pnpm test:electron:transcode   # 下载临时插件并执行端到端冒烟测试
```

FFmpeg 下载包的版本、目标名与 SHA-256 清单定义在 `electron/ffmpeg-plugin.mjs`。升级版本时必须同步更新全部支持平台的校验值，并运行端到端冒烟测试。

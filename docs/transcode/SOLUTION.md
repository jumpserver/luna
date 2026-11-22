# 录像转码模块（Electron / Node）

## 架构

录像转码由 Electron 主进程调度，画面在独立的隐藏渲染窗口中生成，不要求用户安装 Node、系统 FFmpeg、Go 或 Rust：

```text
Vue transcode store
  -> Desktop Bridge: transcode_replays
  -> electron/src/replay/transcoder.ts
     -> tar-stream + node:zlib 解包
     -> replay-renderer-preload.ts 复用播放器的 Guacamole.SessionRecording / Display
        -> Chromium 渲染桌面、图层与软件光标
     -> capturePage 按帧捕获实际播放器画面，输出 BGRA 帧
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

`electron/src/replay/replay-renderer-preload.ts` 与现有播放器共用 `@jumpserver/guacamole` 的 `SessionRecording` 和 `Display`。通过其异步录像源接口按 256 KiB 分块读取主进程中的录像数据，避免向渲染进程再复制整段录像。按 10 FPS 采样录像时间线，每次定位到采样时间之前最近的 `sync`，等待 `SessionRecording.seek()` 完成图片解码和绘图后取帧，避免提前显示后续画面。

隐藏窗口采用 Electron 离屏渲染，沿用播放器的显示缩放与黑色背景。每帧等待 Chromium 提交绘图，再由主进程 `capturePage()` 捕获实际显示结果，包含软件光标、图层变换、父图层裁剪和组透明度。光标的形状、位置与可见性沿用播放器行为；原始录像未记录鼠标数据时无法恢复轨迹。

捕获的 NativeImage 归一化到目标尺寸后，以 BGRA 原始帧经 stdin 写入 FFmpeg。渲染进程等待每次捕获和编码管道写入完成，避免帧队列无限增长。画面由 Chromium 完整合成，导出不依赖 `Display.flatten()` 对 CSS 图层行为的近似处理。

输出使用 `libx264`、`yuv420p` 与 `+faststart`，完成后将临时文件重命名为目标文件。取消、失败和完成时均释放渲染窗口及编码资源。

分辨率支持 `original`、`p1080`、`p720`、`p360`，仅向下缩放，并按 H.264 像素格式要求对齐到偶数尺寸。`transcode_power` 会将 `auto`、`full`、`fast`、`medium`、`low` 映射为不同 FFmpeg 线程数。

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
pnpm test:electron             # 录像包、输出尺寸及其他 Electron 单元测试
pnpm test:electron:transcode   # 编译渲染 preload，下载临时插件并验证 MP4 画面及取消行为
```

端到端测试检查光标形状、移动、热点、显示时序、图层与填充，并将 MP4 解码画面与播放器实际显示截图对比。设置 `REPLAY_TEST_FFMPEG` 可仅在测试中使用指定的本地 FFmpeg，跳过插件下载；正式客户端始终使用已安装的插件。

FFmpeg 下载包的版本、目标名与 SHA-256 清单定义在 `electron/src/replay/ffmpeg-plugin.ts`。升级版本时必须同步更新全部支持平台的校验值，并运行端到端冒烟测试。

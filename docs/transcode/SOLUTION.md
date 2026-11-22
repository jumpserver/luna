# 录像转码模块（Electron / Node）

## 架构

录像转码由 Electron 主进程调度，画面在独立的隐藏渲染窗口中生成，不要求用户安装 Node、系统 FFmpeg、Go 或 Rust：

```text
Vue transcode store
  -> Desktop Bridge: transcode_replays
  -> electron/src/replay/transcoder.ts
     -> tar-stream + node:zlib 解包
     -> replay-renderer-preload.ts 复用播放器的 Guacamole.Client / Display
        -> 普通画面直接合成播放器 Canvas 与软件光标
        -> 复杂图层由隐藏窗口的 Chromium 合成并捕获
     -> RGBA 原始帧
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

`electron/src/replay/replay-renderer-preload.ts` 与现有播放器共用 `@jumpserver/guacamole` 的 `Parser`、`Client` 和 `Display`。按 256 KiB 分块读取录像，先扫描分辨率与时间范围，再按指令顺序重放。逐帧导出不调用交互式 `SessionRecording.seek()`，避免为每个输出帧生成 PNG 快照缓存。

输出保持 10 FPS，在应用下一个时间点的画面指令前输出当前画面的采样帧，避免提前显示后续鼠标或画面。空的 `sync` 心跳不改变画面；连续静止区间仅捕获一次，复用同一 RGBA 缓冲区向 FFmpeg 写入所需帧数。内存与静止时长无关，逐帧写入仍等待编码管道背压。

画面变化后先等待 `Display.flush()` 完成图片解码和绘图。默认图层没有子图层、透明度和变换时，将播放器已经绘制的 Canvas 与独立的软件光标合成到固定尺寸的内存 Canvas，直接读取 RGBA 像素。光标位置使用播放器计算后的热点偏移，遵循其显示状态，并与背景一起缩放、裁剪。普通画面不需要等待浏览器绘制时钟或调用窗口截图，也不重新实现 Guacamole 绘图指令。

存在子图层、组透明度或变换时，继续使用实际 DOM 合成：固定黑色背景，等待绘制后 `capturePage()`，将截图调整到输出像素尺寸并转换 BGRA 为 RGBA。这条路径使用与播放器相同的普通隐藏窗口；Electron 的 `offscreen` 模式在切换取帧方式时可能返回缺失 Canvas 内容的画面，因此不启用。导出不依赖会遗漏鼠标和部分 CSS 行为的 `Display.flatten()`。原始录像未记录鼠标数据时无法恢复轨迹。

RGBA 帧经 stdin 写入 FFmpeg。主进程最多保留一个正在写入的批次，让渲染进程准备下一帧；接收下一批之前等待上一批写入完成，并在结束前排空管道。缓冲区在写入期间保持不变，静止时复用，队列不会随录像时长增长。进度按 0.1% 分段更新，减少长录像导出的 UI 事件开销。

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

端到端测试检查光标形状、移动、热点、显示时序、越界裁剪、图层、填充及取帧路径切换，并在原尺寸和缩放尺寸下将 MP4 解码画面与播放器实际显示截图对比。设置 `REPLAY_TEST_FFMPEG` 可仅在测试中使用指定的本地 FFmpeg，跳过插件下载；正式客户端始终使用已安装的插件。

FFmpeg 下载包的版本、目标名与 SHA-256 清单定义在 `electron/src/replay/ffmpeg-plugin.ts`。升级版本时必须同步更新全部支持平台的校验值，并运行端到端冒烟测试。

## 同源录像性能对比（2026-11-22）

取实际 2380×1532 录像的前 60 秒指令，补齐末尾心跳，对齐为 601 个首尾采样帧。三个版本均使用 FFmpeg 6.1.1、10 FPS、libx264 fast、2 个编码线程和相同码率，串行运行两轮。最早版仅在测试副本中统一尺寸对齐及首帧采样，保留其原始解析与像素重建实现；不把其缺失鼠标、图层语义的结果作为正确性基准。

| 实现                           |   第一次 |   第二次 |
| ------------------------------ | -------: | -------: |
| 最早的 Buffer 像素重建         | 22.30 秒 | 22.47 秒 |
| 本轮优化前的顺序重放、逐帧截图 | 17.41 秒 | 17.33 秒 |
| 本次 Canvas 取帧与编码重叠     | 10.85 秒 | 10.77 秒 |

优化前每次导出捕获 382 个变化画面，其余采样复用。绘制等待约 5.6–5.8 秒，截图约 5.1–5.2 秒，NativeImage 像素读取约 0.8 秒。最早版的 CPU 像素合成本身约 14.5 秒，故此片段未复现其快于本轮修改前版本的情况。新版同样读取 382 个变化画面，内存合成与像素读取约 3.4 秒，省去了这些画面的绘制等待和截图，并让下一帧的准备与编码重叠。编码管道等待包含并行工作的时间，不能直接将所有阶段耗时相加。

该片段耗时相对本轮优化前降低约 38%，相对最早版降低约 52%。复杂图层仍走实际 DOM 捕获，收益取决于录像内容，以上不代表整段长录像的固定倍数。正确性另外通过播放器截图对比与鼠标、缩放、复杂图层、取消等端到端检查验证。

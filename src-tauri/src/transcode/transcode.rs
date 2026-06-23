#![allow(dead_code)]

use crate::transcode::encoder::{create_encoder, H264Encoder};
use crate::transcode::parser::Parser;
use crate::transcode::renderer::Renderer;
use crate::transcode::{bitrate_for_resolution, compute_target_dimensions, OutputResolution};
use fast_image_resize::images::{Image, ImageRef};
use fast_image_resize::PixelType::U8x3;
use fast_image_resize::{FilterType, ResizeAlg, ResizeOptions, Resizer};
use log::info;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};

const DEFAULT_WIDTH: u32 = 1024;
const DEFAULT_HEIGHT: u32 = 768;
const FPS: u32 = 10;
const TIME_SCALE: u32 = 1000;
const SAMPLE_DURATION: u32 = TIME_SCALE / FPS;
const FRAME_INTERVAL_MS: u64 = 1000 / FPS as u64;
const FRAMES_PER_CHUNK: usize = 50;
const GOP_SIZE: u32 = 50;

#[derive(Clone)]
struct FrameInfo {
    timestamp: u64,
    instruction_offset: usize,
}

struct ChunkResult {
    chunk_id: usize,
    nals: Vec<u8>,
    sample_sizes: Vec<u32>,
    keyframe_indices: Vec<usize>,
    sample_repeat_counts: Vec<u32>,
    sps: Vec<u8>,
    pps: Vec<u8>,
    enc_width: u32,
    enc_height: u32,
}

struct PreparedFrame {
    rgb: Arc<[u8]>,
    width: usize,
    height: usize,
    repeat_count: u32,
}

fn payload_to_string(payload: Box<dyn std::any::Any + Send>) -> String {
    match payload.downcast::<String>() {
        Ok(s) => *s,
        Err(p) => match p.downcast::<&'static str>() {
            Ok(s) => (*s).to_string(),
            Err(_) => "unknown panic".to_string(),
        },
    }
}

#[cfg(not(windows))]
pub fn transcode_to_mp4(
    guac_data: &[u8],
    output_path: &Path,
    resolution: OutputResolution,
    cpu_fraction: f64,
    progress_callback: impl Fn(f32) + Send + Sync + 'static,
) -> Result<(), String> {
    let total_start = std::time::Instant::now();

    let last_pct = Arc::new(AtomicU32::new(0));
    let cb = Arc::new(Mutex::new(progress_callback));
    let report_progress = {
        let last_pct = Arc::clone(&last_pct);
        let cb = Arc::clone(&cb);
        move |pct: f32| {
            let pct_u32 = (pct * 100.0) as u32;
            let mut last = last_pct.load(Ordering::Relaxed);
            while pct_u32 > last {
                match last_pct.compare_exchange_weak(
                    last,
                    pct_u32,
                    Ordering::Relaxed,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => {
                        cb.lock().unwrap()(pct);
                        break;
                    }
                    Err(actual) => {
                        last = actual;
                    }
                }
            }
        }
    };

    report_progress(5.0);

    let timeline = parse_and_build_timeline(guac_data)?;
    let frames = timeline.frames;
    let total_frames = frames.len();

    if total_frames < 2 {
        return Err("not enough frames to encode".to_string());
    }

    report_progress(10.0);

    let (max_w, max_h) = (timeline.max_width, timeline.max_height);
    let (enc_w_raw, enc_h_raw) = if resolution != OutputResolution::Original {
        compute_target_dimensions(max_w, max_h, &resolution)
    } else {
        (max_w, max_h)
    };

    let enc_w = enc_w_raw.max(16) & !15;
    let enc_h = enc_h_raw.max(16) & !15;

    if enc_w != enc_w_raw || enc_h != enc_h_raw {
        log::info!(
            "encoder dimensions aligned to 16: {}x{} -> {}x{}",
            enc_w_raw,
            enc_h_raw,
            enc_w,
            enc_h
        );
    }

    let target_dims = Some((enc_w, enc_h));

    let bitrate = bitrate_for_resolution(enc_w, enc_h);
    let gop_size = GOP_SIZE;

    let first_chunk_frames = &frames[..frames.len().min(FRAMES_PER_CHUNK)];
    let first_result = encode_single_chunk(
        0,
        first_chunk_frames,
        guac_data,
        &[],
        &[],
        target_dims,
        bitrate,
        gop_size,
    )?;

    let canonical_sps = first_result.sps.clone();
    let canonical_pps = first_result.pps.clone();

    if canonical_sps.is_empty() || canonical_pps.is_empty() {
        return Err("failed to get SPS/PPS from first chunk".to_string());
    }

    let num_chunks = (total_frames + FRAMES_PER_CHUNK - 1) / FRAMES_PER_CHUNK;
    let num_cores = ((num_cpus::get() as f64 * cpu_fraction).round() as usize)
        .min(num_chunks)
        .max(1);

    let chunk_size = (num_chunks + num_cores - 1) / num_cores;
    let actual_cores = (num_chunks + chunk_size - 1) / chunk_size;

    let guac_data_arc = Arc::new(guac_data.to_vec());
    let first_chunk_frame_count = total_frames.min(FRAMES_PER_CHUNK);
    let encoded_frames = Arc::new(AtomicUsize::new(first_chunk_frame_count));
    let report_progress_arc = Arc::new(Mutex::new(report_progress));
    let canonical_sps_arc = Arc::new(canonical_sps);
    let canonical_pps_arc = Arc::new(canonical_pps);

    let mut handles = Vec::new();

    for core_id in 0..actual_cores {
        let start_chunk = core_id * chunk_size;
        let end_chunk = (start_chunk + chunk_size).min(num_chunks);

        if start_chunk >= num_chunks {
            break;
        }

        let actual_start = if core_id == 0 {
            start_chunk.max(1)
        } else {
            start_chunk
        };
        if actual_start >= end_chunk {
            continue;
        }

        let guac_data_clone = Arc::clone(&guac_data_arc);
        let frames_clone = frames.clone();
        let encoded_clone = Arc::clone(&encoded_frames);
        let callback_clone = Arc::clone(&report_progress_arc);
        let sps_clone = Arc::clone(&canonical_sps_arc);
        let pps_clone = Arc::clone(&canonical_pps_arc);

        let handle = std::thread::spawn(move || {
            encode_chunks(
                actual_start,
                end_chunk,
                FRAMES_PER_CHUNK,
                &guac_data_clone,
                &frames_clone,
                total_frames,
                encoded_clone,
                callback_clone,
                &sps_clone,
                &pps_clone,
                target_dims,
                bitrate,
                gop_size,
            )
        });

        handles.push(handle);
    }

    let mut all_results = vec![first_result];
    let mut first_error: Option<String> = None;

    for handle in handles {
        match handle.join() {
            Ok(Ok(results)) => {
                if first_error.is_none() {
                    all_results.extend(results);
                }
            }
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
            Err(payload) => {
                if first_error.is_none() {
                    first_error = Some(payload_to_string(payload));
                }
            }
        }
    }

    if let Some(err) = first_error {
        return Err(err);
    }

    all_results.sort_by_key(|r| r.chunk_id);

    report_progress_arc.lock().unwrap()(95.0);

    write_mp4_faststart(output_path, all_results, &frames)?;

    report_progress_arc.lock().unwrap()(100.0);

    info!(
        "transcode completed in {:.2}s → {:?}",
        total_start.elapsed().as_secs_f64(),
        output_path
    );
    Ok(())
}

#[cfg(windows)]
pub fn transcode_to_mp4(
    guac_data: &[u8],
    output_path: &Path,
    resolution: OutputResolution,
    _cpu_fraction: f64,
    progress_callback: impl Fn(f32) + Send + Sync + 'static,
) -> Result<(), String> {
    use crate::transcode::encoder::sink::SinkWriterEncoder;
    use fast_image_resize::images::{Image, ImageRef};
    use fast_image_resize::PixelType::U8x3;
    use fast_image_resize::{FilterType, ResizeAlg, ResizeOptions, Resizer};
    use std::sync::{Arc, Mutex};

    let total_start = std::time::Instant::now();

    let last_pct = Arc::new(AtomicU32::new(0));
    let cb = Arc::new(Mutex::new(progress_callback));
    let report_progress = {
        let last_pct = Arc::clone(&last_pct);
        let cb = Arc::clone(&cb);
        move |pct: f32| {
            let pct_u32 = (pct * 100.0) as u32;
            let mut last = last_pct.load(Ordering::Relaxed);
            while pct_u32 > last {
                match last_pct.compare_exchange_weak(
                    last,
                    pct_u32,
                    Ordering::Relaxed,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => {
                        cb.lock().unwrap()(pct);
                        break;
                    }
                    Err(actual) => {
                        last = actual;
                    }
                }
            }
        }
    };

    report_progress(5.0);

    let timeline = parse_and_build_timeline(guac_data)?;
    let frames = timeline.frames;
    let total_frames = frames.len();

    if total_frames < 2 {
        return Err("not enough frames to encode".to_string());
    }

    report_progress(10.0);

    let (max_w, max_h) = (timeline.max_width, timeline.max_height);
    let (enc_w_raw, enc_h_raw) = if resolution != OutputResolution::Original {
        compute_target_dimensions(max_w, max_h, &resolution)
    } else {
        (max_w, max_h)
    };

    let enc_w = enc_w_raw.max(16) & !15;
    let enc_h = enc_h_raw.max(16) & !15;

    if enc_w != enc_w_raw || enc_h != enc_h_raw {
        log::info!(
            "encoder dimensions aligned to 16: {}x{} -> {}x{}",
            enc_w_raw,
            enc_h_raw,
            enc_w,
            enc_h
        );
    }

    let target_dims = Some((enc_w, enc_h));
    let bitrate = bitrate_for_resolution(enc_w, enc_h);

    let mut encoder = SinkWriterEncoder::new(output_path, enc_w, enc_h, bitrate, FPS)?;

    let mut parser = Parser::new(guac_data);
    let mut renderer = Renderer::new(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    let mut width = DEFAULT_WIDTH;
    let mut height = DEFAULT_HEIGHT;

    let mut frame_buf = vec![255u8; (max_w * max_h * 3) as usize];
    let mut rgba_buf: Vec<u8> = Vec::new();
    let mut resizer = Resizer::new();
    let resize_options =
        ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));

    let mut frame_idx = 0;

    let mut prev_frame_hash: u64 = 0;
    let mut prev_rgb: Option<Arc<[u8]>> = None;
    let mut prev_src_w: usize = 0;
    let mut prev_src_h: usize = 0;
    let mut pending_repeat_count: u32 = 0;
    let mut first_frame = true;

    while let Some(inst) = parser.next_instruction() {
        match inst.opcode {
            "size" => {
                renderer.handle_size(&inst.args);
                if inst.args.len() >= 3 {
                    let lid: i32 = inst.args[0].parse().unwrap_or(-1);
                    if lid == 0 {
                        let w: u32 = inst.args[1].parse().unwrap_or(0);
                        let h: u32 = inst.args[2].parse().unwrap_or(0);
                        if w > 0 && h > 0 {
                            width = width.max(w);
                            height = height.max(h);
                            let needed = (width * height * 3) as usize;
                            if frame_buf.len() < needed {
                                frame_buf.resize(needed, 255);
                            }
                        }
                    }
                }
            }
            "img" => renderer.handle_img(&inst.args),
            "blob" => renderer.handle_blob(&inst.args),
            "end" => renderer.handle_end(&inst.args),
            "copy" => renderer.handle_copy(&inst.args),
            "rect" => renderer.handle_rect(&inst.args),
            "cfill" => renderer.handle_cfill(&inst.args),
            "sync" => {
                if let Some(ts_str) = inst.args.first() {
                    if let Ok(ts) = ts_str.parse::<u64>() {
                        while frame_idx < frames.len() && frames[frame_idx].timestamp <= ts {
                            let rw = renderer.width();
                            let rh = renderer.height();

                            let (enc_w_frame, enc_h_frame) = if let Some((tw, th)) = target_dims {
                                (tw as usize, th as usize)
                            } else {
                                ((rw & !1) as usize, (rh & !1) as usize)
                            };

                            if enc_w_frame >= 2 && enc_h_frame >= 2 {
                                renderer.composite_into(&mut frame_buf, rw, rh);

                                let frame_hash =
                                    hash_frame_sample(&frame_buf, rw as usize, rh as usize);

                                if !first_frame
                                    && frame_hash == prev_frame_hash
                                    && enc_w_frame == prev_src_w
                                    && enc_h_frame == prev_src_h
                                {
                                    pending_repeat_count += 1;
                                } else {
                                    if let Some(ref prev_data) = prev_rgb {
                                        encoder.write_frame(
                                            prev_data,
                                            prev_src_w,
                                            prev_src_h,
                                            pending_repeat_count,
                                        )?;
                                    }

                                    let src_len = (rw * rh * 3) as usize;
                                    let rgb_data: Arc<[u8]>;
                                    let src_w: usize;
                                    let src_h: usize;

                                    if target_dims.is_some()
                                        && (enc_w_frame != rw as usize
                                            || enc_h_frame != rh as usize)
                                    {
                                        let src_view =
                                            ImageRef::new(rw, rh, &frame_buf[..src_len], U8x3)
                                                .map_err(|e| format!("create image view: {}", e))?;

                                        rgba_buf
                                            .resize((enc_w_frame * enc_h_frame * 3) as usize, 0);
                                        let mut dst_image = Image::from_slice_u8(
                                            enc_w_frame as u32,
                                            enc_h_frame as u32,
                                            &mut rgba_buf,
                                            U8x3,
                                        )
                                        .map_err(|e| format!("create dst image: {}", e))?;

                                        resizer
                                            .resize(&src_view, &mut dst_image, &resize_options)
                                            .map_err(|e| format!("resize failed: {}", e))?;

                                        rgb_data = rgba_buf.as_slice().into();
                                        src_w = enc_w_frame;
                                        src_h = enc_h_frame;
                                    } else if enc_w_frame == rw as usize
                                        && enc_h_frame == rh as usize
                                    {
                                        rgb_data = frame_buf[..src_len].into();
                                        src_w = enc_w_frame;
                                        src_h = enc_h_frame;
                                    } else {
                                        let mut cropped =
                                            vec![255u8; (enc_w_frame * enc_h_frame * 3) as usize];
                                        let src_stride = rw as usize * 3;
                                        let dst_stride = enc_w_frame * 3;
                                        for y in 0..enc_h_frame.min(rh as usize) {
                                            let src_off = y * src_stride;
                                            let dst_off = y * dst_stride;
                                            let copy_len = dst_stride.min(src_stride);
                                            cropped[dst_off..dst_off + copy_len].copy_from_slice(
                                                &frame_buf[src_off..src_off + copy_len],
                                            );
                                        }
                                        rgb_data = cropped.into();
                                        src_w = enc_w_frame;
                                        src_h = enc_h_frame;
                                    }

                                    prev_rgb = Some(rgb_data);
                                    prev_src_w = src_w;
                                    prev_src_h = src_h;
                                    prev_frame_hash = frame_hash;
                                    pending_repeat_count = 1;
                                    first_frame = false;
                                }
                            }

                            frame_idx += 1;
                            if frame_idx >= frames.len() {
                                break;
                            }
                        }

                        let pct = 10.0 + (frame_idx as f32 / total_frames as f32) * 85.0;
                        report_progress(pct);

                        if frame_idx >= frames.len() {
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if let Some(ref prev_data) = prev_rgb {
        encoder.write_frame(prev_data, prev_src_w, prev_src_h, pending_repeat_count)?;
    }

    encoder.finalize()?;

    report_progress(100.0);

    info!(
        "transcode completed in {:.2}s → {:?}",
        total_start.elapsed().as_secs_f64(),
        output_path
    );
    Ok(())
}

struct TimelineInfo {
    frames: Vec<FrameInfo>,
    max_width: u32,
    max_height: u32,
}

fn parse_and_build_timeline(guac_data: &[u8]) -> Result<TimelineInfo, String> {
    let mut parser = Parser::new(guac_data);
    let mut frames = Vec::new();
    let mut max_w: u32 = 1024;
    let mut max_h: u32 = 768;
    let mut next_emit_ms: u64 = 0;
    let mut emit_initialized = false;
    let mut instruction_offset = 0;

    while let Some(inst) = parser.next_instruction() {
        match inst.opcode {
            "sync" => {
                if let Some(ts_str) = inst.args.first() {
                    if let Ok(ts) = ts_str.parse::<u64>() {
                        if !emit_initialized {
                            next_emit_ms = ts + FRAME_INTERVAL_MS;
                            emit_initialized = true;
                        }

                        while next_emit_ms <= ts {
                            frames.push(FrameInfo {
                                timestamp: next_emit_ms,
                                instruction_offset,
                            });
                            next_emit_ms += FRAME_INTERVAL_MS;
                        }
                    }
                }
            }
            "size" => {
                if inst.args.len() >= 3 {
                    let lid: i32 = inst.args[0].parse().unwrap_or(-1);
                    if lid == 0 {
                        let w: u32 = inst.args[1].parse().unwrap_or(0);
                        let h: u32 = inst.args[2].parse().unwrap_or(0);
                        if w > 0 && h > 0 {
                            max_w = max_w.max(w);
                            max_h = max_h.max(h);
                        }
                    }
                }
            }
            _ => {}
        }
        instruction_offset = parser.current_offset();
    }

    Ok(TimelineInfo {
        frames,
        max_width: max_w,
        max_height: max_h,
    })
}

fn encode_chunks(
    start_chunk: usize,
    end_chunk: usize,
    frames_per_chunk: usize,
    guac_data: &[u8],
    frames: &[FrameInfo],
    total_frames: usize,
    encoded_frames: Arc<AtomicUsize>,
    callback: Arc<Mutex<impl Fn(f32)>>,
    canonical_sps: &[u8],
    canonical_pps: &[u8],
    target_dims: Option<(u32, u32)>,
    bitrate: u32,
    gop_size: u32,
) -> Result<Vec<ChunkResult>, String> {
    let mut results = Vec::new();

    for chunk_id in start_chunk..end_chunk {
        let start_frame = chunk_id * frames_per_chunk;
        let end_frame = (start_frame + frames_per_chunk).min(total_frames);

        if start_frame >= total_frames {
            break;
        }

        let chunk_frames = &frames[start_frame..end_frame];
        let chunk_frame_count = end_frame - start_frame;

        let result = encode_single_chunk(
            chunk_id,
            chunk_frames,
            guac_data,
            canonical_sps,
            canonical_pps,
            target_dims,
            bitrate,
            gop_size,
        )?;
        results.push(result);

        let done =
            encoded_frames.fetch_add(chunk_frame_count, Ordering::Relaxed) + chunk_frame_count;
        let pct = 10.0 + (done as f32 / total_frames as f32) * 85.0;
        callback.lock().unwrap()(pct);
    }

    Ok(results)
}

fn encode_single_chunk(
    chunk_id: usize,
    frames: &[FrameInfo],
    guac_data: &[u8],
    canonical_sps: &[u8],
    canonical_pps: &[u8],
    target_dims: Option<(u32, u32)>,
    bitrate: u32,
    gop_size: u32,
) -> Result<ChunkResult, String> {
    if frames.is_empty() {
        let (ew, eh) = target_dims.unwrap_or((DEFAULT_WIDTH, DEFAULT_HEIGHT));
        return Ok(ChunkResult {
            chunk_id,
            nals: Vec::new(),
            sample_sizes: Vec::new(),
            keyframe_indices: Vec::new(),
            sample_repeat_counts: Vec::new(),
            sps: canonical_sps.to_vec(),
            pps: canonical_pps.to_vec(),
            enc_width: ew,
            enc_height: eh,
        });
    }

    let first_frame_offset = frames[0].instruction_offset;

    let mut parser = Parser::new(guac_data);
    let mut renderer = Renderer::new(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    let mut width = DEFAULT_WIDTH;
    let mut height = DEFAULT_HEIGHT;

    let mut instruction_offset = 0;
    while instruction_offset < first_frame_offset {
        if let Some(inst) = parser.next_instruction() {
            match inst.opcode {
                "size" => {
                    renderer.handle_size(&inst.args);
                    if inst.args.len() >= 3 {
                        let lid: i32 = inst.args[0].parse().unwrap_or(-1);
                        if lid == 0 {
                            let w: u32 = inst.args[1].parse().unwrap_or(0);
                            let h: u32 = inst.args[2].parse().unwrap_or(0);
                            if w > 0 && h > 0 {
                                width = width.max(w);
                                height = height.max(h);
                            }
                        }
                    }
                }
                "img" => renderer.handle_img(&inst.args),
                "blob" => renderer.handle_blob(&inst.args),
                "end" => renderer.handle_end(&inst.args),
                "copy" => renderer.handle_copy(&inst.args),
                "rect" => renderer.handle_rect(&inst.args),
                "cfill" => renderer.handle_cfill(&inst.args),
                _ => {}
            }
            instruction_offset = parser.current_offset();
        } else {
            break;
        }
    }

    let mut resizer = Resizer::new();
    let resize_options =
        ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));

    let mut frame_buf = vec![255u8; (width * height * 3) as usize];
    let mut rgba_buf: Vec<u8> = Vec::new();

    let mut prev_frame_hash: u64 = 0;
    let mut first_frame = true;
    let mut pending_repeat_count: u32 = 0;
    let mut prev_repeat_count: u32 = 0;

    let (tx, rx) = mpsc::channel::<PreparedFrame>();

    let enc_w_fixed = target_dims.map(|(w, _)| w as usize);
    let enc_h_fixed = target_dims.map(|(_, h)| h as usize);
    let sps_owned = canonical_sps.to_vec();
    let pps_owned = canonical_pps.to_vec();

    let encoder_handle = std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            encoder_thread_fn(
                rx,
                enc_w_fixed,
                enc_h_fixed,
                bitrate,
                gop_size,
                &sps_owned,
                &pps_owned,
            )
        }));
        match result {
            Ok(inner) => inner,
            Err(payload) => Err(payload_to_string(payload)),
        }
    });

    let mut frame_idx = 0;

    'parser: while let Some(inst) = parser.next_instruction() {
        match inst.opcode {
            "size" => {
                renderer.handle_size(&inst.args);
                if inst.args.len() >= 3 {
                    let lid: i32 = inst.args[0].parse().unwrap_or(-1);
                    if lid == 0 {
                        let w: u32 = inst.args[1].parse().unwrap_or(0);
                        let h: u32 = inst.args[2].parse().unwrap_or(0);
                        if w > 0 && h > 0 {
                            width = width.max(w);
                            height = height.max(h);
                            let needed = (width * height * 3) as usize;
                            if frame_buf.len() < needed {
                                frame_buf.resize(needed, 255);
                            }
                        }
                    }
                }
            }
            "img" => renderer.handle_img(&inst.args),
            "blob" => renderer.handle_blob(&inst.args),
            "end" => renderer.handle_end(&inst.args),
            "copy" => renderer.handle_copy(&inst.args),
            "rect" => renderer.handle_rect(&inst.args),
            "cfill" => renderer.handle_cfill(&inst.args),
            "sync" => {
                if let Some(ts_str) = inst.args.first() {
                    if let Ok(ts) = ts_str.parse::<u64>() {
                        while frame_idx < frames.len() && frames[frame_idx].timestamp <= ts {
                            let rw = renderer.width();
                            let rh = renderer.height();

                            let (enc_w, enc_h) = if let Some((tw, th)) = target_dims {
                                (tw as usize, th as usize)
                            } else {
                                ((rw & !1) as usize, (rh & !1) as usize)
                            };

                            if enc_w >= 2 && enc_h >= 2 {
                                renderer.composite_into(&mut frame_buf, rw, rh);

                                let frame_hash =
                                    hash_frame_sample(&frame_buf, rw as usize, rh as usize);

                                if !first_frame && frame_hash == prev_frame_hash {
                                    pending_repeat_count += 1;
                                } else {
                                    let repeat_count = if first_frame {
                                        prev_repeat_count = 1;
                                        pending_repeat_count = 1;
                                        1
                                    } else {
                                        let rc = prev_repeat_count;
                                        prev_repeat_count = pending_repeat_count;
                                        pending_repeat_count = 1;
                                        rc
                                    };

                                    let src_len = (rw * rh * 3) as usize;
                                    let rgb_data: Arc<[u8]>;
                                    let src_w: usize;
                                    let src_h: usize;

                                    if target_dims.is_some()
                                        && (enc_w != rw as usize || enc_h != rh as usize)
                                    {
                                        let src_view =
                                            ImageRef::new(rw, rh, &frame_buf[..src_len], U8x3)
                                                .map_err(|e| format!("create image view: {}", e))?;

                                        rgba_buf.resize((enc_w * enc_h * 3) as usize, 0);
                                        let mut dst_image = Image::from_slice_u8(
                                            enc_w as u32,
                                            enc_h as u32,
                                            &mut rgba_buf,
                                            U8x3,
                                        )
                                        .map_err(|e| format!("create dst image: {}", e))?;

                                        resizer
                                            .resize(&src_view, &mut dst_image, &resize_options)
                                            .map_err(|e| format!("resize failed: {}", e))?;

                                        rgb_data = rgba_buf.as_slice().into();
                                        src_w = enc_w;
                                        src_h = enc_h;
                                    } else if enc_w == rw as usize && enc_h == rh as usize {
                                        rgb_data = frame_buf[..src_len].into();
                                        src_w = enc_w;
                                        src_h = enc_h;
                                    } else {
                                        let mut cropped = vec![255u8; (enc_w * enc_h * 3) as usize];
                                        let src_stride = rw as usize * 3;
                                        let dst_stride = enc_w * 3;
                                        for y in 0..enc_h.min(rh as usize) {
                                            let src_off = y * src_stride;
                                            let dst_off = y * dst_stride;
                                            let copy_len = dst_stride.min(src_stride);
                                            cropped[dst_off..dst_off + copy_len].copy_from_slice(
                                                &frame_buf[src_off..src_off + copy_len],
                                            );
                                        }
                                        rgb_data = cropped.into();
                                        src_w = enc_w;
                                        src_h = enc_h;
                                    }

                                    if tx
                                        .send(PreparedFrame {
                                            rgb: rgb_data,
                                            width: src_w,
                                            height: src_h,
                                            repeat_count,
                                        })
                                        .is_err()
                                    {
                                        break 'parser;
                                    }

                                    first_frame = false;
                                }

                                prev_frame_hash = frame_hash;
                            }

                            frame_idx += 1;
                            if frame_idx >= frames.len() {
                                break;
                            }
                        }

                        if frame_idx >= frames.len() {
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if pending_repeat_count > 1 {
        let _ = tx.send(PreparedFrame {
            rgb: Arc::from(&[][..]),
            width: 0,
            height: 0,
            repeat_count: pending_repeat_count,
        });
    }

    drop(tx);

    match encoder_handle.join() {
        Ok(Ok(r)) => Ok(ChunkResult {
            chunk_id,
            nals: r.nals,
            sample_sizes: r.sample_sizes,
            keyframe_indices: r.keyframe_indices,
            sample_repeat_counts: r.sample_repeat_counts,
            sps: r.sps,
            pps: r.pps,
            enc_width: r.enc_width,
            enc_height: r.enc_height,
        }),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("encoder thread panicked".to_string()),
    }
}

fn encoder_thread_fn(
    rx: mpsc::Receiver<PreparedFrame>,
    enc_w_fixed: Option<usize>,
    enc_h_fixed: Option<usize>,
    bitrate: u32,
    gop_size: u32,
    canonical_sps: &[u8],
    canonical_pps: &[u8],
) -> Result<ChunkResultInner, String> {
    let mut encoder: Option<Box<dyn H264Encoder>> = None;
    let mut nals = Vec::new();
    let mut sample_sizes = Vec::new();
    let mut keyframe_indices = Vec::new();
    let mut sample_repeat_counts = Vec::new();
    let mut max_enc_w: u32 = 0;
    let mut max_enc_h: u32 = 0;
    let mut has_prev_sample = false;
    let mut sps = Vec::new();
    let mut pps = Vec::new();

    for prepared in rx {
        if prepared.rgb.is_empty() {
            if has_prev_sample {
                *sample_repeat_counts.last_mut().unwrap() += prepared.repeat_count;
            }
            continue;
        }

        if encoder.is_none() {
            encoder = Some(create_encoder(
                prepared.width as u32,
                prepared.height as u32,
                bitrate,
                gop_size,
            )?);
        }

        let enc = encoder.as_mut().unwrap();
        let output = enc.encode_frame(&prepared.rgb, prepared.width, prepared.height)?;

        if output.sample_size > 0 {
            let sample_idx = sample_sizes.len();
            nals.extend_from_slice(&output.data);
            sample_sizes.push(output.sample_size);
            sample_repeat_counts.push(prepared.repeat_count);
            if output.is_keyframe {
                keyframe_indices.push(sample_idx);
            }
            max_enc_w = max_enc_w.max(prepared.width as u32);
            max_enc_h = max_enc_h.max(prepared.height as u32);

            if !enc.sps().is_empty() {
                sps = enc.sps().to_vec();
            }
            if !enc.pps().is_empty() {
                pps = enc.pps().to_vec();
            }
            has_prev_sample = true;
        } else if has_prev_sample {
            *sample_repeat_counts.last_mut().unwrap() += prepared.repeat_count;
        }
    }

    if let Some(ref mut enc) = encoder {
        let _ = enc.flush();
    }

    let (out_sps, out_pps) = if canonical_sps.is_empty() {
        (sps, pps)
    } else {
        (canonical_sps.to_vec(), canonical_pps.to_vec())
    };

    let final_w = if max_enc_w > 0 {
        max_enc_w
    } else {
        enc_w_fixed.unwrap_or(DEFAULT_WIDTH as usize) as u32
    };
    let final_h = if max_enc_h > 0 {
        max_enc_h
    } else {
        enc_h_fixed.unwrap_or(DEFAULT_HEIGHT as usize) as u32
    };

    Ok(ChunkResultInner {
        nals,
        sample_sizes,
        keyframe_indices,
        sample_repeat_counts,
        sps: out_sps,
        pps: out_pps,
        enc_width: final_w,
        enc_height: final_h,
    })
}

struct ChunkResultInner {
    nals: Vec<u8>,
    sample_sizes: Vec<u32>,
    keyframe_indices: Vec<usize>,
    sample_repeat_counts: Vec<u32>,
    sps: Vec<u8>,
    pps: Vec<u8>,
    enc_width: u32,
    enc_height: u32,
}

pub(crate) fn hash_frame_sample(rgb: &[u8], width: usize, height: usize) -> u64 {
    let stride = width * 3;
    let step = 8usize;
    let mut hash: u64 = 0xcbf29ce484222325;

    let mut y = 0;
    while y < height {
        let mut x = 0;
        while x < width {
            let idx = y * stride + x * 3;
            if idx + 2 < rgb.len() {
                let val = rgb[idx] as u64 + rgb[idx + 1] as u64 + rgb[idx + 2] as u64;
                hash ^= val;
                hash = hash.wrapping_mul(0x100000001b3);
            }
            x += step;
        }
        y += step;
    }

    hash
}

fn write_mp4_faststart(
    output_path: &Path,
    results: Vec<ChunkResult>,
    frames: &[FrameInfo],
) -> Result<(), String> {
    let tmp_path = output_path.with_extension("mp4.tmp");

    let (mdat_header_pos, mdat_payload_start, bytes_written) =
        write_mp4_to_file(&tmp_path, &results)?;
    let _ = frames;

    if bytes_written == 0 {
        let _ = std::fs::remove_file(&tmp_path);
        return Err("no data written".to_string());
    }

    let moov_offset = mdat_payload_start + bytes_written;

    let mut tmp_file =
        std::fs::File::open(&tmp_path).map_err(|e| format!("open temp file: {}", e))?;

    let ftyp = make_ftyp();

    tmp_file
        .seek(SeekFrom::Start(moov_offset))
        .map_err(|e| format!("seek to moov: {}", e))?;
    let mut moov_data = Vec::new();
    tmp_file
        .read_to_end(&mut moov_data)
        .map_err(|e| format!("read moov: {}", e))?;

    let moov_size = moov_data.len() as u64;
    let moov_adjusted = rebuild_moov_with_offset(&moov_data, moov_size);

    let final_file =
        std::fs::File::create(output_path).map_err(|e| format!("create output: {}", e))?;
    let mut w = std::io::BufWriter::new(final_file);

    w.write_all(&ftyp).map_err(|e| e.to_string())?;
    w.write_all(&moov_adjusted).map_err(|e| e.to_string())?;

    drop(tmp_file);
    let mut tmp_file = std::fs::File::open(&tmp_path).map_err(|e| format!("reopen temp: {}", e))?;
    tmp_file
        .seek(SeekFrom::Start(mdat_header_pos))
        .map_err(|e| format!("seek to mdat: {}", e))?;

    let mdat_total = 8 + bytes_written;
    let mut remaining = mdat_total;
    let mut buf = vec![0u8; 64 * 1024];
    while remaining > 0 {
        let to_read = buf.len().min(remaining as usize);
        let n = tmp_file
            .read(&mut buf[..to_read])
            .map_err(|e| format!("read mdat: {}", e))?;
        if n == 0 {
            break;
        }
        w.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        remaining -= n as u64;
    }

    w.flush().map_err(|e| e.to_string())?;
    drop(w);

    let _ = std::fs::remove_file(&tmp_path);
    Ok(())
}

fn rebuild_moov_with_offset(moov_data: &[u8], moov_size: u64) -> Vec<u8> {
    let mut result = moov_data.to_vec();
    let moov_pos = match find_box_in_data(&result, b"moov") {
        Some(p) => p,
        None => return result,
    };
    let trak_pos = match find_box_in_data(&result[moov_pos + 8..], b"trak") {
        Some(p) => moov_pos + 8 + p,
        None => return result,
    };
    let mdia_pos = match find_box_in_data(&result[trak_pos + 8..], b"mdia") {
        Some(p) => trak_pos + 8 + p,
        None => return result,
    };
    let minf_pos = match find_box_in_data(&result[mdia_pos + 8..], b"minf") {
        Some(p) => mdia_pos + 8 + p,
        None => return result,
    };
    let stbl_pos = match find_box_in_data(&result[minf_pos + 8..], b"stbl") {
        Some(p) => minf_pos + 8 + p,
        None => return result,
    };
    let co64_pos = match find_box_in_data(&result[stbl_pos + 8..], b"co64") {
        Some(p) => stbl_pos + 8 + p,
        None => return result,
    };

    let entries_offset = co64_pos + 16;
    if entries_offset + 8 > result.len() {
        return result;
    }
    let entry_count = u32::from_be_bytes([
        result[co64_pos + 12],
        result[co64_pos + 13],
        result[co64_pos + 14],
        result[co64_pos + 15],
    ]) as usize;

    for i in 0..entry_count {
        let off = entries_offset + i * 8;
        if off + 8 <= result.len() {
            let old = u64::from_be_bytes([
                result[off],
                result[off + 1],
                result[off + 2],
                result[off + 3],
                result[off + 4],
                result[off + 5],
                result[off + 6],
                result[off + 7],
            ]);
            let new = old + moov_size;
            result[off..off + 8].copy_from_slice(&new.to_be_bytes());
        }
    }

    result
}

fn find_box_in_data(data: &[u8], box_type: &[u8; 4]) -> Option<usize> {
    let mut pos = 0;
    while pos + 8 <= data.len() {
        let size =
            u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        if &data[pos + 4..pos + 8] == box_type {
            return Some(pos);
        }
        if size < 8 || pos + size > data.len() {
            return None;
        }
        pos += size;
    }
    None
}

fn write_mp4_to_file(path: &Path, results: &[ChunkResult]) -> Result<(u64, u64, u64), String> {
    let file = std::fs::File::create(path).map_err(|e| format!("create file: {}", e))?;
    let mut w = std::io::BufWriter::new(file);

    let ftyp = make_ftyp();
    w.write_all(&ftyp).map_err(|e| e.to_string())?;

    let mdat_header_pos = ftyp.len() as u64;
    w.write_all(&0u32.to_be_bytes())
        .map_err(|e| e.to_string())?;
    w.write_all(b"mdat").map_err(|e| e.to_string())?;

    let mdat_payload_start = mdat_header_pos + 8;

    let mut all_sample_sizes = Vec::new();
    let mut all_keyframe_indices = Vec::new();
    let mut all_repeat_counts = Vec::new();
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    let mut bytes_written: u64 = 0;
    let mut max_w: u32 = 0;
    let mut max_h: u32 = 0;

    for result in results {
        if !result.sps.is_empty() && !result.pps.is_empty() {
            sps = result.sps.clone();
            pps = result.pps.clone();
            break;
        }
    }

    for result in results {
        w.write_all(&result.nals).map_err(|e| e.to_string())?;

        let base_sample_idx = all_sample_sizes.len();
        for &k in &result.keyframe_indices {
            all_keyframe_indices.push(base_sample_idx + k);
        }

        all_sample_sizes.extend_from_slice(&result.sample_sizes);
        all_repeat_counts.extend_from_slice(&result.sample_repeat_counts);
        bytes_written += result.nals.len() as u64;
        max_w = max_w.max(result.enc_width);
        max_h = max_h.max(result.enc_height);
    }

    w.flush().map_err(|e| e.to_string())?;

    if all_sample_sizes.len() < 2 {
        return Err("not enough frames to encode".to_string());
    }
    if sps.is_empty() || pps.is_empty() {
        return Err("missing SPS or PPS in encoded stream".to_string());
    }

    let enc_width = (max_w & !1) as u32;
    let enc_height = (max_h & !1) as u32;
    let mdat_size = 8u64 + bytes_written;

    w.seek(SeekFrom::Start(mdat_header_pos))
        .map_err(|e| e.to_string())?;
    w.write_all(&(mdat_size as u32).to_be_bytes())
        .map_err(|e| e.to_string())?;

    w.seek(SeekFrom::Start(mdat_payload_start + bytes_written))
        .map_err(|e| e.to_string())?;

    let moov = make_moov(
        enc_width,
        enc_height,
        &all_repeat_counts,
        &all_sample_sizes,
        &all_keyframe_indices,
        &sps,
        &pps,
        mdat_payload_start,
    );

    w.write_all(&moov).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;

    Ok((mdat_header_pos, mdat_payload_start, bytes_written))
}

fn box_raw(typ: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut b = Vec::with_capacity(8 + payload.len());
    b.extend_from_slice(&((8 + payload.len()) as u32).to_be_bytes());
    b.extend_from_slice(typ);
    b.extend_from_slice(payload);
    b
}

fn fullbox(typ: &[u8; 4], ver: u8, flags: u32, payload: &[u8]) -> Vec<u8> {
    let mut b = Vec::with_capacity(12 + payload.len());
    b.extend_from_slice(&((12 + payload.len()) as u32).to_be_bytes());
    b.extend_from_slice(typ);
    b.push(ver);
    b.push((flags >> 16) as u8);
    b.push((flags >> 8) as u8);
    b.push(flags as u8);
    b.extend_from_slice(payload);
    b
}

fn make_ftyp() -> Vec<u8> {
    let mut p = Vec::new();
    p.extend_from_slice(b"isom");
    p.extend_from_slice(&0u32.to_be_bytes());
    p.extend_from_slice(b"isom");
    p.extend_from_slice(b"iso2");
    p.extend_from_slice(b"avc1");
    p.extend_from_slice(b"mp41");
    box_raw(b"ftyp", &p)
}

fn make_moov(
    w: u32,
    h: u32,
    repeat_counts: &[u32],
    sizes: &[u32],
    keys: &[usize],
    sps: &[u8],
    pps: &[u8],
    offset: u64,
) -> Vec<u8> {
    let unique_samples = repeat_counts.len() as u32;
    let total_display_samples: u64 = repeat_counts.iter().map(|&c| c as u64).sum();
    let dur = total_display_samples * SAMPLE_DURATION as u64;

    let mut mvhd_p = Vec::new();
    mvhd_p.extend_from_slice(&0u32.to_be_bytes());
    mvhd_p.extend_from_slice(&0u32.to_be_bytes());
    mvhd_p.extend_from_slice(&TIME_SCALE.to_be_bytes());
    mvhd_p.extend_from_slice(&(dur as u32).to_be_bytes());
    mvhd_p.extend_from_slice(&0x00010000u32.to_be_bytes());
    mvhd_p.extend_from_slice(&0x0100u16.to_be_bytes());
    mvhd_p.extend_from_slice(&[0u8; 10]);
    for v in [0x00010000u32, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000] {
        mvhd_p.extend_from_slice(&v.to_be_bytes());
    }
    mvhd_p.extend_from_slice(&[0u8; 24]);
    mvhd_p.extend_from_slice(&2u32.to_be_bytes());
    let mvhd = fullbox(b"mvhd", 0, 0, &mvhd_p);

    let mut tkhd_p = Vec::new();
    tkhd_p.extend_from_slice(&0u32.to_be_bytes());
    tkhd_p.extend_from_slice(&0u32.to_be_bytes());
    tkhd_p.extend_from_slice(&1u32.to_be_bytes());
    tkhd_p.extend_from_slice(&0u32.to_be_bytes());
    tkhd_p.extend_from_slice(&(dur as u32).to_be_bytes());
    tkhd_p.extend_from_slice(&[0u8; 8]);
    tkhd_p.extend_from_slice(&0u16.to_be_bytes());
    tkhd_p.extend_from_slice(&0u16.to_be_bytes());
    tkhd_p.extend_from_slice(&0u16.to_be_bytes());
    tkhd_p.extend_from_slice(&0u16.to_be_bytes());
    for v in [0x00010000u32, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000] {
        tkhd_p.extend_from_slice(&v.to_be_bytes());
    }
    tkhd_p.extend_from_slice(&(w << 16).to_be_bytes());
    tkhd_p.extend_from_slice(&(h << 16).to_be_bytes());
    let tkhd = fullbox(b"tkhd", 0, 3, &tkhd_p);

    let mut mdhd_p = Vec::new();
    mdhd_p.extend_from_slice(&0u32.to_be_bytes());
    mdhd_p.extend_from_slice(&0u32.to_be_bytes());
    mdhd_p.extend_from_slice(&TIME_SCALE.to_be_bytes());
    mdhd_p.extend_from_slice(&(dur as u32).to_be_bytes());
    mdhd_p.extend_from_slice(&0x55C4u16.to_be_bytes());
    mdhd_p.extend_from_slice(&0u16.to_be_bytes());
    let mdhd = fullbox(b"mdhd", 0, 0, &mdhd_p);

    let mut hdlr_p = Vec::new();
    hdlr_p.extend_from_slice(&0u32.to_be_bytes());
    hdlr_p.extend_from_slice(b"vide");
    hdlr_p.extend_from_slice(&[0u8; 12]);
    hdlr_p.extend_from_slice(b"VideoHandler\0");
    let hdlr = fullbox(b"hdlr", 0, 0, &hdlr_p);

    let vmhd = fullbox(b"vmhd", 0, 1, &[0u8; 8]);

    let url_box = fullbox(b"url ", 0, 1, &[]);
    let mut dref_p = Vec::new();
    dref_p.extend_from_slice(&1u32.to_be_bytes());
    dref_p.extend_from_slice(&url_box);
    let dref = fullbox(b"dref", 0, 0, &dref_p);
    let dinf = box_raw(b"dinf", &dref);

    let avcc = make_avcc(sps, pps);
    let mut avc1_p = Vec::new();
    avc1_p.extend_from_slice(&[0u8; 6]);
    avc1_p.extend_from_slice(&1u16.to_be_bytes());
    avc1_p.extend_from_slice(&0u16.to_be_bytes());
    avc1_p.extend_from_slice(&0u16.to_be_bytes());
    avc1_p.extend_from_slice(&[0u8; 12]);
    avc1_p.extend_from_slice(&(w as u16).to_be_bytes());
    avc1_p.extend_from_slice(&(h as u16).to_be_bytes());
    avc1_p.extend_from_slice(&0x00480000u32.to_be_bytes());
    avc1_p.extend_from_slice(&0x00480000u32.to_be_bytes());
    avc1_p.extend_from_slice(&0u32.to_be_bytes());
    avc1_p.extend_from_slice(&1u16.to_be_bytes());
    avc1_p.extend_from_slice(&[0u8; 32]);
    avc1_p.extend_from_slice(&0x0018u16.to_be_bytes());
    avc1_p.extend_from_slice(&(-1i16).to_be_bytes());
    avc1_p.extend_from_slice(&avcc);
    let avc1 = box_raw(b"avc1", &avc1_p);

    let mut stsd_p = Vec::new();
    stsd_p.extend_from_slice(&1u32.to_be_bytes());
    stsd_p.extend_from_slice(&avc1);
    let stsd = fullbox(b"stsd", 0, 0, &stsd_p);

    let stts_entries = build_stts_entries(repeat_counts);
    let mut stts_p = Vec::new();
    stts_p.extend_from_slice(&(stts_entries.len() as u32).to_be_bytes());
    for (count, duration) in &stts_entries {
        stts_p.extend_from_slice(&count.to_be_bytes());
        stts_p.extend_from_slice(&duration.to_be_bytes());
    }
    let stts = fullbox(b"stts", 0, 0, &stts_p);

    let mut stsz_p = Vec::new();
    stsz_p.extend_from_slice(&0u32.to_be_bytes());
    stsz_p.extend_from_slice(&unique_samples.to_be_bytes());
    for &s in sizes {
        stsz_p.extend_from_slice(&s.to_be_bytes());
    }
    let stsz = fullbox(b"stsz", 0, 0, &stsz_p);

    let mut stsc_p = Vec::new();
    stsc_p.extend_from_slice(&1u32.to_be_bytes());
    stsc_p.extend_from_slice(&1u32.to_be_bytes());
    stsc_p.extend_from_slice(&unique_samples.to_be_bytes());
    stsc_p.extend_from_slice(&1u32.to_be_bytes());
    let stsc = fullbox(b"stsc", 0, 0, &stsc_p);

    let mut co64_p = Vec::new();
    co64_p.extend_from_slice(&1u32.to_be_bytes());
    co64_p.extend_from_slice(&offset.to_be_bytes());
    let co64 = fullbox(b"co64", 0, 0, &co64_p);

    let mut stbl_p = Vec::new();
    stbl_p.extend_from_slice(&stsd);
    stbl_p.extend_from_slice(&stts);
    stbl_p.extend_from_slice(&stsz);
    stbl_p.extend_from_slice(&stsc);
    stbl_p.extend_from_slice(&co64);

    if keys.len() < unique_samples as usize {
        let mut stss_p = Vec::new();
        stss_p.extend_from_slice(&(keys.len() as u32).to_be_bytes());
        for &k in keys {
            stss_p.extend_from_slice(&((k + 1) as u32).to_be_bytes());
        }
        let stss = fullbox(b"stss", 0, 0, &stss_p);
        stbl_p.extend_from_slice(&stss);
    }

    let stbl = box_raw(b"stbl", &stbl_p);

    let mut minf_p = Vec::new();
    minf_p.extend_from_slice(&vmhd);
    minf_p.extend_from_slice(&dinf);
    minf_p.extend_from_slice(&stbl);
    let minf = box_raw(b"minf", &minf_p);

    let mut mdia_p = Vec::new();
    mdia_p.extend_from_slice(&mdhd);
    mdia_p.extend_from_slice(&hdlr);
    mdia_p.extend_from_slice(&minf);
    let mdia = box_raw(b"mdia", &mdia_p);

    let mut trak_p = Vec::new();
    trak_p.extend_from_slice(&tkhd);
    trak_p.extend_from_slice(&mdia);
    let trak = box_raw(b"trak", &trak_p);

    let mut moov_p = Vec::new();
    moov_p.extend_from_slice(&mvhd);
    moov_p.extend_from_slice(&trak);
    box_raw(b"moov", &moov_p)
}

fn build_stts_entries(repeat_counts: &[u32]) -> Vec<(u32, u32)> {
    if repeat_counts.is_empty() {
        return Vec::new();
    }
    let mut entries: Vec<(u32, u32)> = Vec::new();
    let mut current_duration = repeat_counts[0] * SAMPLE_DURATION;
    let mut current_count: u32 = 1;

    for &rc in &repeat_counts[1..] {
        let duration = rc * SAMPLE_DURATION;
        if duration == current_duration {
            current_count += 1;
        } else {
            entries.push((current_count, current_duration));
            current_duration = duration;
            current_count = 1;
        }
    }
    entries.push((current_count, current_duration));
    entries
}

fn make_avcc(sps: &[u8], pps: &[u8]) -> Vec<u8> {
    let profile = sps.get(1).copied().unwrap_or(66);
    let compat = sps.get(2).copied().unwrap_or(0);
    let level = sps.get(3).copied().unwrap_or(30);

    let mut p = Vec::new();
    p.push(1);
    p.push(profile);
    p.push(compat);
    p.push(level);
    p.push(0xFF);
    p.push(0xE1);
    p.extend_from_slice(&(sps.len() as u16).to_be_bytes());
    p.extend_from_slice(sps);
    p.push(1);
    p.extend_from_slice(&(pps.len() as u16).to_be_bytes());
    p.extend_from_slice(pps);

    box_raw(b"avcC", &p)
}

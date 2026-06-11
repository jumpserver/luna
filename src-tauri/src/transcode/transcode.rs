use crate::transcode::parser::Parser;
use crate::transcode::renderer::Renderer;
use crate::transcode::{OutputResolution, compute_target_dimensions, scan_max_canvas_size};
use image::{RgbaImage, imageops};
use log::info;
use openh264::encoder::Encoder;
use openh264::formats::{RgbSliceU8, YUVBuffer};
use std::io::{Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

const DEFAULT_WIDTH: u32 = 1024;
const DEFAULT_HEIGHT: u32 = 768;
const FPS: u32 = 10;
const TIME_SCALE: u32 = 1000;
const SAMPLE_DURATION: u32 = TIME_SCALE / FPS;
const FRAME_INTERVAL_MS: u64 = 1000 / FPS as u64;
const FRAMES_PER_CHUNK: usize = 50;

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
    sps: Vec<u8>,
    pps: Vec<u8>,
    enc_width: u32,
    enc_height: u32,
}

pub fn transcode_to_mp4(
    guac_data: &[u8],
    output_path: &Path,
    resolution: OutputResolution,
    progress_callback: impl Fn(f32) + Send + Sync + 'static,
) -> Result<(), String> {
    info!("Phase 1: Parsing instructions and building timeline");
    progress_callback(5.0);

    let frames = parse_and_build_timeline(guac_data)?;
    let total_frames = frames.len();

    if total_frames < 2 {
        return Err("not enough frames to encode".to_string());
    }

    info!("Found {} frames to encode", total_frames);
    progress_callback(10.0);

    let target_dims = if resolution != OutputResolution::Original {
        let (max_w, max_h) = scan_max_canvas_size(guac_data);
        let (tw, th) = compute_target_dimensions(max_w, max_h, &resolution);
        info!("output resolution: {:?}, source {}x{} -> target {}x{}", resolution, max_w, max_h, tw, th);
        Some((tw, th))
    } else {
        None
    };

    // First pass: encode first chunk to get canonical SPS/PPS
    let first_chunk_frames = &frames[..frames.len().min(FRAMES_PER_CHUNK)];
    let first_result = encode_single_chunk(0, first_chunk_frames, guac_data, &[], &[], target_dims)?;
    
    let canonical_sps = first_result.sps.clone();
    let canonical_pps = first_result.pps.clone();
    
    if canonical_sps.is_empty() || canonical_pps.is_empty() {
        return Err("failed to get SPS/PPS from first chunk".to_string());
    }

    let num_chunks = (total_frames + FRAMES_PER_CHUNK - 1) / FRAMES_PER_CHUNK;
    let num_cores = num_cpus::get().min(num_chunks).max(1);

    info!(
        "Phase 2: Splitting into {} chunks, using {} cores",
        num_chunks, num_cores
    );

    let chunk_size = (num_chunks + num_cores - 1) / num_cores;
    let actual_cores = (num_chunks + chunk_size - 1) / chunk_size;

    info!("Each core will process {} chunks", chunk_size);

    let guac_data_arc = Arc::new(guac_data.to_vec());
    let progress = Arc::new(Mutex::new(vec![0.0f32; actual_cores]));
    let progress_callback = Arc::new(Mutex::new(progress_callback));
    let canonical_sps_arc = Arc::new(canonical_sps);
    let canonical_pps_arc = Arc::new(canonical_pps);

    let mut handles = Vec::new();

    // Start from chunk 1 since we already encoded chunk 0
    for core_id in 0..actual_cores {
        let start_chunk = core_id * chunk_size;
        let end_chunk = (start_chunk + chunk_size).min(num_chunks);

        if start_chunk >= num_chunks {
            break;
        }

        // Skip chunk 0 for core 0 since we already encoded it
        let actual_start = if core_id == 0 { start_chunk.max(1) } else { start_chunk };
        if actual_start >= end_chunk {
            continue;
        }

        let guac_data_clone = Arc::clone(&guac_data_arc);
        let frames_clone = frames.clone();
        let progress_clone = Arc::clone(&progress);
        let callback_clone = Arc::clone(&progress_callback);
        let sps_clone = Arc::clone(&canonical_sps_arc);
        let pps_clone = Arc::clone(&canonical_pps_arc);

        let handle = std::thread::spawn(move || {
            encode_chunks(
                core_id,
                actual_start,
                end_chunk,
                FRAMES_PER_CHUNK,
                &guac_data_clone,
                &frames_clone,
                total_frames,
                progress_clone,
                callback_clone,
                &sps_clone,
                &pps_clone,
                target_dims,
            )
        });

        handles.push(handle);
    }

    let mut all_results = vec![first_result];

    for handle in handles {
        match handle.join() {
            Ok(Ok(results)) => all_results.extend(results),
            Ok(Err(e)) => return Err(e),
            Err(_) => return Err("thread panicked".to_string()),
        }
    }

    all_results.sort_by_key(|r| r.chunk_id);

    progress_callback.lock().unwrap()(90.0);

    info!("Phase 3: Merging results and writing MP4");

    write_mp4(output_path, all_results, &frames)?;

    progress_callback.lock().unwrap()(100.0);

    info!("MP4 written: {:?}", output_path);
    Ok(())
}

fn parse_and_build_timeline(guac_data: &[u8]) -> Result<Vec<FrameInfo>, String> {
    let mut parser = Parser::new(guac_data);
    let mut frames = Vec::new();
    let mut min_ts: u64 = u64::MAX;
    let mut max_ts: u64 = 0;
    let mut next_emit_ms: u64 = 0;
    let mut emit_initialized = false;
    let mut instruction_offset = 0;

    while let Some(inst) = parser.next_instruction() {
        if inst.opcode == "sync" {
            if let Some(ts_str) = inst.args.first() {
                if let Ok(ts) = ts_str.parse::<u64>() {
                    if ts < min_ts {
                        min_ts = ts;
                    }
                    if ts > max_ts {
                        max_ts = ts;
                    }

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
        instruction_offset = parser.current_offset();
    }

    Ok(frames)
}

fn encode_chunks(
    core_id: usize,
    start_chunk: usize,
    end_chunk: usize,
    frames_per_chunk: usize,
    guac_data: &[u8],
    frames: &[FrameInfo],
    total_frames: usize,
    progress: Arc<Mutex<Vec<f32>>>,
    callback: Arc<Mutex<impl Fn(f32)>>,
    canonical_sps: &[u8],
    canonical_pps: &[u8],
    target_dims: Option<(u32, u32)>,
) -> Result<Vec<ChunkResult>, String> {
    let mut results = Vec::new();

    for chunk_id in start_chunk..end_chunk {
        let start_frame = chunk_id * frames_per_chunk;
        let end_frame = (start_frame + frames_per_chunk).min(total_frames);

        if start_frame >= total_frames {
            break;
        }

        let chunk_frames = &frames[start_frame..end_frame];

        let result = encode_single_chunk(chunk_id, chunk_frames, guac_data, canonical_sps, canonical_pps, target_dims)?;
        results.push(result);

        let chunk_progress = (end_frame as f32 / total_frames as f32 * 80.0) + 10.0;
        {
            let mut progress_vec = progress.lock().unwrap();
            progress_vec[core_id] = chunk_progress;
            let avg_progress: f32 = progress_vec.iter().sum::<f32>() / progress_vec.len() as f32;
            callback.lock().unwrap()(avg_progress);
        }
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
) -> Result<ChunkResult, String> {
    if frames.is_empty() {
        let (ew, eh) = target_dims.unwrap_or((DEFAULT_WIDTH, DEFAULT_HEIGHT));
        return Ok(ChunkResult {
            chunk_id,
            nals: Vec::new(),
            sample_sizes: Vec::new(),
            keyframe_indices: Vec::new(),
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

    let mut encoder = Encoder::new().map_err(|e| format!("create encoder failed: {}", e))?;
    let mut frame_buf = vec![255u8; (width * height * 3) as usize];
    let mut nals = Vec::new();
    let mut sample_sizes = Vec::new();
    let mut keyframe_indices = Vec::new();
    let mut captured_sps = Vec::new();
    let mut captured_pps = Vec::new();
    let capture = canonical_sps.is_empty();
    let mut max_enc_w: u32 = 0;
    let mut max_enc_h: u32 = 0;

    let mut frame_idx = 0;

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

                            let (enc_w, enc_h) = if let Some((tw, th)) = target_dims {
                                (tw as usize, th as usize)
                            } else {
                                ((rw & !1) as usize, (rh & !1) as usize)
                            };

                            if enc_w >= 2 && enc_h >= 2 {
                                renderer.composite_into(&mut frame_buf, rw, rh);

                                let mut resized_buf;
                                let (encode_buf, src_w, src_h) = if target_dims.is_some()
                                    && (enc_w != rw as usize || enc_h != rh as usize)
                                {
                                    let src_img = RgbaImage::from_raw(rw, rh, frame_buf[..(rw * rh * 3) as usize].to_vec())
                                        .unwrap_or_else(|| RgbaImage::new(rw, rh));
                                    let resized = imageops::resize(&src_img, enc_w as u32, enc_h as u32, imageops::FilterType::Triangle);
                                    resized_buf = Vec::with_capacity((enc_w * enc_h * 3) as usize);
                                    for pixel in resized.pixels() {
                                        resized_buf.push(pixel[0]);
                                        resized_buf.push(pixel[1]);
                                        resized_buf.push(pixel[2]);
                                    }
                                    (resized_buf.as_slice(), enc_w, enc_h)
                                } else {
                                    (frame_buf.as_slice(), rw as usize, rh as usize)
                                };

                                max_enc_w = max_enc_w.max(enc_w as u32);
                                max_enc_h = max_enc_h.max(enc_h as u32);

                                encode_frame(
                                    &mut encoder,
                                    &mut nals,
                                    encode_buf,
                                    src_w,
                                    src_h,
                                    enc_w,
                                    enc_h,
                                    &mut sample_sizes,
                                    &mut keyframe_indices,
                                    &mut captured_sps,
                                    &mut captured_pps,
                                )?;
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

    let (out_sps, out_pps) = if capture {
        (captured_sps, captured_pps)
    } else {
        (canonical_sps.to_vec(), canonical_pps.to_vec())
    };

    let final_w = if max_enc_w > 0 { max_enc_w } else { DEFAULT_WIDTH };
    let final_h = if max_enc_h > 0 { max_enc_h } else { DEFAULT_HEIGHT };

    Ok(ChunkResult {
        chunk_id,
        nals,
        sample_sizes,
        keyframe_indices,
        sps: out_sps,
        pps: out_pps,
        enc_width: final_w,
        enc_height: final_h,
    })
}

fn encode_frame(
    encoder: &mut Encoder,
    nals: &mut Vec<u8>,
    frame_buf: &[u8],
    src_w: usize,
    src_h: usize,
    enc_w: usize,
    enc_h: usize,
    sample_sizes: &mut Vec<u32>,
    keyframe_indices: &mut Vec<usize>,
    sps_out: &mut Vec<u8>,
    pps_out: &mut Vec<u8>,
) -> Result<(), String> {
    let normalized = normalize_rgb_frame(frame_buf, src_w, src_h, enc_w, enc_h);
    let rgb_slice = RgbSliceU8::new(&normalized, (enc_w, enc_h));
    let yuv = YUVBuffer::from_rgb_source(rgb_slice);

    let bs = encoder.encode(&yuv).map_err(|e| format!("encode frame failed: {}", e))?;
    let raw = bs.to_vec();

    if raw.is_empty() {
        return Ok(());
    }

    let nal_units = split_annex_b(&raw);
    let mut is_key = false;
    let mut sample_size: u32 = 0;

    for nal in nal_units {
        if nal.is_empty() {
            continue;
        }

        match nal[0] & 0x1F {
            7 => {
                *sps_out = nal.to_vec();
                continue;
            }
            8 => {
                *pps_out = nal.to_vec();
                continue;
            }
            5 => { is_key = true; }
            _ => {}
        }

        let len = nal.len() as u32;
        nals.extend_from_slice(&len.to_be_bytes());
        nals.extend_from_slice(nal);
        sample_size += 4 + len;
    }

    if sample_size == 0 {
        return Ok(());
    }

    let sample_idx = sample_sizes.len();
    sample_sizes.push(sample_size);

    if is_key {
        keyframe_indices.push(sample_idx);
    }

    Ok(())
}

fn write_mp4(
    output_path: &Path,
    results: Vec<ChunkResult>,
    _frames: &[FrameInfo],
) -> Result<(), String> {
    let file = std::fs::File::create(output_path).map_err(|e| format!("create file: {}", e))?;
    let mut w = std::io::BufWriter::new(file);

    let ftyp = make_ftyp();
    w.write_all(&ftyp).map_err(|e| e.to_string())?;

    let mdat_header_pos = ftyp.len() as u64;
    w.write_all(&0u32.to_be_bytes()).map_err(|e| e.to_string())?;
    w.write_all(b"mdat").map_err(|e| e.to_string())?;

    let mdat_payload_start = mdat_header_pos + 8;

    let mut all_sample_sizes = Vec::new();
    let mut all_keyframe_indices = Vec::new();
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    let mut bytes_written: u64 = 0;
    let mut max_w: u32 = 0;
    let mut max_h: u32 = 0;

    // Use SPS/PPS from first chunk that has them
    for result in &results {
        if !result.sps.is_empty() && !result.pps.is_empty() {
            sps = result.sps.clone();
            pps = result.pps.clone();
            break;
        }
    }

    for result in &results {
        w.write_all(&result.nals).map_err(|e| e.to_string())?;

        let base_sample_idx = all_sample_sizes.len();
        for &k in &result.keyframe_indices {
            all_keyframe_indices.push(base_sample_idx + k);
        }

        all_sample_sizes.extend_from_slice(&result.sample_sizes);
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

    w.seek(SeekFrom::Start(mdat_header_pos)).map_err(|e| e.to_string())?;
    w.write_all(&(mdat_size as u32).to_be_bytes()).map_err(|e| e.to_string())?;

    w.seek(SeekFrom::Start(mdat_payload_start + bytes_written)).map_err(|e| e.to_string())?;

    let moov = make_moov(
        enc_width,
        enc_height,
        all_sample_sizes.len() as u32,
        &all_sample_sizes,
        &all_keyframe_indices,
        &sps,
        &pps,
        mdat_payload_start,
    );

    w.write_all(&moov).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())?;

    Ok(())
}

fn normalize_rgb_frame(
    rgb: &[u8],
    src_w: usize,
    src_h: usize,
    dst_w: usize,
    dst_h: usize,
) -> std::borrow::Cow<'_, [u8]> {
    let expected_size = src_w * src_h * 3;
    let rgb_slice = &rgb[..expected_size];

    if dst_w == src_w && dst_h == src_h {
        return std::borrow::Cow::Borrowed(rgb_slice);
    }

    let mut cropped = vec![0u8; dst_w * dst_h * 3];
    for y in 0..dst_h {
        let src_row_start = y * src_w * 3;
        let src_row_end = src_row_start + dst_w * 3;
        let dst_row_start = y * dst_w * 3;
        cropped[dst_row_start..dst_row_start + dst_w * 3]
            .copy_from_slice(&rgb_slice[src_row_start..src_row_end]);
    }
    std::borrow::Cow::Owned(cropped)
}

fn split_annex_b(data: &[u8]) -> Vec<&[u8]> {
    let mut sc_positions: Vec<usize> = Vec::new();
    let mut sc_lengths: Vec<usize> = Vec::new();
    let mut i = 0;

    while i < data.len() {
        if i + 3 < data.len()
            && data[i] == 0
            && data[i + 1] == 0
            && data[i + 2] == 0
            && data[i + 3] == 1
        {
            sc_positions.push(i);
            sc_lengths.push(4);
            i += 4;
        } else if i + 2 < data.len()
            && data[i] == 0
            && data[i + 1] == 0
            && data[i + 2] == 1
        {
            sc_positions.push(i);
            sc_lengths.push(3);
            i += 3;
        } else {
            i += 1;
        }
    }

    let mut nals = Vec::new();
    for (j, &sc_pos) in sc_positions.iter().enumerate() {
        let nal_start = sc_pos + sc_lengths[j];
        let nal_end = if j + 1 < sc_positions.len() {
            sc_positions[j + 1]
        } else {
            data.len()
        };
        if nal_start < nal_end {
            nals.push(&data[nal_start..nal_end]);
        }
    }
    nals
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

fn make_moov(w: u32, h: u32, n: u32, sizes: &[u32], keys: &[usize], sps: &[u8], pps: &[u8], offset: u64) -> Vec<u8> {
    let dur = n as u64 * SAMPLE_DURATION as u64;

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

    let mut stts_p = Vec::new();
    stts_p.extend_from_slice(&1u32.to_be_bytes());
    stts_p.extend_from_slice(&n.to_be_bytes());
    stts_p.extend_from_slice(&SAMPLE_DURATION.to_be_bytes());
    let stts = fullbox(b"stts", 0, 0, &stts_p);

    let mut stsz_p = Vec::new();
    stsz_p.extend_from_slice(&0u32.to_be_bytes());
    stsz_p.extend_from_slice(&n.to_be_bytes());
    for &s in sizes {
        stsz_p.extend_from_slice(&s.to_be_bytes());
    }
    let stsz = fullbox(b"stsz", 0, 0, &stsz_p);

    let mut stsc_p = Vec::new();
    stsc_p.extend_from_slice(&1u32.to_be_bytes());
    stsc_p.extend_from_slice(&1u32.to_be_bytes());
    stsc_p.extend_from_slice(&n.to_be_bytes());
    stsc_p.extend_from_slice(&1u32.to_be_bytes());
    let stsc = fullbox(b"stsc", 0, 0, &stsc_p);

    let mut stco_p = Vec::new();
    stco_p.extend_from_slice(&1u32.to_be_bytes());
    stco_p.extend_from_slice(&(offset as u32).to_be_bytes());
    let stco = fullbox(b"stco", 0, 0, &stco_p);

    let mut stbl_p = Vec::new();
    stbl_p.extend_from_slice(&stsd);
    stbl_p.extend_from_slice(&stts);
    stbl_p.extend_from_slice(&stsz);
    stbl_p.extend_from_slice(&stsc);
    stbl_p.extend_from_slice(&stco);

    if keys.len() < n as usize {
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

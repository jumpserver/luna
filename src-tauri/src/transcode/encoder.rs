#[cfg(target_os = "linux")]
use openh264::encoder::Encoder as OpenH264Inner;
#[cfg(target_os = "linux")]
use openh264::formats::{RgbSliceU8, YUVBuffer};

pub struct EncodedOutput {
    pub data: Vec<u8>,
    pub is_keyframe: bool,
    pub sample_size: u32,
}

pub trait H264Encoder: Send {
    fn encode_frame(
        &mut self,
        rgb: &[u8],
        width: usize,
        height: usize,
    ) -> Result<EncodedOutput, String>;

    fn flush(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn sps(&self) -> &[u8];
    fn pps(&self) -> &[u8];
}

#[cfg(target_os = "linux")]
pub struct OpenH264Encoder {
    inner: OpenH264Inner,
    sps: Vec<u8>,
    pps: Vec<u8>,
    _bitrate: u32,
    _gop_size: u32,
}

#[cfg(target_os = "linux")]
impl OpenH264Encoder {
    pub fn new(bitrate: u32, gop_size: u32) -> Result<Self, String> {
        let inner =
            OpenH264Inner::new().map_err(|e| format!("create openh264 encoder failed: {}", e))?;
        Ok(Self {
            inner,
            sps: Vec::new(),
            pps: Vec::new(),
            _bitrate: bitrate,
            _gop_size: gop_size,
        })
    }
}

#[cfg(target_os = "linux")]
impl H264Encoder for OpenH264Encoder {
    fn encode_frame(
        &mut self,
        rgb: &[u8],
        width: usize,
        height: usize,
    ) -> Result<EncodedOutput, String> {
        let rgb_slice = RgbSliceU8::new(rgb, (width, height));
        let yuv = YUVBuffer::from_rgb_source(rgb_slice);

        let bs = self
            .inner
            .encode(&yuv)
            .map_err(|e| format!("encode frame failed: {}", e))?;
        let raw = bs.to_vec();

        if raw.is_empty() {
            return Ok(EncodedOutput {
                data: Vec::new(),
                is_keyframe: false,
                sample_size: 0,
            });
        }

        let nal_units = split_annex_b(&raw);
        let mut is_key = false;
        let mut data = Vec::new();
        let mut sample_size: u32 = 0;

        for nal in nal_units {
            if nal.is_empty() {
                continue;
            }

            match nal[0] & 0x1F {
                7 => {
                    self.sps = nal.to_vec();
                    continue;
                }
                8 => {
                    self.pps = nal.to_vec();
                    continue;
                }
                5 => {
                    is_key = true;
                }
                _ => {}
            }

            let len = nal.len() as u32;
            data.extend_from_slice(&len.to_be_bytes());
            data.extend_from_slice(nal);
            sample_size += 4 + len;
        }

        Ok(EncodedOutput {
            data,
            is_keyframe: is_key,
            sample_size,
        })
    }

    fn sps(&self) -> &[u8] {
        &self.sps
    }

    fn pps(&self) -> &[u8] {
        &self.pps
    }
}

#[cfg(target_os = "macos")]
pub mod vt {
    use super::{EncodedOutput, H264Encoder};
    use shiguredo_video_toolbox::{
        CodecConfig, EncodeOptions, Encoder, EncoderConfig, FnEncodeHandler, FrameData,
        H264EncoderConfig, H264EntropyMode, H264Profile, PixelFormat,
    };
    use std::sync::mpsc;

    pub struct VideoToolboxEncoder {
        inner: Encoder<FnEncodeHandler<u64>>,
        rx: mpsc::Receiver<EncodedFrameData>,
        i420_y: Vec<u8>,
        i420_u: Vec<u8>,
        i420_v: Vec<u8>,
        sps: Vec<u8>,
        pps: Vec<u8>,
        next_pts: u64,
    }

    struct EncodedFrameData {
        data: Vec<u8>,
        is_keyframe: bool,
        sps: Vec<u8>,
        pps: Vec<u8>,
    }

    impl VideoToolboxEncoder {
        pub fn new(width: u32, height: u32, bitrate: u32, gop_size: u32) -> Result<Self, String> {
            let (tx, rx) = mpsc::channel();

            let config = EncoderConfig {
                width,
                height,
                codec: CodecConfig::H264(H264EncoderConfig {
                    profile: H264Profile::Baseline,
                    entropy_mode: H264EntropyMode::Cavlc,
                }),
                pixel_format: PixelFormat::I420,
                average_bitrate: Some(bitrate as u64),
                fps_numerator: 10,
                fps_denominator: 1,
                prioritize_encoding_speed_over_quality: true,
                real_time: true,
                maximize_power_efficiency: true,
                allow_frame_reordering: false,
                allow_temporal_compression: true,
                max_key_frame_interval: std::num::NonZero::new(gop_size),
                max_key_frame_interval_duration: None,
                max_frame_delay_count: None,
            };

            let handler = FnEncodeHandler::new(move |result| {
                if let Ok(frame) = result {
                    let _ = tx.send(EncodedFrameData {
                        data: frame.data,
                        is_keyframe: frame.keyframe,
                        sps: frame.sps_list.into_iter().flatten().collect(),
                        pps: frame.pps_list.into_iter().flatten().collect(),
                    });
                }
            });

            let inner = Encoder::new(config, handler)
                .map_err(|e| format!("VideoToolbox init failed: {}", e))?;

            let frame_size = (width * height) as usize;
            let uv_size = ((width / 2) * (height / 2)) as usize;
            Ok(Self {
                inner,
                rx,
                i420_y: vec![0u8; frame_size],
                i420_u: vec![0u8; uv_size],
                i420_v: vec![0u8; uv_size],
                sps: Vec::new(),
                pps: Vec::new(),
                next_pts: 0,
            })
        }

        fn rgb_to_i420(&mut self, rgb: &[u8], width: usize, height: usize) {
            let total_pixels = width * height;
            let y_plane = &mut self.i420_y[..total_pixels];
            let rgb_slice = &rgb[..total_pixels * 3];

            for i in 0..total_pixels {
                let src = i * 3;
                let r = rgb_slice[src] as i32;
                let g = rgb_slice[src + 1] as i32;
                let b = rgb_slice[src + 2] as i32;
                y_plane[i] = ((66 * r + 129 * g + 25 * b + 128) >> 8) as u8 + 16;
            }

            let uv_w = width / 2;
            let uv_h = height / 2;
            let stride = width * 3;

            for cy in 0..uv_h {
                let row_base = cy * 2 * stride;
                let uv_row = cy * uv_w;
                for cx in 0..uv_w {
                    let sx = cx * 2;
                    let tl = row_base + sx * 3;
                    let tr = tl + 3;
                    let bl = tl + stride;
                    let br = bl + 3;

                    let r = (rgb_slice[tl] as i32
                        + rgb_slice[tr] as i32
                        + rgb_slice[bl] as i32
                        + rgb_slice[br] as i32)
                        >> 2;
                    let g = (rgb_slice[tl + 1] as i32
                        + rgb_slice[tr + 1] as i32
                        + rgb_slice[bl + 1] as i32
                        + rgb_slice[br + 1] as i32)
                        >> 2;
                    let b = (rgb_slice[tl + 2] as i32
                        + rgb_slice[tr + 2] as i32
                        + rgb_slice[bl + 2] as i32
                        + rgb_slice[br + 2] as i32)
                        >> 2;

                    let uv_idx = uv_row + cx;
                    self.i420_u[uv_idx] = (((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128) as u8;
                    self.i420_v[uv_idx] = (((112 * r - 94 * g - 18 * b + 128) >> 8) + 128) as u8;
                }
            }
        }
    }

    impl H264Encoder for VideoToolboxEncoder {
        fn encode_frame(
            &mut self,
            rgb: &[u8],
            width: usize,
            height: usize,
        ) -> Result<EncodedOutput, String> {
            self.rgb_to_i420(rgb, width, height);

            let frame_data = FrameData::I420 {
                y: &self.i420_y,
                u: &self.i420_u,
                v: &self.i420_v,
            };

            let opts = EncodeOptions::default();
            let pts = self.next_pts;
            self.next_pts += 1;

            self.inner
                .encode(&frame_data, &opts, pts)
                .map_err(|e| format!("VideoToolbox encode failed: {}", e))?;

            match self.rx.recv() {
                Ok(frame) => {
                    if !frame.sps.is_empty() {
                        self.sps = frame.sps;
                    }
                    if !frame.pps.is_empty() {
                        self.pps = frame.pps;
                    }
                    let sample_size = frame.data.len() as u32;
                    Ok(EncodedOutput {
                        data: frame.data,
                        is_keyframe: frame.is_keyframe,
                        sample_size,
                    })
                }
                Err(_) => Ok(EncodedOutput {
                    data: Vec::new(),
                    is_keyframe: false,
                    sample_size: 0,
                }),
            }
        }

        fn flush(&mut self) -> Result<(), String> {
            self.inner
                .finish()
                .map_err(|e| format!("VideoToolbox flush failed: {}", e))
        }

        fn sps(&self) -> &[u8] {
            &self.sps
        }

        fn pps(&self) -> &[u8] {
            &self.pps
        }
    }
}

#[cfg(windows)]
pub mod sink {
    use std::path::Path;
    use windows::core::{Interface, GUID, PCWSTR};
    use windows::Win32::Media::MediaFoundation::{
        IMF2DBuffer, IMFSample, MFCreate2DMediaBuffer, MFCreateSample, MFShutdown, MFStartup,
        MFVideoFormat_H264, MFSTARTUP_FULL, MF_MT_AVG_BITRATE, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE,
        MF_MT_INTERLACE_MODE, MF_MT_MAJOR_TYPE, MF_MT_MPEG2_PROFILE, MF_MT_SUBTYPE,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

    const MF_MT_VIDEO: GUID = GUID::from_u128(0x73646976_0000_0010_8000_00AA00389B71);
    const MF_VIDEO_FORMAT_RGB24: GUID = GUID::from_u128(0x00000018_0000_0010_8000_00AA00389B71);
    const MF_VIDEO_FORMAT_RGB32: GUID = GUID::from_u128(0x00000016_0000_0010_8000_00AA00389B71);
    const MF_VIDEO_INTERLACE_PROGRESSIVE: u32 = 2;

    pub struct SinkWriterEncoder {
        writer: windows::Win32::Media::MediaFoundation::IMFSinkWriter,
        stream_index: u32,
        frame_duration_100ns: i64,
        pts: i64,
        width: u32,
        height: u32,
    }

    impl SinkWriterEncoder {
        pub fn new(
            output_path: &Path,
            width: u32,
            height: u32,
            bitrate: u32,
            fps: u32,
        ) -> Result<Self, String> {
            unsafe {
                CoInitializeEx(None, COINIT_MULTITHREADED)
                    .ok()
                    .map_err(|e| format!("CoInitializeEx: {}", e))?;
                MFStartup(0x20070, MFSTARTUP_FULL).map_err(|e| format!("MFStartup: {}", e))?;

                let path_str: Vec<u16> = output_path
                    .to_string_lossy()
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();
                let url = PCWSTR(path_str.as_ptr());

                let writer = windows::Win32::Media::MediaFoundation::MFCreateSinkWriterFromURL(
                    url,
                    Option::<&windows::Win32::Media::MediaFoundation::IMFByteStream>::None,
                    None,
                )
                .map_err(|e| format!("MFCreateSinkWriterFromURL: {}", e))?;

                let output_type = windows::Win32::Media::MediaFoundation::MFCreateMediaType()
                    .map_err(|e| format!("MFCreateMediaType(output): {}", e))?;
                output_type
                    .SetGUID(&MF_MT_MAJOR_TYPE, &MF_MT_VIDEO)
                    .map_err(|e| format!("output MAJOR_TYPE: {}", e))?;
                output_type
                    .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)
                    .map_err(|e| format!("output SUBTYPE H264: {}", e))?;
                output_type
                    .SetUINT32(&MF_MT_AVG_BITRATE, bitrate)
                    .map_err(|e| format!("output AVG_BITRATE: {}", e))?;
                output_type
                    .SetUINT64(&MF_MT_FRAME_SIZE, ((width as u64) << 32) | (height as u64))
                    .map_err(|e| format!("output FRAME_SIZE: {}", e))?;
                output_type
                    .SetUINT64(&MF_MT_FRAME_RATE, ((fps as u64) << 32) | 1u64)
                    .map_err(|e| format!("output FRAME_RATE: {}", e))?;
                output_type
                    .SetUINT32(&MF_MT_INTERLACE_MODE, MF_VIDEO_INTERLACE_PROGRESSIVE)
                    .map_err(|e| format!("output INTERLACE_MODE: {}", e))?;

                const E_AVE_NC_H264_V_PROFILE_HIGH: u32 = 100;
                output_type
                    .SetUINT32(&MF_MT_MPEG2_PROFILE, E_AVE_NC_H264_V_PROFILE_HIGH)
                    .map_err(|e| format!("output MPEG2_PROFILE: {}", e))?;

                let stream_index = writer
                    .AddStream(&output_type)
                    .map_err(|e| format!("AddStream: {}", e))?;

                let input_type = windows::Win32::Media::MediaFoundation::MFCreateMediaType()
                    .map_err(|e| format!("MFCreateMediaType(input): {}", e))?;
                input_type
                    .SetGUID(&MF_MT_MAJOR_TYPE, &MF_MT_VIDEO)
                    .map_err(|e| format!("input MAJOR_TYPE: {}", e))?;
                input_type
                    .SetGUID(&MF_MT_SUBTYPE, &MF_VIDEO_FORMAT_RGB32)
                    .map_err(|e| format!("input SUBTYPE RGB32: {}", e))?;
                input_type
                    .SetUINT64(&MF_MT_FRAME_SIZE, ((width as u64) << 32) | (height as u64))
                    .map_err(|e| format!("input FRAME_SIZE: {}", e))?;
                input_type
                    .SetUINT64(&MF_MT_FRAME_RATE, ((fps as u64) << 32) | 1u64)
                    .map_err(|e| format!("input FRAME_RATE: {}", e))?;
                input_type
                    .SetUINT32(&MF_MT_INTERLACE_MODE, MF_VIDEO_INTERLACE_PROGRESSIVE)
                    .map_err(|e| format!("input INTERLACE_MODE: {}", e))?;

                writer
                    .SetInputMediaType(stream_index, &input_type, None)
                    .map_err(|e| format!("SetInputMediaType: {}", e))?;

                writer
                    .BeginWriting()
                    .map_err(|e| format!("BeginWriting: {}", e))?;

                log::info!(
                    "SinkWriter encoder initialized: {}x{}, bitrate={}, fps={}",
                    width,
                    height,
                    bitrate,
                    fps,
                );

                Ok(Self {
                    writer,
                    stream_index,
                    frame_duration_100ns: 10_000_000 / fps as i64,
                    pts: 0,
                    width,
                    height,
                })
            }
        }

        pub fn write_frame(
            &mut self,
            rgb: &[u8],
            width: usize,
            height: usize,
            repeat_count: u32,
        ) -> Result<(), String> {
            unsafe {
                let buffer: windows::Win32::Media::MediaFoundation::IMFMediaBuffer =
                    MFCreate2DMediaBuffer(self.width, self.height, 0x15, false)
                        .map_err(|e| format!("MFCreate2DMediaBuffer: {}", e))?;

                let buffer_2d: IMF2DBuffer = buffer
                    .cast()
                    .map_err(|e| format!("cast to IMF2DBuffer: {}", e))?;

                let mut scanline0: *mut u8 = std::ptr::null_mut();
                let mut pitch: i32 = 0;
                buffer_2d
                    .Lock2D(&mut scanline0, &mut pitch)
                    .map_err(|e| format!("Lock2D: {}", e))?;

                let pitch_bytes = pitch as usize;
                let total = pitch_bytes * self.height as usize;
                let dst = std::slice::from_raw_parts_mut(scanline0, total);

                dst.fill(0);

                let src_stride = width * 3;
                let rows = height.min(self.height as usize);
                for y in 0..rows {
                    let src_off = y * src_stride;
                    let dst_off = y * pitch_bytes;
                    let pixels = ((src_stride / 3)
                        .min(pitch_bytes / 4)
                        .min(self.width as usize))
                    .min((rgb.len() - src_off) / 3)
                    .min((dst.len() - dst_off) / 4);
                    for i in 0..pixels {
                        let s = src_off + i * 3;
                        let d = dst_off + i * 4;
                        dst[d] = rgb[s + 2];
                        dst[d + 1] = rgb[s + 1];
                        dst[d + 2] = rgb[s];
                        dst[d + 3] = 0;
                    }
                }

                buffer_2d
                    .Unlock2D()
                    .map_err(|e| format!("Unlock2D: {}", e))?;

                buffer
                    .SetCurrentLength(total as u32)
                    .map_err(|e| format!("SetCurrentLength: {}", e))?;

                let sample: IMFSample =
                    MFCreateSample().map_err(|e| format!("MFCreateSample: {}", e))?;
                sample
                    .AddBuffer(&buffer)
                    .map_err(|e| format!("AddBuffer: {}", e))?;
                sample
                    .SetSampleTime(self.pts)
                    .map_err(|e| format!("SetSampleTime: {}", e))?;
                let duration = self.frame_duration_100ns * repeat_count.max(1) as i64;
                sample
                    .SetSampleDuration(duration)
                    .map_err(|e| format!("SetSampleDuration: {}", e))?;

                self.writer
                    .WriteSample(self.stream_index, &sample)
                    .map_err(|e| format!("WriteSample: {}", e))?;

                self.pts += duration;
                Ok(())
            }
        }

        pub fn finalize(self) -> Result<(), String> {
            unsafe {
                self.writer
                    .Finalize()
                    .map_err(|e| format!("Finalize: {}", e))?;
            }
            Ok(())
        }
    }

    impl Drop for SinkWriterEncoder {
        fn drop(&mut self) {
            unsafe {
                let _ = MFShutdown();
                CoUninitialize();
            }
        }
    }

    unsafe impl Send for SinkWriterEncoder {}
}

#[cfg(target_os = "macos")]
pub fn create_encoder(
    width: u32,
    height: u32,
    bitrate: u32,
    gop_size: u32,
) -> Result<Box<dyn H264Encoder>, String> {
    let enc = vt::VideoToolboxEncoder::new(width, height, bitrate, gop_size)
        .map_err(|e| format!("VideoToolbox encoder init failed: {}", e))?;
    log::info!(
        "using VideoToolbox hardware encoder ({}x{} bitrate={}bps gop={})",
        width,
        height,
        bitrate,
        gop_size
    );
    Ok(Box::new(enc))
}

#[cfg(target_os = "linux")]
pub fn create_encoder(
    _width: u32,
    _height: u32,
    bitrate: u32,
    gop_size: u32,
) -> Result<Box<dyn H264Encoder>, String> {
    log::info!(
        "using OpenH264 software encoder (bitrate={}bps gop={})",
        bitrate,
        gop_size
    );
    Ok(Box::new(
        OpenH264Encoder::new(bitrate, gop_size)
            .map_err(|e| format!("OpenH264 init failed: {}", e))?,
    ))
}

#[cfg(windows)]
pub fn create_encoder(
    _width: u32,
    _height: u32,
    _bitrate: u32,
    _gop_size: u32,
) -> Result<Box<dyn H264Encoder>, String> {
    Err("not used on Windows — SinkWriter handles encoding".to_string())
}

#[cfg(target_os = "linux")]
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
        } else if i + 2 < data.len() && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
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

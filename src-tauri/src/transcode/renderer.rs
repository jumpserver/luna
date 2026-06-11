/// Frame renderer that composites Guacamole drawing instructions onto a pixel canvas.
///
/// Supports the subset of Guacamole protocol needed for replay:
/// - `size`: set layer dimensions
/// - `img` + `blob` + `end`: draw PNG images onto layers
/// - `rect`, `cfill`: fill rectangles with solid color
/// - `cursor`: update cursor position (visual only)
use base64::Engine;
use image::{DynamicImage, GenericImageView, ImageReader, Rgba, RgbaImage};
use std::collections::BTreeMap;
use std::io::Cursor;

const DEFAULT_LAYER: i32 = 0;

struct PendingImageStream {
    layer_id: i32,
    x: u32,
    y: u32,
    mime: String,
    data: Vec<u8>,
}

struct Layer {
    width: u32,
    height: u32,
    pixels: RgbaImage,
}

impl Layer {
    fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            pixels: RgbaImage::new(width, height),
        }
    }

    fn resize(&mut self, width: u32, height: u32) {
        self.width = width;
        self.height = height;
        self.pixels = RgbaImage::new(width, height);
    }
}

pub struct Renderer {
    layers: BTreeMap<i32, Layer>,
    width: u32,
    height: u32,
    pending_streams: BTreeMap<i32, PendingImageStream>,
}

impl Renderer {
    pub fn new(width: u32, height: u32) -> Self {
        let mut layers = BTreeMap::new();
        layers.insert(DEFAULT_LAYER, Layer::new(width, height));

        Self {
            layers,
            width,
            height,
            pending_streams: BTreeMap::new(),
        }
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    /// Resize the main display (layer 0).
    pub fn resize_display(&mut self, width: u32, height: u32) {
        if self.width == width && self.height == height {
            return;
        }
        self.width = width;
        self.height = height;

        if let Some(layer) = self.layers.get_mut(&DEFAULT_LAYER) {
            layer.resize(width, height);
        } else {
            self.layers.insert(DEFAULT_LAYER, Layer::new(width, height));
        }
    }

    fn ensure_layer(&mut self, layer_id: i32) -> &mut Layer {
        self.layers.entry(layer_id).or_insert_with(|| {
            if layer_id < 0 {
                Layer::new(0, 0)
            } else {
                Layer::new(self.width, self.height)
            }
        })
    }

    fn ensure_layer_fits(layer: &mut Layer, width: u32, height: u32) {
        if width <= layer.width && height <= layer.height {
            return;
        }

        let next_width = width.max(layer.width);
        let next_height = height.max(layer.height);
        let mut next_pixels = RgbaImage::new(next_width, next_height);

        for y in 0..layer.height {
            for x in 0..layer.width {
                let pixel = *layer.pixels.get_pixel(x, y);
                next_pixels.put_pixel(x, y, pixel);
            }
        }

        layer.width = next_width;
        layer.height = next_height;
        layer.pixels = next_pixels;
    }

    /// Process a `size` instruction: `size,layer_id,width,height`
    pub fn handle_size(&mut self, args: &[&str]) {
        if args.len() < 3 {
            return;
        }
        let layer_id: i32 = args[0].parse().unwrap_or(DEFAULT_LAYER);
        let w: u32 = args[1].parse().unwrap_or(0);
        let h: u32 = args[2].parse().unwrap_or(0);

        if w == 0 || h == 0 {
            return;
        }

        if layer_id == DEFAULT_LAYER {
            self.resize_display(w, h);
        } else {
            match self.layers.get_mut(&layer_id) {
                Some(layer) => layer.resize(w, h),
                None => {
                    self.layers.insert(layer_id, Layer::new(w, h));
                }
            }
        }
    }

    /// Process an `img` instruction: `img,stream,mask,layer,mime,x,y`
    pub fn handle_img(&mut self, args: &[&str]) {
        if args.len() < 6 {
            return;
        }
        let stream_id: i32 = args[0].parse().unwrap_or(-1);
        let layer_id: i32 = args[2].parse().unwrap_or(DEFAULT_LAYER);
        let x: u32 = args[4].parse().unwrap_or(0);
        let y: u32 = args[5].parse().unwrap_or(0);
        let mime = args[3].to_string();

        self.pending_streams.insert(
            stream_id,
            PendingImageStream {
                layer_id,
                x,
                y,
                mime,
                data: Vec::new(),
            },
        );
    }

    /// Process a `blob` instruction: `blob,stream,data`
    pub fn handle_blob(&mut self, args: &[&str]) {
        if args.len() < 2 {
            return;
        }

        let stream_id: i32 = args[0].parse().unwrap_or(-1);
        let Some(stream) = self.pending_streams.get_mut(&stream_id) else {
            return;
        };

        let bytes = match base64::engine::general_purpose::STANDARD.decode(args[1]) {
            Ok(b) => b,
            Err(_) => {
                match base64::engine::general_purpose::URL_SAFE.decode(args[1]) {
                    Ok(b) => b,
                    Err(_) => return,
                }
            }
        };

        stream.data.extend_from_slice(&bytes);
    }

    pub fn handle_end(&mut self, args: &[&str]) {
        let Some(stream_id) = args.first().and_then(|value| value.parse::<i32>().ok()) else {
            return;
        };

        let Some(stream) = self.pending_streams.remove(&stream_id) else {
            return;
        };

        let img = match decode_image(&stream.mime, &stream.data) {
            Some(img) => img,
            None => return,
        };

        let (img_w, img_h) = img.dimensions();
        let x0 = stream.x;
        let y0 = stream.y;
        let layer_id = stream.layer_id;

        let layer = self.ensure_layer(layer_id);
        Self::ensure_layer_fits(layer, x0 + img_w, y0 + img_h);

        blit_image(layer, &img, x0, y0);
    }

    /// Process a `rect` instruction — defines a clipping region, ignored for simplicity.
    pub fn handle_rect(&mut self, args: &[&str]) {
        if args.len() < 6 {
            return;
        }
    }

    /// Process a `cfill` instruction: `cfill,mask,layer,r,g,b,a`
    pub fn handle_cfill(&mut self, args: &[&str]) {
        if args.len() < 6 {
            return;
        }
        let layer_id: i32 = args[1].parse().unwrap_or(DEFAULT_LAYER);
        let r: u8 = args[2].parse().unwrap_or(0);
        let g: u8 = args[3].parse().unwrap_or(0);
        let b: u8 = args[4].parse().unwrap_or(0);
        let a: u8 = args[5].parse().unwrap_or(255);

        let layer = self.ensure_layer(layer_id);
        let color = Rgba([r, g, b, a]);
        for pixel in layer.pixels.pixels_mut() {
            *pixel = color;
        }
    }

    /// Process a `copy` instruction:
    /// `copy,srcLayer,srcX,srcY,width,height,mask,dstLayer,dstX,dstY`
    pub fn handle_copy(&mut self, args: &[&str]) {
        if args.len() < 9 {
            return;
        }

        let src_layer_id: i32 = args[0].parse().unwrap_or(DEFAULT_LAYER);
        let src_x: u32 = args[1].parse().unwrap_or(0);
        let src_y: u32 = args[2].parse().unwrap_or(0);
        let width: u32 = args[3].parse().unwrap_or(0);
        let height: u32 = args[4].parse().unwrap_or(0);
        let dst_layer_id: i32 = args[6].parse().unwrap_or(DEFAULT_LAYER);
        let dst_x: u32 = args[7].parse().unwrap_or(0);
        let dst_y: u32 = args[8].parse().unwrap_or(0);

        if width == 0 || height == 0 {
            return;
        }

        let Some(src_layer) = self.layers.get(&src_layer_id) else {
            return;
        };

        let mut copied = Vec::with_capacity((width * height) as usize);
        for dy in 0..height {
            for dx in 0..width {
                let sx = src_x + dx;
                let sy = src_y + dy;
                let pixel = if sx < src_layer.width && sy < src_layer.height {
                    *src_layer.pixels.get_pixel(sx, sy)
                } else {
                    Rgba([0, 0, 0, 0])
                };
                copied.push(pixel);
            }
        }

        let dst_layer = self.ensure_layer(dst_layer_id);
        Self::ensure_layer_fits(dst_layer, dst_x + width, dst_y + height);

        let mut idx = 0usize;
        for dy in 0..height {
            for dx in 0..width {
                let pixel = copied[idx];
                idx += 1;
                let px = dst_x + dx;
                let py = dst_y + dy;
                if px < dst_layer.width && py < dst_layer.height {
                    dst_layer.pixels.put_pixel(px, py, pixel);
                }
            }
        }
    }

    /// Composite all visible layers into a pre-allocated RGB buffer.
    /// The buffer must be at least `target_width * target_height * 3` bytes.
    pub fn composite_into(&self, frame: &mut [u8], target_width: u32, target_height: u32) {
        let frame_len = (target_width * target_height * 3) as usize;
        if frame.len() < frame_len {
            return;
        }

        // Fill with white background
        for byte in frame[..frame_len].iter_mut() {
            *byte = 255;
        }

        for (layer_id, layer) in &self.layers {
            if *layer_id < 0 || layer.width == 0 || layer.height == 0 {
                continue;
            }

            let copy_w = layer.width.min(target_width);
            let copy_h = layer.height.min(target_height);

            for y in 0..copy_h {
                for x in 0..copy_w {
                    let pixel = layer.pixels.get_pixel(x, y);
                    let a = pixel.0[3];
                    if a == 0 {
                        continue;
                    }

                    let dst_idx = ((y * target_width + x) * 3) as usize;
                    if a == 255 {
                        frame[dst_idx] = pixel.0[0];
                        frame[dst_idx + 1] = pixel.0[1];
                        frame[dst_idx + 2] = pixel.0[2];
                    } else {
                        // Integer alpha blending: faster than floating-point
                        let a_u32 = a as u32;
                        let inv_a = 255 - a_u32;
                        frame[dst_idx] = ((pixel.0[0] as u32 * a_u32 + frame[dst_idx] as u32 * inv_a) / 255) as u8;
                        frame[dst_idx + 1] = ((pixel.0[1] as u32 * a_u32 + frame[dst_idx + 1] as u32 * inv_a) / 255) as u8;
                        frame[dst_idx + 2] = ((pixel.0[2] as u32 * a_u32 + frame[dst_idx + 2] as u32 * inv_a) / 255) as u8;
                    }
                }
            }
        }
    }
}

/// Bulk blit a decoded image onto a layer.
fn blit_image(layer: &mut Layer, img: &DynamicImage, x0: u32, y0: u32) {
    let (img_w, img_h) = img.dimensions();

    for dy in 0..img_h {
        let py = y0 + dy;
        if py >= layer.height {
            break;
        }
        for dx in 0..img_w {
            let px = x0 + dx;
            if px >= layer.width {
                break;
            }
            let pixel = img.get_pixel(dx, dy);
            let a = pixel.0[3];
            if a == 0 {
                continue;
            }
            if a == 255 {
                layer.pixels.put_pixel(px, py, pixel);
            } else {
                let existing = *layer.pixels.get_pixel(px, py);
                let af = a as f32 / 255.0;
                let inv = 1.0 - af;
                layer.pixels.put_pixel(
                    px,
                    py,
                    Rgba([
                        (pixel.0[0] as f32 * af + existing.0[0] as f32 * inv) as u8,
                        (pixel.0[1] as f32 * af + existing.0[1] as f32 * inv) as u8,
                        (pixel.0[2] as f32 * af + existing.0[2] as f32 * inv) as u8,
                        255,
                    ]),
                );
            }
        }
    }
}

fn decode_image(mime: &str, data: &[u8]) -> Option<DynamicImage> {
    let format = if mime.contains("png") {
        image::ImageFormat::Png
    } else if mime.contains("jpeg") || mime.contains("jpg") {
        image::ImageFormat::Jpeg
    } else if mime.contains("webp") {
        image::ImageFormat::WebP
    } else {
        image::guess_format(data).ok()?
    };

    let reader = ImageReader::with_format(Cursor::new(data), format);
    reader.decode().ok()
}

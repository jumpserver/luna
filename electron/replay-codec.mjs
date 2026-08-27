const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
const FRAME_INTERVAL_MS = 100;

export class GuacamoleParser {
  constructor(data) {
    this.data = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.position = 0;
  }

  skipWhitespace() {
    while (this.position < this.data.length && [10, 13].includes(this.data[this.position])) this.position += 1;
  }

  parseElement() {
    this.skipWhitespace();
    const lengthStart = this.position;
    while (this.position < this.data.length && this.data[this.position] >= 48 && this.data[this.position] <= 57) {
      this.position += 1;
    }
    if (this.position === lengthStart || this.data[this.position] !== 46) return null;
    const length = Number(this.data.subarray(lengthStart, this.position).toString("ascii"));
    this.position += 1;
    if (!Number.isSafeInteger(length) || length < 0 || this.position + length > this.data.length) return null;
    const value = this.data.subarray(this.position, this.position + length).toString("utf8");
    this.position += length;
    return value;
  }

  nextInstruction() {
    this.skipWhitespace();
    if (this.position >= this.data.length) return null;
    const opcode = this.parseElement();
    if (opcode === null) return null;
    const args = [];
    while (this.position < this.data.length) {
      if (this.data[this.position] === 59) {
        this.position += 1;
        break;
      }
      if (this.data[this.position] !== 44) return null;
      this.position += 1;
      const argument = this.parseElement();
      if (argument === null) return null;
      args.push(argument);
    }
    return { opcode, args };
  }
}

function createLayer(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function resizeLayer(layer, width, height, preserve = false) {
  const pixels = Buffer.alloc(width * height * 4);
  if (preserve) {
    const copyWidth = Math.min(width, layer.width);
    const copyHeight = Math.min(height, layer.height);
    for (let y = 0; y < copyHeight; y += 1) {
      layer.pixels.copy(pixels, y * width * 4, y * layer.width * 4, (y * layer.width + copyWidth) * 4);
    }
  }
  layer.width = width;
  layer.height = height;
  layer.pixels = pixels;
}

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class ReplayRenderer {
  constructor(decodeImage, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
    this.decodeImage = decodeImage;
    this.width = width;
    this.height = height;
    this.layers = new Map([[0, createLayer(width, height)]]);
    this.pendingStreams = new Map();
  }

  ensureLayer(id) {
    if (!this.layers.has(id)) this.layers.set(id, createLayer(id < 0 ? 0 : this.width, id < 0 ? 0 : this.height));
    return this.layers.get(id);
  }

  handle({ opcode, args }) {
    if (opcode === "size") this.handleSize(args);
    else if (opcode === "img") this.handleImage(args);
    else if (opcode === "blob") this.handleBlob(args);
    else if (opcode === "end") this.handleEnd(args);
    else if (opcode === "copy") this.handleCopy(args);
    else if (opcode === "cfill") this.handleFill(args);
  }

  handleSize(args) {
    if (args.length < 3) return;
    const id = integer(args[0]);
    const width = integer(args[1]);
    const height = integer(args[2]);
    if (width < 1 || height < 1) return;
    if (id === 0) {
      this.width = width;
      this.height = height;
    }
    const layer = this.ensureLayer(id);
    resizeLayer(layer, width, height);
  }

  handleImage(args) {
    if (args.length < 6) return;
    this.pendingStreams.set(integer(args[0], -1), {
      layerId: integer(args[2]),
      mime: args[3],
      x: Math.max(0, integer(args[4])),
      y: Math.max(0, integer(args[5])),
      chunks: []
    });
  }

  handleBlob(args) {
    if (args.length < 2) return;
    const stream = this.pendingStreams.get(integer(args[0], -1));
    if (!stream) return;
    try {
      stream.chunks.push(Buffer.from(args[1], "base64"));
    } catch {}
  }

  handleEnd(args) {
    const id = integer(args[0], -1);
    const stream = this.pendingStreams.get(id);
    this.pendingStreams.delete(id);
    if (!stream) return;
    const image = this.decodeImage(stream.mime, Buffer.concat(stream.chunks));
    if (!image || image.width < 1 || image.height < 1 || image.pixels.length < image.width * image.height * 4) return;
    const layer = this.ensureLayer(stream.layerId);
    const requiredWidth = stream.x + image.width;
    const requiredHeight = stream.y + image.height;
    if (requiredWidth > layer.width || requiredHeight > layer.height) {
      resizeLayer(layer, Math.max(requiredWidth, layer.width), Math.max(requiredHeight, layer.height), true);
    }
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const source = (y * image.width + x) * 4;
        const target = ((stream.y + y) * layer.width + stream.x + x) * 4;
        const alpha = image.pixels[source + 3];
        if (alpha === 0) continue;
        if (alpha === 255) {
          image.pixels.copy(layer.pixels, target, source, source + 4);
          continue;
        }
        const inverse = 255 - alpha;
        for (let channel = 0; channel < 3; channel += 1) {
          layer.pixels[target + channel] = Math.floor(
            (image.pixels[source + channel] * alpha + layer.pixels[target + channel] * inverse) / 255
          );
        }
        layer.pixels[target + 3] = 255;
      }
    }
  }

  handleCopy(args) {
    if (args.length < 9) return;
    const sourceLayer = this.layers.get(integer(args[0]));
    if (!sourceLayer) return;
    const sourceX = Math.max(0, integer(args[1]));
    const sourceY = Math.max(0, integer(args[2]));
    const width = Math.max(0, integer(args[3]));
    const height = Math.max(0, integer(args[4]));
    const destinationLayer = this.ensureLayer(integer(args[6]));
    const destinationX = Math.max(0, integer(args[7]));
    const destinationY = Math.max(0, integer(args[8]));
    if (!width || !height) return;
    const copied = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (sourceX + x >= sourceLayer.width || sourceY + y >= sourceLayer.height) continue;
        const source = ((sourceY + y) * sourceLayer.width + sourceX + x) * 4;
        sourceLayer.pixels.copy(copied, (y * width + x) * 4, source, source + 4);
      }
    }
    if (destinationX + width > destinationLayer.width || destinationY + height > destinationLayer.height) {
      resizeLayer(
        destinationLayer,
        Math.max(destinationLayer.width, destinationX + width),
        Math.max(destinationLayer.height, destinationY + height),
        true
      );
    }
    for (let y = 0; y < height; y += 1) {
      const source = y * width * 4;
      const target = ((destinationY + y) * destinationLayer.width + destinationX) * 4;
      copied.copy(destinationLayer.pixels, target, source, source + width * 4);
    }
  }

  handleFill(args) {
    if (args.length < 6) return;
    const layer = this.ensureLayer(integer(args[1]));
    const color = [integer(args[2]), integer(args[3]), integer(args[4]), integer(args[5], 255)].map((value) =>
      Math.max(0, Math.min(255, value))
    );
    for (let offset = 0; offset < layer.pixels.length; offset += 4) {
      layer.pixels[offset] = color[0];
      layer.pixels[offset + 1] = color[1];
      layer.pixels[offset + 2] = color[2];
      layer.pixels[offset + 3] = color[3];
    }
  }

  composite() {
    const pixels = Buffer.alloc(this.width * this.height * 4, 255);
    const visibleLayers = [...this.layers.entries()].filter(([id]) => id >= 0).sort(([left], [right]) => left - right);
    for (const [, layer] of visibleLayers) {
      const width = Math.min(this.width, layer.width);
      const height = Math.min(this.height, layer.height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const source = (y * layer.width + x) * 4;
          const target = (y * this.width + x) * 4;
          const alpha = layer.pixels[source + 3];
          if (!alpha) continue;
          const inverse = 255 - alpha;
          for (let channel = 0; channel < 3; channel += 1) {
            pixels[target + channel] = Math.floor(
              (layer.pixels[source + channel] * alpha + pixels[target + channel] * inverse) / 255
            );
          }
          pixels[target + 3] = 255;
        }
      }
    }
    return { width: this.width, height: this.height, pixels };
  }
}

export function buildTimeline(data) {
  const parser = new GuacamoleParser(data);
  const frames = [];
  let maxWidth = DEFAULT_WIDTH;
  let maxHeight = DEFAULT_HEIGHT;
  let nextFrame = 0;
  let initialized = false;
  let instruction = parser.nextInstruction();
  while (instruction !== null) {
    if (instruction.opcode === "size" && integer(instruction.args[0], -1) === 0) {
      maxWidth = Math.max(maxWidth, integer(instruction.args[1]));
      maxHeight = Math.max(maxHeight, integer(instruction.args[2]));
    } else if (instruction.opcode === "sync") {
      const timestamp = integer(instruction.args[0], -1);
      if (timestamp >= 0) {
        if (!initialized) {
          nextFrame = timestamp + FRAME_INTERVAL_MS;
          initialized = true;
        }
        while (nextFrame <= timestamp) {
          frames.push(nextFrame);
          nextFrame += FRAME_INTERVAL_MS;
        }
      }
    }
    instruction = parser.nextInstruction();
  }
  return { frames, maxWidth, maxHeight };
}

export function computeTargetDimensions(width, height, resolution = "original") {
  const heights = { p1080: 1080, p720: 720, p360: 360 };
  const targetHeight = heights[resolution];
  let targetWidth = width;
  let nextHeight = height;
  if (targetHeight && height > targetHeight) {
    targetWidth = Math.max(16, Math.round(width * (targetHeight / height)));
    nextHeight = targetHeight;
  }
  return {
    width: Math.max(16, targetWidth & ~15),
    height: Math.max(16, nextHeight & ~15)
  };
}

export function encodeInstruction(opcode, ...args) {
  return `${[opcode, ...args].map((value) => `${Buffer.byteLength(String(value))}.${value}`).join(",")};`;
}

export const replayCodecInternals = { DEFAULT_WIDTH, DEFAULT_HEIGHT, FRAME_INTERVAL_MS };

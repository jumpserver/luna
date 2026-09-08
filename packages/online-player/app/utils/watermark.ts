interface WatermarkFields {
  userId?: string;
  name?: string;
  userName?: string;
  assetId?: string;
  assetName?: string;
  assetAddress?: string;
  currentTime?: string;
}

export function interpolateWatermark(template: string, fields: WatermarkFields) {
  if (!template) return "";

  return template.replace(/\$\{([^}]+)\}/g, (_, rawKey: string) => {
    const key = rawKey.trim() as keyof WatermarkFields;
    const value = fields[key];
    return value == null || value === "" ? "N/A" : String(value);
  });
}

const MAX_WATERMARK_ALPHA = 0.1;

function clampAlpha(alpha: number, maxAlpha = MAX_WATERMARK_ALPHA) {
  if (!Number.isFinite(alpha) || alpha < 0) return maxAlpha;
  return Math.min(alpha, maxAlpha);
}

function hexByte(part: string) {
  return Number.parseInt(part.length === 1 ? `${part}${part}` : part, 16);
}

export function softenWatermarkColor(color: string, maxAlpha = MAX_WATERMARK_ALPHA) {
  const value = color.trim();
  if (!value) return `rgba(255, 255, 255, ${maxAlpha})`;

  const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgba) {
    const alpha = rgba[4] == null || rgba[4] === "" ? 1 : Number(rgba[4]);
    return `rgba(${Number(rgba[1])}, ${Number(rgba[2])}, ${Number(rgba[3])}, ${clampAlpha(alpha, maxAlpha)})`;
  }

  const hex = value.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex && (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8)) {
    const parts =
      hex.length <= 4
        ? [hex[0] || "0", hex[1] || "0", hex[2] || "0", hex[3]]
        : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6), hex.length === 8 ? hex.slice(6, 8) : undefined];
    const r = hexByte(parts[0] || "0");
    const g = hexByte(parts[1] || "0");
    const b = hexByte(parts[2] || "0");
    const alpha = parts[3] ? hexByte(parts[3]) / 255 : 1;
    return `rgba(${r}, ${g}, ${b}, ${clampAlpha(alpha, maxAlpha)})`;
  }

  return value;
}

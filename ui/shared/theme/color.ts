// 纯函数、零依赖：可被 node 直接运行自检（见 color.check.mts）

export function parseColorToRgb(color: string): [number, number, number] | null {
  const value = color.trim();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16)
    ];
  }

  const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i);
  if (rgb) {
    const channels = [Math.round(Number(rgb[1])), Math.round(Number(rgb[2])), Math.round(Number(rgb[3]))];
    if (channels.some((c) => c > 255)) return null;
    return channels as [number, number, number];
  }

  // color-mix() 的计算值序列化为 color(srgb r g b [/ a])，通道是 0-1 浮点或百分比
  const srgb = value.match(/^color\(srgb\s+([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)/i);
  if (srgb) {
    const toByte = (channel: string) => {
      const ratio = channel.endsWith("%") ? Number(channel.slice(0, -1)) / 100 : Number(channel);
      return Math.round(Math.min(Math.max(ratio, 0), 1) * 255);
    };
    return [toByte(srgb[1]!), toByte(srgb[2]!), toByte(srgb[3]!)];
  }

  return null;
}

/** 将浏览器计算后的颜色规范化为 rgb/rgba，同时保留透明度。 */
export function normalizeResolvedCssColor(color: string): string | null {
  const rgb = parseColorToRgb(color);
  if (!rgb) return null;

  const value = color.trim();
  const rgbaAlpha = value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/i)?.[1];
  const srgbAlpha = value.startsWith("color(srgb ")
    ? value.match(/\/\s*([\d.]+%?)\s*\)$/)?.[1]
    : undefined;
  const alphaValue = rgbaAlpha || srgbAlpha;

  if (!alphaValue) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

  const alpha = alphaValue.endsWith("%") ? Number(alphaValue.slice(0, -1)) / 100 : Number(alphaValue);
  if (!Number.isFinite(alpha)) return null;

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(Math.max(alpha, 0), 1)})`;
}

/** 相对亮度 < 0.5 视为暗色背景（ponytail: 简单线性亮度，够用于二分明暗） */
export function isDarkColor(color: string): boolean {
  const rgb = parseColorToRgb(color);
  if (!rgb) return true;
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

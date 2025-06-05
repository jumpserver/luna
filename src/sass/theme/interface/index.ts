export namespace Theme {
  export type ThemeType = "default" | "darkBlue";
}

// 默认主题颜色
const defaultThemeColor = "#000000";

// 颜色处理函数：增加亮度
export function lighten(
  amount: number,
  color: string = defaultThemeColor
): string {
  const hsl = hexToHSL(color);
  return hslToHex(hsl.h, hsl.s, Math.min(100, hsl.l + amount));
}

// 颜色处理函数：降低亮度
export function darken(
  amount: number,
  color: string = defaultThemeColor
): string {
  const hsl = hexToHSL(color);
  return hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - amount));
}

// 颜色处理函数：增加饱和度
export function saturate(
  amount: number,
  color: string = defaultThemeColor
): string {
  const hsl = hexToHSL(color);
  return hslToHex(hsl.h, Math.min(100, hsl.s + amount), hsl.l);
}

// 颜色处理函数：降低饱和度
export function desaturate(
  amount: number,
  color: string = defaultThemeColor
): string {
  const hsl = hexToHSL(color);
  return hslToHex(hsl.h, Math.max(0, hsl.s - amount), hsl.l);
}

// 颜色处理函数：调整透明度
export function alpha(
  alphaValue: number,
  color: string = defaultThemeColor
): string {
  // 确保透明度值在0-1之间
  const alpha = Math.max(0, Math.min(1, alphaValue));

  // 移除#号并处理缩写形式
  let hex = color.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  // 解析RGB值
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // 返回rgba格式
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 辅助函数：将十六进制颜色转换为HSL
interface HSL {
  h: number;
  s: number;
  l: number;
}

export function hexToHSL(hex: string): HSL {
  // 移除#号并处理缩写形式
  let hexValue = hex.replace(/^#/, "");
  if (hexValue.length === 3) {
    hexValue = hexValue
      .split("")
      .map((char) => char + char)
      .join("");
  }

  // 解析RGB值
  const r = parseInt(hexValue.substring(0, 2), 16) / 255;
  const g = parseInt(hexValue.substring(2, 4), 16) / 255;
  const b = parseInt(hexValue.substring(4, 6), 16) / 255;

  // 计算HSL值
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  // 转换为标准HSL格式
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// 辅助函数：将HSL转换为十六进制颜色
export function hslToHex(h: number, s: number, l: number): string {
  // 将HSL值转换为0-1范围
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    // 如果饱和度为0，则为灰色
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  // 转换为十六进制
  const toHex = (x: number): string => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

import { ref } from "vue";

interface HSL {
  h: number;
  s: number;
  l: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

const mainThemeColorMap = new Map(
  Object.entries({
    darkGary: "#303237"
  })
);

const currentMainColoc = ref("#303237");

export const useColor = () => {
  const setCurrentMainColor = (color: string) => {
    const themeColor = mainThemeColorMap.get(color);

    if (themeColor) {
      currentMainColoc.value = themeColor;
    } else {
      currentMainColoc.value = "#303237";
    }
  };

  /**
   * 规范化 3/6/8 位十六进制为 #RRGGBB（忽略 alpha）
   */
  const normalizeHex = (hex: string): string | null => {
    if (!hex) return null;
    let v = hex.trim().replace(/^#/, "");
    if (!v) return null;
    if (v.length === 3) {
      v = v
        .split("")
        .map((c) => c + c)
        .join("");
    } else if (v.length === 8) {
      v = v.substring(0, 6); // 丢弃 alpha
    } else if (v.length !== 6) {
      return null;
    }
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
    return `#${v.toLowerCase()}`;
  };

  /**
   * 将 #RGB/#RRGGBB 转为 RGB 数值
   */
  const hexToRgb = (hex: string): RGB => {
    const n = normalizeHex(hex);
    const safe = n || "#000000";
    const v = safe.replace(/^#/, "");
    const r = Number.parseInt(v.substring(0, 2), 16);
    const g = Number.parseInt(v.substring(2, 4), 16);
    const b = Number.parseInt(v.substring(4, 6), 16);
    return { r, g, b };
  };

  /**
   * 将 RGB 数值转换为 #RRGGBB
   */
  const rgbToHex = (r: number, g: number, b: number): string => {
    const to2 = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  };

  /**
   * 解析 rgb()/rgba()/hex，返回 #RRGGBB（忽略 alpha）。无法解析时返回当前主题主色。
   */
  const toHex = (input: string, fallback?: string): string => {
    // 先尝试十六进制
    const n = normalizeHex(input);
    if (n) return n;

    // 再尝试 rgb/rgba
    const m = (input || "").trim().match(/rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (m) {
      const r = Math.min(255, Number.parseInt(m[1], 10));
      const g = Math.min(255, Number.parseInt(m[2], 10));
      const b = Math.min(255, Number.parseInt(m[3], 10));
      return rgbToHex(r, g, b);
    }

    // 兜底：使用传入 fallback 或当前主色或默认值
    return normalizeHex(fallback || currentMainColoc.value || "#303237") || "#303237";
  };

  /**
   * 将十六进制颜色转换为HSL颜色
   * @param hex 十六进制颜色
   * @returns HSL颜色
   */
  const hexToHSL = (hex: string): HSL => {
    let hexValue = hex.replace(/^#/, "");

    if (hexValue.length === 3) {
      hexValue = hexValue
        .split("")
        .map((char) => char + char)
        .join("");
    }

    // 解析RGB值
    const r = Number.parseInt(hexValue.substring(0, 2), 16) / 255;
    const g = Number.parseInt(hexValue.substring(2, 4), 16) / 255;
    const b = Number.parseInt(hexValue.substring(4, 6), 16) / 255;

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
      l: Math.round(l * 100)
    };
  };

  /**
   * 将HSL颜色转换为十六进制颜色
   * @param h 色相
   * @param s 饱和度
   * @param l 亮度
   * @returns 十六进制颜色
   */
  const hslToHex = (h: number, s: number, l: number) => {
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
      return hex.length === 1 ? `0${hex}` : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  /**
   * 将颜色转换为rgba格式
   * @param alphaValue 透明度值
   * @param color 颜色
   * @returns rgba格式颜色
   */
  const alpha = (alphaValue: number, color?: string) => {
    // 如果没有提供颜色，使用当前主题颜色
    const actualColor = color || currentMainColoc.value;
    // 确保透明度值在0-1之间
    const alpha = Math.max(0, Math.min(1, alphaValue));

    // 移除#号并处理缩写形式
    let hex = (normalizeHex(actualColor) || currentMainColoc.value).replace(/^#/, "");

    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }

    // 解析RGB值
    const r = Number.parseInt(hex.substring(0, 2), 16);
    const g = Number.parseInt(hex.substring(2, 4), 16);
    const b = Number.parseInt(hex.substring(4, 6), 16);

    // 返回rgba格式
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  /**
   * 将颜色变亮
   * @param amount
   * @param color
   * @param alphaValue
   * @returns
   */
  const lighten = (amount: number, color?: string, alphaValue?: number) => {
    const actualColor = color || currentMainColoc.value;
    const hsl = hexToHSL(actualColor);
    const hexColor = hslToHex(hsl.h, hsl.s, Math.min(100, hsl.l + amount));

    if (alphaValue !== undefined) {
      return alpha(alphaValue, hexColor);
    }

    return hexColor;
  };

  /**
   * 将颜色变暗
   * @param amount
   * @param color
   * @param alphaValue
   * @returns
   */
  const darken = (amount: number, color?: string, alphaValue?: number) => {
    const actualColor = color || currentMainColoc.value;
    const hsl = hexToHSL(actualColor);
    const hexColor = hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - amount));

    // 如果提供了透明度参数，应用透明度
    if (alphaValue !== undefined) {
      return alpha(alphaValue, hexColor);
    }

    return hexColor;
  };

  const applyPrimaryColor = (color: string, fallback: string = "#1ab394") => {
    const root = document.documentElement;

    const hex = toHex(color, fallback);
    root.style.setProperty("--ui-color-primary-500", hex);
    root.style.setProperty("--el-color-primary", hex);

    try {
      const c400 = lighten(8, hex);
      const c600 = darken(8, hex);
      const c700 = darken(14, hex);
      const c300 = lighten(16, hex);
      root.style.setProperty("--ui-color-primary-300", c300);
      root.style.setProperty("--ui-color-primary-400", c400);
      root.style.setProperty("--ui-color-primary-600", c600);
      root.style.setProperty("--ui-color-primary-700", c700);

      root.style.setProperty("--el-color-primary-light-3", lighten(30, hex));
      root.style.setProperty("--el-color-primary-light-5", lighten(50, hex));
      root.style.setProperty("--el-color-primary-light-7", lighten(70, hex));
      root.style.setProperty("--el-color-primary-light-8", lighten(80, hex));
      root.style.setProperty("--el-color-primary-light-9", lighten(90, hex));
      root.style.setProperty("--el-color-primary-dark-2", darken(20, hex));
    } catch {}

    return hex;
  };

  return {
    darken,
    lighten,
    alpha,
    toHex,
    hexToRgb,
    rgbToHex,
    applyPrimaryColor,
    setCurrentMainColor
  };
};

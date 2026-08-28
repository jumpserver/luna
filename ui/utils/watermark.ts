export { interpolateWatermark } from "#online-player/utils/watermark";

export interface WatermarkTemplateSettings {
  SECURITY_WATERMARK_CONSOLE_CONTENT?: string;
  SECURITY_WATERMARK_SESSION_CONTENT?: string;
}

export function resolveWatermarkTemplate(settings: WatermarkTemplateSettings) {
  const consoleContent = String(settings.SECURITY_WATERMARK_CONSOLE_CONTENT || "").trim();
  if (consoleContent) return consoleContent;
  return String(settings.SECURITY_WATERMARK_SESSION_CONTENT || "");
}

export function isWatermarkSettingEnabled(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function shouldShowAppWatermark(params: { loggedIn: boolean; enabled: boolean; path: string }) {
  if (!params.loggedIn || !params.enabled) return false;
  return !params.path.includes("/replay/");
}

export function buildWatermarkViewer(name?: string, username?: string) {
  const displayName = name?.trim() || "";
  const displayUsername = username?.trim() || "";
  if (displayName) return displayUsername ? `${displayName}(${displayUsername})` : displayName;
  return displayUsername;
}

const APP_WATERMARK_MAX_ALPHA = 0.1;

function clampAlpha(alpha: number, maxAlpha = APP_WATERMARK_MAX_ALPHA) {
  if (!Number.isFinite(alpha) || alpha < 0) return maxAlpha;
  return Math.min(alpha, maxAlpha);
}

function hexByte(part: string) {
  return Number.parseInt(part.length === 1 ? `${part}${part}` : part, 16);
}

export function softenWatermarkColor(color: string, maxAlpha = APP_WATERMARK_MAX_ALPHA) {
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

import DOMPurify from "dompurify";
import { marked } from "marked";

export function renderAiMarkdown(source: string) {
  const html = marked.parse(source, { async: false, breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html);
}

export function formatAiDuration(value: unknown) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1)} s`;
}

export function aiRiskColor(level: number): "error" | "warning" | "info" | "success" {
  if (level >= 4) return "error";
  if (level >= 3) return "warning";
  if (level >= 2) return "info";
  return "success";
}

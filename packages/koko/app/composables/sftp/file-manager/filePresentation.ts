import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import prettyBytes from "pretty-bytes";

export function formatSftpFileSize(value: string): string {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? prettyBytes(bytes) : value || "—";
}

export function formatSftpModifiedTime(value: string): string {
  if (!value) return "—";
  const timestamp = Number(value);
  const date = Number.isFinite(timestamp)
    ? new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp)
    : new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;

  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

export function resolveSftpFileType(entry: SftpFileEntry, labels: { folder: string; file: string }): string {
  if (entry.is_dir) return labels.folder;

  const normalizedName = entry.name.toLowerCase();
  const extension =
    normalizedName.startsWith(".") && !normalizedName.slice(1).includes(".")
      ? normalizedName.slice(1)
      : normalizedName.includes(".")
        ? normalizedName.split(".").at(-1) || ""
        : "";
  if (extension) return extension;

  const serverType = entry.type?.trim().replace(/^\./, "").toLowerCase();
  if (serverType && !["file", "regular"].includes(serverType)) return serverType;
  return labels.file;
}

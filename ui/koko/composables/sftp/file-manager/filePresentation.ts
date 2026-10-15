import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

export type SftpFileSortColumn = "name" | "mod_time" | "size" | "type";

const sizeUnits = ["B", "KB", "MB", "GB", "TB"];
const entryNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function fileModifiedTimestamp(value: string): number {
  if (!value.trim()) return NaN;
  const timestamp = Number(value);
  return Number.isFinite(timestamp)
    ? timestamp < 1_000_000_000_000
      ? timestamp * 1000
      : timestamp
    : Date.parse(value);
}

export function sortFileEntries(
  entries: SftpFileEntry[],
  column: SftpFileSortColumn,
  order: "asc" | "desc"
): SftpFileEntry[] {
  const direction = order === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    if (left.name === ".." || right.name === "..") return Number(right.name === "..") - Number(left.name === "..");
    if (left.is_dir !== right.is_dir) return left.is_dir ? -1 : 1;
    const nameOrder = entryNameCollator.compare(left.name, right.name);
    if (column === "name") return nameOrder * direction;
    if (column === "size" && left.is_dir) return nameOrder;
    if (column === "type") {
      const leftType = resolveSftpFileType(left, { folder: "", file: "" });
      const rightType = resolveSftpFileType(right, { folder: "", file: "" });
      if (Boolean(leftType) !== Boolean(rightType)) return leftType ? -1 : 1;
      return entryNameCollator.compare(leftType, rightType) * direction || nameOrder;
    }
    const leftValue =
      column === "size" ? (left.size.trim() ? Number(left.size) : NaN) : fileModifiedTimestamp(left.mod_time);
    const rightValue =
      column === "size" ? (right.size.trim() ? Number(right.size) : NaN) : fileModifiedTimestamp(right.mod_time);
    const leftMissing = !Number.isFinite(leftValue);
    const rightMissing = !Number.isFinite(rightValue);
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    return (leftMissing ? 0 : (leftValue - rightValue) * direction) || nameOrder;
  });
}

export function formatSftpFileSize(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return value || "—";
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < sizeUnits.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || amount >= 10 ? 0 : 1;
  return `${Number(amount.toFixed(digits))} ${sizeUnits[unit]}`;
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

import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

/** Extension → Lucide icon name (Nuxt Icon `i-lucide-*`). */
const SFTP_FILE_ICON_BY_EXTENSION: Record<string, string> = {
  // archives
  "7z": "i-lucide-file-archive",
  bz2: "i-lucide-file-archive",
  gz: "i-lucide-file-archive",
  rar: "i-lucide-file-archive",
  tar: "i-lucide-file-archive",
  tgz: "i-lucide-file-archive",
  xz: "i-lucide-file-archive",
  zip: "i-lucide-file-archive",
  // documents
  csv: "i-lucide-file-spreadsheet",
  doc: "i-lucide-file-text",
  docx: "i-lucide-file-text",
  md: "i-lucide-file-text",
  markdown: "i-lucide-file-text",
  odt: "i-lucide-file-text",
  pdf: "i-lucide-file-text",
  rtf: "i-lucide-file-text",
  txt: "i-lucide-file-text",
  xls: "i-lucide-file-spreadsheet",
  xlsx: "i-lucide-file-spreadsheet",
  // images
  bmp: "i-lucide-image",
  gif: "i-lucide-image",
  ico: "i-lucide-image",
  jpeg: "i-lucide-image",
  jpg: "i-lucide-image",
  png: "i-lucide-image",
  svg: "i-lucide-image",
  webp: "i-lucide-image",
  // media
  aac: "i-lucide-file-audio",
  avi: "i-lucide-file-video",
  flac: "i-lucide-file-audio",
  m4a: "i-lucide-file-audio",
  mkv: "i-lucide-file-video",
  mov: "i-lucide-file-video",
  mp3: "i-lucide-file-audio",
  mp4: "i-lucide-file-video",
  ogg: "i-lucide-file-audio",
  wav: "i-lucide-file-audio",
  webm: "i-lucide-file-video",
  // code / config
  bash: "i-lucide-terminal",
  c: "i-lucide-file-code",
  conf: "i-lucide-settings-2",
  cpp: "i-lucide-file-code",
  css: "i-lucide-palette",
  env: "i-lucide-settings-2",
  go: "i-lucide-file-code",
  h: "i-lucide-file-code",
  hpp: "i-lucide-file-code",
  html: "i-lucide-globe",
  ini: "i-lucide-settings-2",
  java: "i-lucide-file-code",
  js: "i-lucide-braces",
  json: "i-lucide-braces",
  jsx: "i-lucide-braces",
  less: "i-lucide-palette",
  php: "i-lucide-file-code",
  py: "i-lucide-file-code",
  rb: "i-lucide-file-code",
  rs: "i-lucide-file-code",
  scss: "i-lucide-palette",
  sh: "i-lucide-terminal",
  sql: "i-lucide-database",
  toml: "i-lucide-settings-2",
  ts: "i-lucide-braces",
  tsx: "i-lucide-braces",
  vue: "i-lucide-component",
  xml: "i-lucide-file-code",
  yaml: "i-lucide-file-text",
  yml: "i-lucide-file-text",
  zsh: "i-lucide-terminal",
  // certificates / keys
  crt: "i-lucide-shield-check",
  csr: "i-lucide-shield-check",
  key: "i-lucide-key-round",
  pem: "i-lucide-shield-check",
  pfx: "i-lucide-shield-check",
  // packages / binaries
  apk: "i-lucide-package",
  deb: "i-lucide-package",
  dmg: "i-lucide-hard-drive",
  exe: "i-lucide-app-window",
  iso: "i-lucide-disc-3",
  msi: "i-lucide-package",
  rpm: "i-lucide-package",
  // logs / locks / sockets
  log: "i-lucide-scroll-text",
  lock: "i-lucide-lock-keyhole",
  sock: "i-lucide-plug-zap"
};

const DEFAULT_FILE_ICON = "i-lucide-file";
const DIRECTORY_ICON = "i-lucide-folder";
const PARENT_DIRECTORY_ICON = "i-lucide-folder-up";

export function resolveSftpFileExtension(name: string): string {
  const normalized = name.toLowerCase();
  if (!normalized || normalized === "." || normalized === "..") return "";
  // compound archives: .tar.gz, .tar.bz2, …
  if (normalized.endsWith(".tar.gz") || normalized.endsWith(".tgz")) return "tgz";
  if (normalized.endsWith(".tar.bz2") || normalized.endsWith(".tbz2")) return "bz2";
  if (normalized.endsWith(".tar.xz")) return "xz";
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0 || dot === normalized.length - 1) return "";
  return normalized.slice(dot + 1);
}

/**
 * Map an SFTP entry to a Lucide icon name for file lists.
 * Pure helper; wrap with `useSftpFileIcon()` when used from Vue components.
 */
export function resolveSftpFileIcon(entry: Pick<SftpFileEntry, "name" | "is_dir"> & { type?: string }): string {
  if (entry.name === "..") return PARENT_DIRECTORY_ICON;
  if (entry.is_dir) return DIRECTORY_ICON;

  const extension = resolveSftpFileExtension(entry.name);
  if (extension && SFTP_FILE_ICON_BY_EXTENSION[extension]) {
    return SFTP_FILE_ICON_BY_EXTENSION[extension]!;
  }

  const serverType = entry.type?.trim().replace(/^\./, "").toLowerCase();
  if (serverType && SFTP_FILE_ICON_BY_EXTENSION[serverType]) {
    return SFTP_FILE_ICON_BY_EXTENSION[serverType]!;
  }

  return DEFAULT_FILE_ICON;
}

export function useSftpFileIcon() {
  return {
    resolveSftpFileIcon,
    resolveSftpFileExtension,
    iconByExtension: SFTP_FILE_ICON_BY_EXTENSION,
    defaultFileIcon: DEFAULT_FILE_ICON
  };
}

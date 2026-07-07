export { BASE_URL, BASE_WS_URL } from "./base";

const readCookie = (name: string) => {
  if (!import.meta.client) return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : "";
};

const browserLang = import.meta.client
  ? navigator.language || (navigator.languages && navigator.languages[0]) || "en"
  : "en";

export const LanguageCode = readCookie("django_language") || readCookie("lang") || browserLang || "en";
export const ThemeCode = import.meta.client ? localStorage.getItem("themeType") || "default" : "default";

export const MaxTimeout = 30 * 1000;

export const MAX_TRANSFER_SIZE = 1024 * 1024 * 500;

export const defaultTheme = {
  background: '#121414',
  foreground: '#ffffff',
  black: '#2e3436',
  red: '#cc0000',
  green: '#4e9a06',
  yellow: '#c4a000',
  blue: '#3465a4',
  magenta: '#75507b',
  cyan: '#06989a',
  white: '#d3d7cf',
  brightBlack: '#555753',
  brightRed: '#ef2929',
  brightGreen: '#8ae234',
  brightYellow: '#fce94f',
  brightBlue: '#729fcf',
  brightMagenta: '#ad7fa8',
  brightCyan: '#34e2e2',
  brightWhite: '#eeeeec',
};

// 图片类型的
export const FILE_SUFFIX_IMAGE = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'ico',
  'svg',
  'heic',
  'heif',
];
// 音频类型的
export const FILE_SUFFIX_AUDIO = [
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'm4b',
  'm4p',
  'm4b',
  'm4p',
  'm4b',
  'm4p',
];
// 视频类型的
export const FILE_SUFFIX_VIDEO = [
  'mp4',
  'avi',
  'mov',
  'wmv',
  'flv',
  'mpeg',
  'mpg',
  'm4v',
  'mkv',
  'webm',
  'vob',
  'm2ts',
  'mts',
  'ts',
  'm2t',
  'm2ts',
  'mts',
  'ts',
  'm2t',
  'm2ts',
];
// 压缩包类型的
export const FILE_SUFFIX_COMPRESSION = [
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'iso',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'msi',
  'exe',
  'app',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'msi',
  'exe',
  'app',
];
// 文档类型的
export const FILE_SUFFIX_DOCUMENT = [
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'pdf',
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'config',
  'log',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'config',
  'log',
  'lock',
  'sock',
];
// 代码类型的
export const FILE_SUFFIX_CODE = [
  'js',
  'ts',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'css',
  'html',
  'php',
  'ruby',
  'go',
  'rust',
  'swift',
  'kotlin',
  'dart',
  'scala',
  'haskell',
  'erlang',
  'elixir',
  'ocaml',
  'erlang',
  'elixir',
  'ocaml',
  'erlang',
  'elixir',
  'ocaml',
  'erlang',
  'elixir',
  'ocaml',
];
// 安装包类型的
export const FILE_SUFFIX_INSTALL = [
  'deb',
  'rpm',
  'msi',
  'exe',
  'app',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'msi',
  'exe',
  'app',
];
// 数据库类型
export const FILE_SUFFIX_DATABASE = [
  'mysql',
  'oracle',
  'postgresql',
  'sqlserver',
  'mongodb',
  'redis',
  'memcached',
  'sqlite',
  'mariadb',
];

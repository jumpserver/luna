import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const METHODS = ["log", "info", "warn", "error", "debug"] as const;

export type DebugLogLevel = (typeof METHODS)[number];

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_FILE_NAME = "jumpserver-debug.log";

type ConsoleLike = Pick<Console, DebugLogLevel>;

export function formatDebugLogArg(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatDebugLogLine(source: string, level: string, args: unknown[]) {
  const time = new Date().toISOString();
  return `${time} [${source}] [${level}] ${args.map(formatDebugLogArg).join(" ")}`;
}

export function parsePersistedDebugLogEnabled(raw: string) {
  try {
    return Boolean(JSON.parse(raw)?.state?.debugLog);
  } catch {
    return false;
  }
}

let activeDebugLogService: DebugLogService | null = null;
let infoEnabled = false;

export function activateDebugLogService(service: DebugLogService) {
  activeDebugLogService = service;
  infoEnabled = service.isEnabled;
}

function emitElectronLog(level: DebugLogLevel, message: string, extra?: unknown) {
  if (level !== "warn" && level !== "error" && !infoEnabled) return;
  if (extra === undefined) console[level](`[electron] ${message}`);
  else console[level](`[electron] ${message}`, extra);
}

export const electronLog = {
  info: (message: string, extra?: unknown) => emitElectronLog("info", message, extra),
  warn: (message: string, extra?: unknown) => emitElectronLog("warn", message, extra),
  error: (message: string, extra?: unknown) => emitElectronLog("error", message, extra)
};

export class DebugLogService {
  readonly filePath: string;
  private enabled = false;
  private hooked = false;
  private lines: string[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly originalConsole: Partial<Record<DebugLogLevel, (...args: unknown[]) => void>> = {};
  private readonly maxLines: number;
  private readonly consoleRef: ConsoleLike;
  private readonly source: string;

  constructor(options: {
    logsDir: string;
    fileName?: string;
    maxLines?: number;
    console?: ConsoleLike;
    source?: string;
  }) {
    this.filePath = path.join(options.logsDir, options.fileName || DEFAULT_FILE_NAME);
    this.maxLines = options.maxLines || DEFAULT_MAX_LINES;
    this.consoleRef = options.console || console;
    this.source = options.source || "electron";
  }

  get isEnabled() {
    return this.enabled;
  }

  async initialize() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const existing = await readFile(this.filePath, "utf8").catch(() => "");
    this.lines = existing.split(/\r?\n/).filter(Boolean).slice(-this.maxLines);
  }

  setEnabled(enabled: boolean) {
    this.enabled = Boolean(enabled);
    if (this.enabled) this.hookConsole();
    else this.unhookConsole();
    if (activeDebugLogService === this) infoEnabled = this.enabled;
  }

  record(level: string, args: unknown[]) {
    if (!this.enabled) return;
    const line = formatDebugLogLine(this.source, level, args);
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
      this.enqueue(() => writeFile(this.filePath, `${this.lines.join("\n")}\n`));
      return;
    }
    this.enqueue(() => appendFile(this.filePath, `${line}\n`));
  }

  read() {
    return this.lines.join("\n");
  }

  async clear() {
    this.lines = [];
    this.enqueue(() => writeFile(this.filePath, ""));
    await this.flush();
  }

  async flush() {
    await this.writeQueue;
  }

  private hookConsole() {
    if (this.hooked) return;
    this.hooked = true;
    for (const method of METHODS) {
      const original = this.consoleRef[method]?.bind(this.consoleRef) || (() => undefined);
      this.originalConsole[method] = original;
      this.consoleRef[method] = (...args: unknown[]) => {
        original(...args);
        this.record(method, args);
      };
    }
  }

  private unhookConsole() {
    if (!this.hooked) return;
    for (const method of METHODS) {
      const original = this.originalConsole[method];
      if (original) this.consoleRef[method] = original;
    }
    this.hooked = false;
  }

  private enqueue(task: () => Promise<void>) {
    this.writeQueue = this.writeQueue.then(task).catch(() => undefined);
  }
}

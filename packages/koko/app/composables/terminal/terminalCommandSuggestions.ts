import type { ConnectorTerminalProfile } from "@jumpserver/connectors-core";
import type { KokoTerminalCommandProfile } from "@jumpserver/koko/host";

export interface TerminalCommandSuggestion {
  command: string;
  source: "history" | "catalog";
}

const CATALOGS: Record<KokoTerminalCommandProfile, string[]> = {
  linux: [
    "ls",
    "lsblk",
    "lsof",
    "cd",
    "pwd",
    "cat",
    "less",
    "head",
    "tail",
    "grep",
    "find",
    "cp",
    "mv",
    "rm",
    "mkdir",
    "touch",
    "chmod",
    "chown",
    "ps",
    "top",
    "df",
    "du",
    "free",
    "uname",
    "whoami",
    "ip",
    "ping",
    "curl",
    "wget",
    "ssh",
    "scp",
    "tar",
    "systemctl",
    "journalctl",
    "docker",
    "kubectl",
    "git"
  ],
  windows: [
    "Get-ChildItem",
    "Get-Content",
    "Get-Process",
    "Get-Service",
    "Get-Location",
    "Set-Location",
    "Copy-Item",
    "Move-Item",
    "Remove-Item",
    "New-Item",
    "Select-String",
    "Test-Connection",
    "Resolve-DnsName",
    "Invoke-WebRequest",
    "dir",
    "cd",
    "type",
    "copy",
    "move",
    "del",
    "mkdir",
    "tasklist",
    "systeminfo",
    "ipconfig",
    "ping",
    "whoami"
  ],
  mysql: [
    "SELECT",
    "SHOW",
    "DESCRIBE",
    "EXPLAIN",
    "USE",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "SET",
    "START TRANSACTION",
    "COMMIT",
    "ROLLBACK",
    "source",
    "status",
    "help",
    "quit"
  ],
  postgresql: [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "EXPLAIN",
    "SET",
    "SHOW",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "\\d",
    "\\dt",
    "\\l",
    "\\c",
    "\\x",
    "\\timing",
    "\\q"
  ],
  redis: [
    "GET",
    "SET",
    "DEL",
    "EXISTS",
    "EXPIRE",
    "TTL",
    "KEYS",
    "SCAN",
    "TYPE",
    "MGET",
    "MSET",
    "HGET",
    "HSET",
    "HGETALL",
    "LPUSH",
    "LRANGE",
    "SADD",
    "SMEMBERS",
    "ZADD",
    "ZRANGE",
    "INFO",
    "MONITOR",
    "AUTH",
    "SELECT",
    "QUIT"
  ],
  mongodb: [
    "show dbs",
    "show collections",
    "use",
    "db.getCollectionNames",
    "db.createCollection",
    "db.dropDatabase",
    "db.stats",
    "db.runCommand",
    "help",
    "exit"
  ],
  oracle: [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "DESCRIBE",
    "EXPLAIN PLAN",
    "SET",
    "SHOW",
    "COMMIT",
    "ROLLBACK",
    "CONNECT",
    "SPOOL",
    "@",
    "EXIT"
  ],
  sqlserver: [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "EXEC",
    "DECLARE",
    "SET",
    "USE",
    "BEGIN TRANSACTION",
    "COMMIT",
    "ROLLBACK",
    "GO",
    ":r",
    ":setvar",
    "QUIT"
  ]
};

const CASE_INSENSITIVE_PROFILES = new Set<KokoTerminalCommandProfile>([
  "windows",
  "mysql",
  "postgresql",
  "redis",
  "mongodb",
  "oracle",
  "sqlserver"
]);

export function resolveTerminalCommandProfile(profile: ConnectorTerminalProfile = {}): KokoTerminalCommandProfile {
  const protocol = String(profile.protocol || "").toLowerCase();
  if (protocol === "mariadb" || protocol === "mysql") return "mysql";
  if (protocol === "pg" || protocol === "postgres" || protocol === "postgresql") return "postgresql";
  if (["redis", "mongodb", "oracle", "sqlserver"].includes(protocol)) {
    return protocol as KokoTerminalCommandProfile;
  }
  const platform =
    `${profile.assetPlatform || ""} ${profile.assetType || ""} ${profile.assetCategory || ""}`.toLowerCase();
  return /windows|winserver|powershell/.test(platform) ? "windows" : "linux";
}

function candidateForTypedCase(command: string, prefix: string, profile: KokoTerminalCommandProfile) {
  if (!CASE_INSENSITIVE_PROFILES.has(profile)) return command;
  if (prefix === prefix.toLowerCase()) return command.toLowerCase();
  if (prefix === prefix.toUpperCase()) return command.toUpperCase();
  return command;
}

export function getTerminalCommandSuggestions(
  profile: KokoTerminalCommandProfile,
  prefix: string,
  history: string[]
): TerminalCommandSuggestion[] {
  if (!prefix) return [];
  const insensitive = CASE_INSENSITIVE_PROFILES.has(profile);
  const normalizedPrefix = insensitive ? prefix.toLowerCase() : prefix;
  const seen = new Set<string>();
  const result: TerminalCommandSuggestion[] = [];

  for (const [source, commands] of [
    ["history", history],
    ["catalog", CATALOGS[profile]]
  ] as const) {
    for (const rawCommand of commands) {
      const command = source === "catalog" ? candidateForTypedCase(rawCommand, prefix, profile) : rawCommand;
      const normalized = insensitive ? command.toLowerCase() : command;
      if (!normalized.startsWith(normalizedPrefix) || normalized === normalizedPrefix || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push({ command, source });
    }
  }
  return result;
}

const SENSITIVE_COMMAND_PATTERNS = [
  /(?:^|[^a-z0-9])(?:password|passwd|token|secret|api[_-]?key|authorization)(?:[^a-z0-9]|$)/i,
  /(?:^|\s)--?(?:password|passwd|token|secret|api[_-]?key)(?:=|\s)/i,
  /(?:https?|ssh):\/\/[^\s/@:]+:[^\s/@]+@/i,
  /\b(?:MYSQL_PWD|PGPASSWORD|REDISCLI_AUTH|AWS_SECRET_ACCESS_KEY|AZURE_CLIENT_SECRET)\s*=/i,
  /(?:^|\s)-u\s*[^\s:]+:[^\s]+/i,
  /(?:^|\s)-p[^\s]+/i
];

function isControlCharacter(value: string) {
  const code = value.codePointAt(0) || 0;
  return code < 32 || code === 127;
}

export function isSafeTerminalCommandHistory(command: string) {
  return (
    command.length > 0 &&
    command.length <= 512 &&
    !Array.from(command).some(isControlCharacter) &&
    !SENSITIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
  );
}

export function terminalCommandSuggestionKeyAction(key: string, open: boolean) {
  if (!open) return null;
  if (key === "ArrowDown") return "next" as const;
  if (key === "ArrowUp") return "previous" as const;
  if (key === "Tab") return "accept" as const;
  if (key === "Escape") return "close" as const;
  return null;
}

export class TerminalCommandInputTracker {
  line = "";
  valid = true;

  get prefix() {
    if (!this.valid) return "";
    return this.line.match(/^\s*([^\s]*)$/)?.[1] || "";
  }

  accept(command: string) {
    const prefix = this.prefix;
    if (!prefix || command.length <= prefix.length) return "";
    const suffix = command.slice(prefix.length);
    this.line += suffix;
    return suffix;
  }

  handleData(data: string): { submitted?: string; changed: boolean } {
    if (data === "\r" || data === "\n") {
      const submitted = this.valid ? this.line.trim() : "";
      this.reset();
      return { submitted, changed: true };
    }
    if (data === "\x7f" || data === "\b") {
      if (this.valid) this.line = this.line.slice(0, -1);
      return { changed: true };
    }
    if (data === "\x15") {
      this.line = "";
      this.valid = true;
      return { changed: true };
    }
    if (Array.from(data).length === 1 && !isControlCharacter(data)) {
      if (this.valid) this.line += data;
      return { changed: true };
    }
    this.valid = false;
    return { changed: true };
  }

  reset() {
    this.line = "";
    this.valid = true;
  }
}

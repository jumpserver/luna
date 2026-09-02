import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { electronLog } from "../shared/debug-log";

const execFileAsync = promisify(execFile);
let cachedFonts;

function normalizeFamilies(values: unknown[]) {
  return [
    ...new Set(values.map((value) => String(value).trim()).filter((value) => value && !value.startsWith(".")))
  ].sort((left, right) => left.localeCompare(right));
}

function parseJsonOutput(output: string) {
  try {
    return JSON.parse(output);
  } catch (cause) {
    throw new Error("System font command returned invalid JSON", { cause });
  }
}

async function macOSFonts() {
  const script =
    'ObjC.import("AppKit"); JSON.stringify($.NSFontManager.sharedFontManager.availableFontFamilies.js.map(ObjC.unwrap))';
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024
  });
  return parseJsonOutput(stdout);
}

async function linuxFonts() {
  const { stdout } = await execFileAsync("fc-list", ["--format=%{family}\n"], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024
  });
  return stdout.split("\n").flatMap((line) => line.split(","));
}

async function windowsFonts() {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$fonts = New-Object System.Drawing.Text.InstalledFontCollection",
    "$fonts.Families | ForEach-Object { $_.Name } | ConvertTo-Json -Compress"
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024
  });
  const parsed = parseJsonOutput(stdout || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function listSystemFonts() {
  cachedFonts ||= (async () => {
    try {
      const values =
        process.platform === "darwin"
          ? await macOSFonts()
          : process.platform === "win32"
            ? await windowsFonts()
            : await linuxFonts();
      return normalizeFamilies(values);
    } catch (error) {
      electronLog.warn("unable to enumerate system fonts", error);
      return [];
    }
  })();
  return cachedFonts;
}

export const systemFontInternals = { normalizeFamilies };

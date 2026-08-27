import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let cachedFonts;

function normalizeFamilies(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter((value) => value && !value.startsWith(".")))].sort(
    (left, right) => left.localeCompare(right)
  );
}

async function macOSFonts() {
  const script =
    'ObjC.import("AppKit"); JSON.stringify($.NSFontManager.sharedFontManager.availableFontFamilies.js.map(ObjC.unwrap))';
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024
  });
  return JSON.parse(stdout);
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
  const parsed = JSON.parse(stdout || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function listSystemFonts() {
  cachedFonts ||= (async () => {
    try {
      const values = process.platform === "darwin" ? await macOSFonts() : process.platform === "win32" ? await windowsFonts() : await linuxFonts();
      return normalizeFamilies(values);
    } catch (error) {
      console.warn("[electron] unable to enumerate system fonts:", error);
      return [];
    }
  })();
  return cachedFonts;
}

export const systemFontInternals = { normalizeFamilies };

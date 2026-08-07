import type { Terminal } from "@xterm/xterm";

import type { ILunaConfig } from "#koko/types";
import { buildJSONEnvelope, buildTerminalInput, ENVELOPE_TERMINAL_COMMAND } from "#koko/composables/terminal/envelope";
import { AsciiBackspace, AsciiCtrlC, AsciiCtrlZ, AsciiDel } from "#koko/utils/config";

export function formatMessage(id: string | number, type: string, data: unknown) {
  const terminalId = Number(id) || 0;
  if (type === "TERMINAL_DATA") {
    return buildTerminalInput(terminalId, typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer));
  }

  return buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
    terminalId,
    command: type,
    params: {
      id: String(id || ""),
      type,
      data,
      terminalId
    },
    timestamp: Date.now()
  });
}

export function writeBufferToTerminal(
  enableZmodem: boolean,
  zmodemStatus: boolean,
  terminal: Terminal | null,
  data: ArrayBuffer | Uint8Array,
  reportError: (options: { title: string }) => void,
  zmodemBlockedTitle: string
) {
  if (!enableZmodem && zmodemStatus) {
    reportError({ title: zmodemBlockedTitle });
    return;
  }
  if (!terminal) return;
  terminal.write(new Uint8Array(data));
}

export function preprocessInput(data: string, config: Partial<ILunaConfig>) {
  if (config.backspaceAsCtrlH === "1" && data.charCodeAt(0) === AsciiDel) {
    data = String.fromCharCode(AsciiBackspace);
  }
  if (config.ctrlCAsCtrlZ === "1" && data.charCodeAt(0) === AsciiCtrlC) {
    data = String.fromCharCode(AsciiCtrlZ);
  }
  return data;
}

export function getXTerminalLineContent(index: number, terminal: Terminal) {
  const buffer = terminal.buffer.active;
  if (!buffer) return "";

  const result: string[] = [];
  let startLine = buffer.length - 1;

  while (result.length < index && startLine >= 0) {
    const line = buffer.getLine(startLine);
    const stripLine = line?.translateToString(true);
    startLine--;
    if (!stripLine) continue;
    result.unshift(stripLine);
  }

  return result.join("\n");
}

export function updateIcon(setting: { INTERFACE?: { favicon?: string } }) {
  const faviconURL = setting.INTERFACE?.favicon;
  if (!faviconURL) return;

  let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.type = "image/x-icon";
    link.rel = "shortcut icon";
    document.head.appendChild(link);
  }
  link.href = faviconURL;
}

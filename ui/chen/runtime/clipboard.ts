import { writeText as writeTauriText } from "@tauri-apps/plugin-clipboard-manager";
import { writeText as writeWebText } from "clipboard-polyfill";

import { isTauriRuntime } from "~/utils/runtime";

export interface ChenClipboardRuntime {
  isTauri: () => boolean
  writeWeb: (text: string) => Promise<unknown>
  writeTauri: (text: string) => Promise<unknown>
}

const defaultRuntime: ChenClipboardRuntime = {
  isTauri: isTauriRuntime,
  writeWeb: writeWebText,
  writeTauri: writeTauriText
};

export async function writeChenClipboardText(
  text: string,
  runtime: ChenClipboardRuntime = defaultRuntime
) {
  if (runtime.isTauri()) {
    await runtime.writeTauri(text);
    return;
  }
  await runtime.writeWeb(text);
}

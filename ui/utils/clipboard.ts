import { writeText as writeTauriText } from "@tauri-apps/plugin-clipboard-manager";
import { writeText as writeWebText } from "clipboard-polyfill";

import { isTauriRuntime } from "~/utils/runtime";

export async function writeClipboardText(text: string) {
  if (isTauriRuntime()) {
    await writeTauriText(text);
    return;
  }

  await writeWebText(text);
}
